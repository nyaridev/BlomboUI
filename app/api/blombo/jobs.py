from __future__ import annotations

import asyncio
import json
import random
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from blombo import comfy, db, hashes, pnginfo, settings, templates
from blombo import loras as lora_tags
from blombo import wildcards as wildcard_tags
from blombo.paths import comfy_base, comfy_output_root, outputs_root

DEFAULTS = {
    "checkpoint": "waiIllustriousSDXL_v140.safetensors",
    "width": 832,
    "height": 1216,
    "steps": 20,
    "cfg": 4.0,
    "seed": -1,
    "batch_size": 1,
    "batch_count": 1,
    "sampler": "euler",
    "scheduler": "sgm_uniform",
    "workflow": "txt2img",
    "template": "default",
}

PREVIEW_EVERY = 4


class LiveJob:
    def __init__(self, steps: int = 0, batch_count: int = 1) -> None:
        self.value = 0
        self.max = steps
        self.batch_i = 0
        self.batch_count = max(1, batch_count)
        self.preview: bytes | None = None
        self.snapshots: dict[int, bytes] = {}
        self.skip = False
        self.cancel = False


_live: dict[str, LiveJob] = {}
_live_lock = threading.Lock()
_save_lock = threading.Lock()
_tasks: set[asyncio.Task[None]] = set()
_SAFE_DIR = re.compile(r"^[A-Za-z0-9._-]+$")
_BLOMBO_STEM = re.compile(r"^blombo_(\d+)\.[^.]+$", re.I)
_PATH_TOKEN = re.compile(r"\[([A-Za-z_]+)\]")
_UNSAFE_SEG = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _keep_snapshot(step: int, total: int) -> bool:
    if step <= 0:
        return False
    if total and step == total:
        return True
    return step % PREVIEW_EVERY == 0


def _on_live(job_id: str, event: dict[str, Any]) -> None:
    if event.get("prompt_id"):
        db.execute(
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
        if event.get("value") is not None:
            live.value = int(event["value"])
        if event.get("max") is not None:
            live.max = int(event["max"])
        preview = event.get("preview")
        if isinstance(preview, (bytes, bytearray)) and preview:
            data = bytes(preview)
            live.preview = data
            if _keep_snapshot(live.value, live.max):
                live.snapshots[live.value] = data


def _live_fields(job_id: str) -> dict[str, Any]:
    with _live_lock:
        live = _live.get(job_id)
        if not live:
            return {"progress": None, "job_progress": None, "has_preview": False, "preview_steps": []}
        current_max = live.max or 0
        overall_max = live.batch_count * current_max
        overall_value = live.batch_i * current_max + live.value
        return {
            "progress": {"value": live.value, "max": live.max},
            "job_progress": {"value": overall_value, "max": overall_max},
            "has_preview": live.preview is not None,
            "preview_steps": sorted(live.snapshots),
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


def _attach_lora_hashes(values: dict[str, Any]) -> None:
    from blombo import models

    rows = values.get("loras")
    if not isinstance(rows, list):
        return
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("lora") or item.get("path") or "")
        path = models.model_file("loras", name)
        row = hashes.entry(path) if path else None
        item["hash"] = (row or {}).get("autov2") or ""


def _public_loras(raw: Any) -> list[dict[str, Any]]:
    from blombo import models

    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, str):
            name, strength = item, 1.0
            digest = ""
        elif isinstance(item, dict):
            name = str(item.get("lora") or item.get("path") or "")
            try:
                strength = float(item.get("strength") or 1)
            except (TypeError, ValueError):
                strength = 1.0
            digest = str(item.get("hash") or "")
        else:
            continue
        name = name.strip()
        if not name:
            continue
        if not digest:
            path = models.model_file("loras", name)
            row = hashes.entry(path) if path else None
            digest = (row or {}).get("autov2") or ""
        out.append({"path": name, "strength": strength, "hash": digest})
    return out


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
    }


def _row_job(row: Any) -> dict[str, Any]:
    payload = json.loads(row["payload_json"])
    gens = db.query(
        "SELECT * FROM generations WHERE job_id = ? ORDER BY created_at ASC",
        (row["id"],),
    )
    public = [_public_generation(item) for item in gens]
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
        "generation_id": public[-1]["id"] if public else None,
        "generation_ids": [item["id"] for item in public],
        "generations": public,
        "has_grid": bool(paths),
        "grid_count": len(paths),
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }
    data.update(_live_fields(row["id"]))
    return data


def get_job(job_id: str) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
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
            live.preview = None
            live.snapshots.clear()
    try:
        comfy.interrupt()
    except comfy.ComfyError:
        pass
    return get_job(job_id)


