from __future__ import annotations

import asyncio
import json
import random
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from blombo import cache_db, settings
from blombo.complete import tag_complete
from blombo.gallery import cache as gallery_cache
from blombo.generate import comfy
from blombo.models import hashes
from blombo.models import loras as lora_tags
from blombo.wildcards import wildcards as wildcard_tags
from blombo.paths import comfy_base
from .job_output import (
    _alloc_named,
    _file_index,
    _grid_fmt,
    _grid_values,
    _import_image,
    _import_preview,
    _maybe_grid,
    _template_name,
    _template_snapshot,
)
from .job_plan import (
    DEFAULTS,
    MAX_STORED_JOBS,
    PREVIEW_AFTER,
    PREVIEW_EVERY,
    _apply_auto_loras,
    _attach_lora_hashes,
    _generation_plan,
    _normalize_auto_loras,
    _prompt_matrix_config,
    _prompt_matrix_lines,
    _prompt_matrix_prompt,
    _public_loras,
    _resolve_auto_loras,
    _run_seed,
    _seed_after,
)


class LiveJob:
    def __init__(self, steps: int = 0, batch_count: int = 1) -> None:
        self.value = 0
        self.max = steps
        self.batch_i = 0
        self.batch_count = max(1, batch_count)
        self.preview: bytes | None = None
        self.latest: bytes | None = None
        self.snapshots: dict[int, bytes] = {}
        self.preview_rev = 0
        self.skip = False
        self.cancel = False
        self.preview_enabled, self.preview_every, self.preview_after, self.preview_last, self.preview_after_first = (
            _preview_opts()
        )


_live: dict[str, LiveJob] = {}
_live_lock = threading.Lock()
_tasks: set[asyncio.Task[None]] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _prune_jobs() -> None:
    rows = cache_db.query(
        "SELECT id FROM jobs WHERE status IN ('completed', 'failed', 'canceled') "
        "ORDER BY COALESCE(finished_at, created_at) DESC LIMIT ?",
        (MAX_STORED_JOBS,),
    )
    keep = {str(row["id"]) for row in rows}
    if not keep:
        return
    marks = ",".join("?" for _ in keep)
    cache_db.execute(
        "DELETE FROM jobs WHERE status IN ('completed', 'failed', 'canceled') "
        f"AND id NOT IN ({marks})",
        tuple(keep),
    )


def _record_output(job_id: str, values: dict[str, Any], ident: str, path: Path, kind: str) -> None:
    outputs = values.setdefault("outputs", [])
    if not isinstance(outputs, list):
        outputs = []
        values["outputs"] = outputs
    outputs.append({"id": ident, "path": str(path), "kind": kind, "created_at": _now()})
    cache_db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))


def _preview_first(every: int, after: int) -> int:
    every = max(1, every)
    after = max(1, after)
    extra = after % every
    return after if extra == 0 else after + (every - extra)


def _preview_opts() -> tuple[bool, int, int, bool, bool]:
    data = settings.load()
    enabled = True if "genPreview" not in data else bool(data.get("genPreview"))
    try:
        every = max(1, min(150, int(data.get("genPreviewEvery") or PREVIEW_EVERY)))
    except (TypeError, ValueError):
        every = PREVIEW_EVERY
    try:
        after = max(1, min(150, int(data.get("genPreviewAfter") or PREVIEW_AFTER)))
    except (TypeError, ValueError):
        after = PREVIEW_AFTER
    last = True if "genPreviewLast" not in data else bool(data.get("genPreviewLast"))
    after_first = True if "genPreviewAfterFirst" not in data else bool(data.get("genPreviewAfterFirst"))
    return enabled, every, after, last, after_first


def _clear_preview(live: LiveJob) -> None:
    live.preview = None
    live.latest = None
    live.snapshots.clear()


def _show_preview(live: LiveJob, data: bytes, step: int) -> None:
    live.preview = data
    live.snapshots[step] = data
    live.preview_rev += 1


def _keep_snapshot(live: LiveJob, step: int) -> bool:
    if step <= 0:
        return False
    if not live.preview_enabled:
        return False
    if live.preview_last and live.max and step == live.max:
        return True
    after = live.preview_every if live.preview_after_first and live.batch_i > 0 else live.preview_after
    if step < _preview_first(live.preview_every, after):
        return False
    return step % live.preview_every == 0


def _on_live(job_id: str, event: dict[str, Any]) -> None:
    if event.get("prompt_id"):
        cache_db.execute(
            "UPDATE jobs SET status = 'running', comfy_prompt_id = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
            (str(event["prompt_id"]), _now(), job_id),
        )
        return
    with _live_lock:
        live = _live.setdefault(job_id, LiveJob())
        if event.get("batch_i") is not None:
            live.batch_i = int(event["batch_i"])
        if event.get("batch_count") is not None:
            live.batch_count = max(1, int(event["batch_count"]))
        if event.get("max") is not None:
            live.max = int(event["max"])
        if event.get("value") is not None:
            live.value = int(event["value"])
            if live.latest and _keep_snapshot(live, live.value):
                _show_preview(live, live.latest, live.value)
        preview = event.get("preview")
        if isinstance(preview, (bytes, bytearray)) and preview:
            data = bytes(preview)
            live.latest = data
            if _keep_snapshot(live, live.value):
                _show_preview(live, data, live.value)


def _live_fields(job_id: str) -> dict[str, Any]:
    with _live_lock:
        live = _live.get(job_id)
        if not live:
            return {
                "progress": None,
                "job_progress": None,
                "has_preview": False,
                "preview_steps": [],
                "preview_batch": 0,
                "preview_rev": 0,
            }
        current_max = live.max or 0
        overall_max = live.batch_count * current_max
        overall_value = live.batch_i * current_max + live.value
        return {
            "progress": {"value": live.value, "max": live.max},
            "job_progress": {"value": overall_value, "max": overall_max},
            "has_preview": live.preview is not None,
            "preview_steps": sorted(live.snapshots),
            "preview_batch": live.batch_i,
            "preview_rev": live.preview_rev,
        }


def preview_bytes(job_id: str, step: int | None = None) -> bytes | None:
    with _live_lock:
        live = _live.get(job_id)
        if not live:
            return None
        if step is None:
            return live.preview
        return live.snapshots.get(step)