def latest_generation() -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM generations ORDER BY created_at DESC LIMIT 1")
    if not row:
        return None
    return dict(row)


def create_job(body: dict[str, Any]) -> dict[str, Any]:
    if not comfy.reachable():
        raise comfy.ComfyError(
            "comfy_unreachable",
            f"ComfyUI is not running on {comfy_base()}.",
        )
    values = {**DEFAULTS, **{k: v for k, v in body.items() if v is not None}}
    seed = int(values["seed"])
    if seed < 0:
        seed = random.randint(0, 2**53 - 1)
        values["seed"] = seed
    values["batch_size"] = max(1, int(values.get("batch_size") or 1))
    values["batch_count"] = max(1, int(values.get("batch_count") or 1))
    values["batch_grid"] = bool(values.get("batch_grid", True))
    values["batch_grid_max"] = max(2, min(100, int(values.get("batch_grid_max") or 16)))
    values["batch_grid_quality"] = max(40, min(95, int(values.get("batch_grid_quality") or 85)))
    values["batch_grid_rows"] = max(0, min(25, int(values.get("batch_grid_rows") or 0)))
    values["batch_grid_fill"] = bool(values.get("batch_grid_fill", False))
    values["template"] = _template_name(values)
    values["prompt"] = str(body.get("prompt") or "")
    values["negative_prompt"] = str(body.get("negative_prompt") or "")
    lora_tags.apply(values)
    job_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO jobs (id, status, mode, payload_json, created_at)
        VALUES (?, 'queued', 'txt2img', ?, ?)
        """,
        (job_id, json.dumps(values), _now()),
    )
    with _live_lock:
        _live.clear()
        _live[job_id] = LiveJob(int(values["steps"]), int(values["batch_count"]))
    task = asyncio.create_task(run_job(job_id, values))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    job = get_job(job_id)
    assert job is not None
    return job


async def run_job(job_id: str, values: dict[str, Any]) -> None:
    try:
        batch_count = int(values["batch_count"])
        base_seed = int(values["seed"])
        prompt_id = ""
        saved: list[Path] = []
        started = time.monotonic()
        canceled = False
        missing_wildcards: list[str] = []
        row = await asyncio.to_thread(hashes.checkpoint_hashes, str(values.get("checkpoint") or ""))
        values["model_hash"] = row.get("autov2") or ""
        values["model_hashes"] = row
        for i in range(batch_count):
            with _live_lock:
                live = _live.get(job_id)
                if live and live.cancel:
                    canceled = True
                    break
                if live:
                    live.skip = False
                    live.batch_i = i
                    live.value = 0

            run_values = {**values, "seed": base_seed + i}
            rng = random.Random(int(run_values["seed"]))
            wildcard_tags.apply(run_values, rng)
            run_values["prompt"] = str(run_values.get("prompt_expanded") or run_values.get("prompt") or "")
            run_values["negative_prompt"] = str(
                run_values.get("negative_prompt_expanded") or run_values.get("negative_prompt") or ""
            )
            grew = False
            for name in run_values.get("wildcard_missing") or []:
                if name not in missing_wildcards:
                    missing_wildcards.append(name)
                    grew = True
            if grew:
                values["wildcard_missing"] = missing_wildcards
                db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))

            def on_event(event: dict[str, Any], batch_i: int = i) -> None:
                _on_live(job_id, {**event, "batch_i": batch_i, "batch_count": batch_count})

            graph = comfy.fill_txt2img(run_values)
            _attach_lora_hashes(run_values)
            prompt_id, images = await asyncio.to_thread(
                comfy.run_prompt,
                graph,
                f"{job_id}-{i}",
                on_event,
            )
            db.execute(
                "UPDATE jobs SET status = 'running', comfy_prompt_id = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
                (prompt_id, _now(), job_id),
            )
            with _live_lock:
                live = _live.get(job_id)
                skip = bool(live and live.skip)
                if live and live.cancel:
                    canceled = True
                if live and (skip or canceled):
                    live.skip = False
                    live.preview = None
                    live.snapshots.clear()
            if canceled:
                break
            if skip:
                continue
            for info in images:
                gen_id = await asyncio.to_thread(_import_image, job_id, run_values, info, graph)
                path = generation_path(gen_id)
                if path:
                    saved.append(path)
        values["duration_ms"] = int((time.monotonic() - started) * 1000)
        if canceled or not saved:
            db.execute(
                "UPDATE jobs SET status = 'canceled', finished_at = ?, payload_json = ? WHERE id = ?",
                (_now(), json.dumps(values), job_id),
            )
            return
        _maybe_grid(job_id, values, saved)
        db.execute(
            "UPDATE jobs SET status = 'completed', finished_at = ?, payload_json = ? WHERE id = ?",
            (_now(), json.dumps(values), job_id),
        )
    except comfy.ComfyError as exc:
        db.execute(
            "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
            (str(exc), _now(), job_id),
        )
    except Exception as exc:
        db.execute(
            "UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
            (str(exc), _now(), job_id),
        )


def _workflow_dir(values: dict[str, Any]) -> str:
    stem = Path(str(values.get("workflow") or DEFAULTS["workflow"])).stem
    if stem and _SAFE_DIR.fullmatch(stem):
        return stem
    return str(DEFAULTS["workflow"])


def _safe_segment(text: str) -> str:
    text = _UNSAFE_SEG.sub("_", text.strip())
    text = re.sub(r"\s+", "_", text).strip(" ._")
    if text in {".", ".."}:
        return ""
    return text[:80]


def _model_name(values: dict[str, Any]) -> str:
    return _safe_segment(Path(str(values.get("checkpoint") or "")).stem)


def _model_dir(values: dict[str, Any]) -> str:
    parent = Path(str(values.get("checkpoint") or "").replace("\\", "/")).parent
    name = parent.name if str(parent) not in {".", ""} else ""
    return _safe_segment(name)


def _template_name(values: dict[str, Any]) -> str:
    raw = str(values.get("template") or DEFAULTS["template"]).strip() or str(DEFAULTS["template"])
    needle = raw.lower()
    try:
        items, _ = templates.list_templates(_workflow_dir(values))
    except templates.TemplateError:
        items = []
    for item in items:
        if str(item.get("id") or "").lower() == needle or str(item.get("name") or "").lower() == needle:
            return _safe_segment(str(item.get("name") or raw))
    return _safe_segment(raw)


def _fmt_num(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    if number == int(number):
        return str(int(number))
    text = f"{number:.4f}".rstrip("0").rstrip(".")
    return text


def _token_value(name: str, values: dict[str, Any], now: datetime) -> str:
    key = name.lower()
    if key in {"workflow", "workflow_name"}:
        return _workflow_dir(values)
    if key in {"template", "template_name"}:
        return _safe_segment(str(values.get("template") or _template_name(values)))
    if key == "model":
        return _model_name(values)
    if key == "model_dir":
        return _model_dir(values)
    if key == "sampler":
        return _safe_segment(str(values.get("sampler") or ""))
    if key == "scheduler":
        return _safe_segment(str(values.get("scheduler") or ""))
    if key == "seed":
        return str(int(values.get("seed") or 0))
    if key == "width":
        return str(int(values.get("width") or 0))
    if key == "height":
        return str(int(values.get("height") or 0))
    if key == "size":
        return f"{int(values.get('width') or 0)}x{int(values.get('height') or 0)}"
    if key == "steps":
        return str(int(values.get("steps") or 0))
    if key == "cfg":
        return _fmt_num(values.get("cfg"))
    if key == "date":
        return now.strftime("%Y-%m-%d")
    if key == "year":
        return now.strftime("%Y")
    if key == "month":
        return now.strftime("%m")
    if key == "month_name":
        return now.strftime("%b")
    if key == "day":
        return now.strftime("%d")
    if key == "weekday":
        return now.strftime("%a")
    if key == "time":
        return now.strftime("%H-%M-%S")
    if key == "hour":
        return now.strftime("%H")
    if key == "minute":
        return now.strftime("%M")
    if key == "second":
        return now.strftime("%S")
    if key == "datetime":
        return now.strftime("%Y-%m-%d_%H-%M-%S")
    return ""


def _expand_path(template: str, values: dict[str, Any], fallback: str) -> Path:
    now = datetime.now()
    filled = _PATH_TOKEN.sub(lambda match: _token_value(match.group(1), values, now), template)
    parts: list[str] = []
    for part in filled.replace("\\", "/").split("/"):
        part = _safe_segment(part)
        if part:
            parts.append(part)
    if not parts:
        filled = _PATH_TOKEN.sub(lambda match: _token_value(match.group(1), values, now), fallback)
        parts = [_safe_segment(part) for part in filled.split("/") if _safe_segment(part)]
    root = outputs_root().resolve()
    folder = root.joinpath(*parts) if parts else root / _workflow_dir(values)
    try:
        folder.resolve().relative_to(root)
    except ValueError:
        if template != fallback:
            return _expand_path(fallback, values, fallback)
        folder = root / _workflow_dir(values)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _output_dir(values: dict[str, Any], kind: str) -> Path:
    cfg = settings.load()
    if kind == "grids":
        template = str(cfg.get("gridPath") or settings.GRID_PATH_DEFAULT)
        fallback = settings.GRID_PATH_DEFAULT
    else:
        template = str(cfg.get("imagePath") or settings.IMAGE_PATH_DEFAULT)
        fallback = settings.IMAGE_PATH_DEFAULT
    return _expand_path(template, values, fallback)


def _blombo_index(path: Path) -> int:
    match = _BLOMBO_STEM.match(path.name)
    return int(match.group(1)) if match else 0


def _alloc_blombo(folder: Path, ext: str, start: int = 0) -> Path:
    n = start
    for path in folder.glob(f"blombo_*.{ext}"):
        n = max(n, _blombo_index(path))
    if start > 0:
        dest = folder / f"blombo_{start:06d}.{ext}"
        if not dest.exists():
            return dest
    while True:
        n += 1
        dest = folder / f"blombo_{n:06d}.{ext}"
        if not dest.exists():
            return dest


def _import_image(job_id: str, values: dict[str, Any], info: dict[str, str], graph: dict[str, Any] | None = None) -> str:
    data = pnginfo.embed(comfy.download_image(info), values, graph)
    root = outputs_root()
    folder = _output_dir(values, "images")
    gen_id = str(uuid.uuid4())
    png = _save_png(folder, data)
    _forget_comfy_file(info)
    db.execute(
        """
        INSERT INTO generations (
            id, job_id, path, root, width, height, seed, checkpoint_name,
            prompt, negative_prompt, params_json, created_at, favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            gen_id,
            job_id,
            str(png),
            str(root),
            int(values["width"]),
            int(values["height"]),
            int(values["seed"]),
            str(values["checkpoint"]),
            str(values.get("prompt") or ""),
            str(values.get("negative_prompt") or ""),
            json.dumps(values),
            _now(),
        ),
    )
    return gen_id