def preview_media(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    return "image/jpeg"



def _public_generation(row: Any) -> dict[str, Any]:
    try:
        params = json.loads(row["params_json"] or "{}")
    except (TypeError, json.JSONDecodeError):
        params = {}
    if not isinstance(params, dict):
        params = {}
    prompt = str(params.get("prompt_clip") or "")
    negative = str(params.get("negative_clip") or "")
    if not prompt:
        prompt = lora_tags.strip_tags(str(row["prompt"] or params.get("prompt") or ""))
    if not negative:
        negative = lora_tags.strip_tags(str(row["negative_prompt"] or params.get("negative_prompt") or ""))
    return {
        "id": row["id"],
        "prompt": prompt,
        "negative_prompt": negative,
        "seed": row["seed"],
        "width": row["width"],
        "height": row["height"],
        "checkpoint": str(row["checkpoint_name"] or params.get("checkpoint") or ""),
        "checkpoint_hash": str(params.get("model_hash") or ""),
        "steps": params.get("steps"),
        "cfg": params.get("cfg"),
        "sampler": str(params.get("sampler") or ""),
        "scheduler": str(params.get("scheduler") or ""),
        "loras": _public_loras(params.get("loras")),
        "workflow": str(params.get("workflow_id") or params.get("workflow") or ""),
        "template_id": str(params.get("template_id") or ""),
        "template_name": str(params.get("template_name") or params.get("template") or ""),
        "template_params": params.get("template_params")
        if isinstance(params.get("template_params"), dict)
        else {},
    }


def _row_job(row: Any) -> dict[str, Any]:
    payload = json.loads(row["payload_json"])
    outputs = payload.get("outputs")
    outputs = outputs if isinstance(outputs, list) else []
    public: list[dict[str, Any]] = []
    for output in outputs:
        if not isinstance(output, dict):
            continue
        item = gallery_cache.output_row(output)
        if item:
            public.append(_public_generation(item))
    grid = payload.get("grid_path")
    grids = payload.get("grid_paths")
    paths: list[str] = []
    if isinstance(grids, list):
        paths = [item for item in grids if isinstance(item, str) and Path(item).is_file()]
    elif isinstance(grid, str) and Path(grid).is_file():
        paths = [grid]
    data = {
        "id": row["id"],
        "status": row["status"],
        "mode": row["mode"],
        "payload": payload,
        "comfy_prompt_id": row["comfy_prompt_id"],
        "error": row["error"],
        "gallery_id": public[-1]["id"] if public else None,
        "gallery_ids": [item["id"] for item in public],
        "gallery": public,
        "has_grid": bool(paths),
        "grid_count": len(paths),
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }
    data.update(_live_fields(row["id"]))
    return data


def get_job(job_id: str) -> dict[str, Any] | None:
    row = cache_db.query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
    return _row_job(row) if row else None


def interrupt_job(job_id: str, mode: str) -> dict[str, Any] | None:
    job = get_job(job_id)
    if not job:
        return None
    if job["status"] not in {"queued", "running"}:
        return job
    with _live_lock:
        live = _live.get(job_id)
        if live:
            if mode == "cancel":
                live.cancel = True
            else:
                live.skip = True
    try:
        comfy.interrupt()
    except comfy.ComfyError:
        pass
    return get_job(job_id)


def latest_generation() -> dict[str, Any] | None:
    gallery_cache.sync()
    row = cache_db.query_one(
        "SELECT * FROM gallery_items WHERE asset_kind != 'grid' "
        "ORDER BY created_at DESC LIMIT 1"
    )
    if not row:
        return None
    return dict(row)


def _is_interrupted(path: str, params_json: str | None = None) -> bool:
    if params_json:
        try:
            packed = json.loads(params_json)
        except (TypeError, json.JSONDecodeError):
            packed = None
        if isinstance(packed, dict) and packed.get("interrupted"):
            return True
    return any(part.lower() == "interrupted" for part in Path(path).parts)


def create_job(body: dict[str, Any]) -> dict[str, Any]:
    if not comfy.reachable():
        raise comfy.ComfyError(
            "comfy_unreachable",
            f"ComfyUI is not running on {comfy_base()}.",
        )
    values = {**DEFAULTS, **{k: v for k, v in body.items() if v is not None}}
    values["workflow_id"] = str(values.get("workflow") or DEFAULTS["workflow"])
    values["template_id"] = str(values.get("template") or DEFAULTS["template"])
    seed = int(values["seed"])
    if seed < 0:
        seed = random.randint(0, 2**53 - 1)
        values["seed"] = seed
    values["batch_size"] = max(1, int(values.get("batch_size") or 1))
    values["batch_count"] = max(1, int(values.get("batch_count") or 1))
    values["prompt_matrix"] = _prompt_matrix_config(values.get("prompt_matrix"))
    values["auto_loras"] = _normalize_auto_loras(values.get("auto_loras"))
    matrix = values.get("prompt_matrix")
    values["batch_grid"] = bool(matrix["save_grid"]) if isinstance(matrix, dict) else bool(values.get("batch_grid", True))
    values["batch_grid_max"] = max(2, min(100, int(values.get("batch_grid_max") or 36)))
    values["batch_grid_quality"] = max(40, min(95, int(values.get("batch_grid_quality") or 85)))
    values["batch_grid_format"] = _grid_fmt(values.get("batch_grid_format"))
    values["batch_grid_rows"] = max(0, min(25, int(values.get("batch_grid_rows") or 0)))
    values["batch_grid_fill"] = bool(values.get("batch_grid_fill", False))
    values["batch_grid_on_cancel"] = bool(values.get("batch_grid_on_cancel", True))
    values["save_interrupted"] = bool(values.get("save_interrupted", True))
    values["interrupted_in_grid"] = bool(values.get("interrupted_in_grid", False))
    values["template"] = _template_name(values)
    values["template_name"] = values["template"]
    values["template_params"] = _template_snapshot(values)["params"]
    values["prompt"] = str(body.get("prompt") or "")
    values["negative_prompt"] = str(body.get("negative_prompt") or "")
    values["outputs"] = []
    job_id = str(uuid.uuid4())
    cache_db.execute(
        """
        INSERT INTO jobs (id, status, mode, payload_json, created_at)
        VALUES (?, 'queued', 'txt2img', ?, ?)
        """,
        (job_id, json.dumps(values), _now()),
    )
    with _live_lock:
        _live.clear()
        matrix_lines, matrix_count, _ = _generation_plan(values)
        _live[job_id] = LiveJob(int(values["steps"]), len(matrix_lines) * matrix_count)
    _prune_jobs()
    task = asyncio.create_task(run_job(job_id, values))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    job = get_job(job_id)
    assert job is not None
    return job


async def run_job(job_id: str, values: dict[str, Any]) -> None:
    try:
        mode = _seed_after(values)
        matrix_lines, batch_count, batch_size = _generation_plan(values)
        matrix = values.get("prompt_matrix")
        matrix_active = isinstance(matrix, dict) and bool(matrix.get("lines"))
        total_batch_count = len(matrix_lines) * batch_count
        base_seed = int(values["seed"])
        prompt_id = ""
        saved: list[Path] = []
        had_image = False
        started = time.monotonic()
        canceled = False
        missing_wildcards: list[str] = []
        missing_loras: list[str] = []
        row = await asyncio.to_thread(hashes.checkpoint_hashes, str(values.get("checkpoint") or ""))
        values["model_hash"] = row.get("autov2") or ""
        values["model_hashes"] = row
        for matrix_i, matrix_line in enumerate(matrix_lines):
            for batch_i in range(batch_count):
                run_i = matrix_i * batch_count + batch_i
                with _live_lock:
                    live = _live.get(job_id)
                    if live and live.cancel:
                        canceled = True
                        break
                    if live:
                        live.skip = False
                        live.batch_i = run_i
                        live.value = 0

                run_values = {
                    **values,
                    "prompt": _prompt_matrix_prompt(str(values.get("prompt") or ""), matrix_line)
                    if matrix_active
                    else str(values.get("prompt") or ""),
                    "seed": _run_seed(mode, base_seed, run_i),
                    "batch_size": batch_size,
                }
                rng = random.Random(int(run_values["seed"]))
                wildcard_tags.apply(run_values, rng)
                expanded_prompt = str(run_values.get("prompt_expanded") or run_values.get("prompt") or "")
                run_values["prompt"] = expanded_prompt
                run_values["negative_prompt"] = str(
                    run_values.get("negative_prompt_expanded") or run_values.get("negative_prompt") or ""
                )
                auto_loras, auto_missing = await asyncio.to_thread(_resolve_auto_loras, run_values.get("auto_loras"))
                _apply_auto_loras(run_values, auto_loras, auto_missing)
                if run_i == 0:
                    tag_complete.record(
                        str(values.get("prompt") or ""),
                        str(values.get("negative_prompt") or ""),
                        [run_values["prompt"], run_values["negative_prompt"]],
                    )
                grew = False
                for name in run_values.get("wildcard_missing") or []:
                    if name not in missing_wildcards:
                        missing_wildcards.append(name)
                        grew = True
                for name in run_values.get("lora_missing") or []:
                    if name not in missing_loras:
                        missing_loras.append(name)
                        grew = True
                if grew:
                    values["wildcard_missing"] = missing_wildcards
                    values["lora_missing"] = missing_loras
                    cache_db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))

                def on_event(event: dict[str, Any], batch_i: int = run_i) -> None:
                    _on_live(job_id, {**event, "batch_i": batch_i, "batch_count": total_batch_count})

                graph = comfy.fill_txt2img({**run_values, "filename_prefix": f"blombo/{job_id}-{run_i}"})
                _attach_lora_hashes(run_values)
                prompt_id, images = await asyncio.to_thread(
                    comfy.run_prompt,
                    graph,
                    f"{job_id}-{run_i}",
                    on_event,
                )
                cache_db.execute(
                    "UPDATE jobs SET status = 'running', comfy_prompt_id = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
                    (prompt_id, _now(), job_id),
                )
                with _live_lock:
                    live = _live.get(job_id)
                    skip = bool(live and live.skip)
                    preview = b""
                    if live:
                        if live.latest:
                            preview = bytes(live.latest)
                        elif live.preview:
                            preview = bytes(live.preview)
                        elif live.snapshots:
                            preview = bytes(live.snapshots[max(live.snapshots)])
                    if live and live.cancel:
                        canceled = True
                    if live and (skip or canceled):
                        live.skip = False
                        _clear_preview(live)
                if (skip or canceled) and preview and values.get("save_interrupted", True):
                    gen_id, path = await asyncio.to_thread(_import_preview, job_id, run_values, preview, graph)
                    _record_output(job_id, values, gen_id, path, "interrupted")
                    had_image = True
                    if values.get("interrupted_in_grid", False):
                        saved.append(path)
                if canceled:
                    break
                if skip:
                    continue
                for info in images:
                    gen_id, path = await asyncio.to_thread(_import_image, job_id, run_values, info, graph)
                    _record_output(job_id, values, gen_id, path, "image")
                    had_image = True
                    saved.append(path)
            if canceled:
                break
        values["duration_ms"] = int((time.monotonic() - started) * 1000)
        if canceled:
            if saved and values.get("batch_grid_on_cancel", True):
                _maybe_grid(job_id, values, saved)
            cache_db.execute(
                "UPDATE jobs SET status = 'canceled', finished_at = ?, payload_json = ? WHERE id = ?",
                (_now(), json.dumps(values), job_id),
            )
            _prune_jobs()
            return
        if not had_image:
            cache_db.execute(
                "UPDATE jobs SET status = 'canceled', finished_at = ?, payload_json = ? WHERE id = ?",
                (_now(), json.dumps(values), job_id),
            )
            _prune_jobs()
            return
        _maybe_grid(job_id, values, saved)
        cache_db.execute(
            "UPDATE jobs SET status = 'completed', finished_at = ?, payload_json = ? WHERE id = ?",
            (_now(), json.dumps(values), job_id),
        )
        _prune_jobs()
    except comfy.ComfyError as exc:
        cache_db.execute(
            "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
            (str(exc), _now(), job_id),
        )
        _prune_jobs()
    except Exception as exc:
        cache_db.execute(
            "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
            (str(exc), _now(), job_id),
        )
        _prune_jobs()



def latest_job() -> dict[str, Any] | None:
    row = cache_db.query_one("SELECT * FROM jobs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1")
    return _row_job(row) if row else None


def grid_paths(job_id: str) -> list[Path]:
    row = cache_db.query_one("SELECT payload_json FROM jobs WHERE id = ?", (job_id,))
    if not row:
        return []
    payload = json.loads(row["payload_json"])
    raw = payload.get("grid_paths")
    out: list[Path] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                path = Path(item)
                if path.is_file():
                    out.append(path)
        return out
    single = payload.get("grid_path")
    if isinstance(single, str):
        path = Path(single)
        if path.is_file():
            return [path]
    return []


def grid_path(job_id: str, index: int = 0) -> Path | None:
    paths = grid_paths(job_id)
    if index < 0 or index >= len(paths):
        return None
    return paths[index]