def _save_png(folder: Path, data: bytes) -> Path:
    with _save_lock:
        dest = _alloc_blombo(folder, "png")
        dest.write_bytes(data)
        return dest


def _grid_values(first: Path, job_values: dict[str, Any]) -> dict[str, Any]:
    row = db.query_one("SELECT params_json FROM generations WHERE path = ?", (str(first),))
    data: dict[str, Any] = dict(job_values)
    if row:
        try:
            packed = json.loads(row["params_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            packed = None
        if isinstance(packed, dict):
            data = packed
    data["prompt"] = str(job_values.get("prompt") or "")
    data["negative_prompt"] = str(job_values.get("negative_prompt") or "")
    data.pop("prompt_expanded", None)
    data.pop("negative_prompt_expanded", None)
    return data


def _forget_comfy_file(info: dict[str, str]) -> None:
    name = Path(str(info.get("filename") or "")).name
    if not name or name in {".", ".."}:
        return
    root = comfy_output_root()
    sub = str(info.get("subfolder") or "").replace("\\", "/").strip("/")
    parts = [part for part in sub.split("/") if part and part not in {".", ".."}]
    path = root.joinpath(*parts) / name
    try:
        path.resolve().relative_to(root.resolve())
        path.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass


def _maybe_grid(job_id: str, values: dict[str, Any], paths: list[Path]) -> None:
    if not values.get("batch_grid", True):
        return
    if len(paths) < 2:
        return
    max_n = max(2, min(100, int(values.get("batch_grid_max") or 16)))
    quality = int(values.get("batch_grid_quality") or 85)
    rows = int(values.get("batch_grid_rows") or 0)
    fill = bool(values.get("batch_grid_fill", False))
    dests: list[str] = []
    folder = _output_dir(values, "grids")
    try:
        from blombo.grid import save_contact_sheet

        for i in range(0, len(paths), max_n):
            chunk = paths[i : i + max_n]
            if len(chunk) < 2:
                continue
            with _save_lock:
                dest = _alloc_blombo(folder, "jpg", _blombo_index(chunk[0]))
                save_contact_sheet(
                    chunk,
                    dest,
                    quality,
                    rows,
                    fill,
                    pnginfo.parameters_text(_grid_values(chunk[0], values), raw=True),
                )
            dests.append(str(dest))
    except Exception:
        return
    if not dests:
        return
    values["grid_path"] = dests[0]
    values["grid_paths"] = dests
    db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))


def latest_job() -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM jobs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1")
    return _row_job(row) if row else None


def grid_paths(job_id: str) -> list[Path]:
    row = db.query_one("SELECT payload_json FROM jobs WHERE id = ?", (job_id,))
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


def generation_path(gen_id: str) -> Path | None:
    row = db.query_one("SELECT path FROM generations WHERE id = ?", (gen_id,))
    if not row:
        return None
    path = Path(row["path"])
    return path if path.is_file() else None
