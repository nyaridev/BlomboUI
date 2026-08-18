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

from blombo import comfy, db, hashes, pnginfo
from blombo.paths import VERSION, comfy_base, outputs_root

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
_tasks: set[asyncio.Task[None]] = set()


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


def _row_job(row: Any) -> dict[str, Any]:
    payload = json.loads(row["payload_json"])
    gens = db.query(
        "SELECT id FROM generations WHERE job_id = ? ORDER BY created_at ASC",
        (row["id"],),
    )
    grid = payload.get("grid_path")
    data = {
        "id": row["id"],
        "status": row["status"],
        "mode": row["mode"],
        "payload": payload,
        "comfy_prompt_id": row["comfy_prompt_id"],
        "error": row["error"],
        "generation_id": gens[-1]["id"] if gens else None,
        "generation_ids": [g["id"] for g in gens],
        "has_grid": isinstance(grid, str) and Path(grid).is_file(),
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
    values["batch_grid_max"] = max(2, int(values.get("batch_grid_max") or 16))
    values["batch_grid_quality"] = max(40, min(95, int(values.get("batch_grid_quality") or 85)))
    values["prompt"] = str(body.get("prompt") or "")
    values["negative_prompt"] = str(body.get("negative_prompt") or "")
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
        values["model_hash"] = await asyncio.to_thread(hashes.checkpoint_hash, str(values.get("checkpoint") or ""))
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

            def on_event(event: dict[str, Any], batch_i: int = i) -> None:
                _on_live(job_id, {**event, "batch_i": batch_i, "batch_count": batch_count})

            graph = comfy.fill_txt2img(run_values)
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


def _import_image(job_id: str, values: dict[str, Any], info: dict[str, str], graph: dict[str, Any] | None = None) -> str:
    data = pnginfo.embed(comfy.download_image(info), values, graph)
    root = outputs_root()
    day = datetime.now().strftime("%Y-%m-%d")
    folder = root / day
    folder.mkdir(parents=True, exist_ok=True)
    gen_id = str(uuid.uuid4())
    stem = f"blombo_{gen_id[:8]}"
    png = folder / f"{stem}.png"
    png.write_bytes(data)
    sidecar = {
        "id": gen_id,
        "job_id": job_id,
        "prompt": values.get("prompt"),
        "negative_prompt": values.get("negative_prompt"),
        "seed": values.get("seed"),
        "checkpoint": values.get("checkpoint"),
        "model_hash": values.get("model_hash"),
        "width": values.get("width"),
        "height": values.get("height"),
        "steps": values.get("steps"),
        "cfg": values.get("cfg"),
        "batch_size": values.get("batch_size"),
        "batch_count": values.get("batch_count"),
        "sampler": values.get("sampler"),
        "scheduler": values.get("scheduler"),
        "software": f"BlomboUI {VERSION}",
        "path": str(png),
    }
    (folder / f"{stem}.json").write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
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


def _maybe_grid(job_id: str, values: dict[str, Any], paths: list[Path]) -> None:
    if not values.get("batch_grid", True):
        return
    max_n = int(values.get("batch_grid_max") or 16)
    if len(paths) < 2 or len(paths) > max_n:
        return
    dest = paths[0].parent / f"blombo_{job_id[:8]}_grid.jpg"
    try:
        from blombo.grid import save_contact_sheet

        save_contact_sheet(paths, dest, int(values.get("batch_grid_quality") or 85))
    except Exception:
        return
    values["grid_path"] = str(dest)
    db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))


def latest_job() -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM jobs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1")
    return _row_job(row) if row else None


def grid_path(job_id: str) -> Path | None:
    row = db.query_one("SELECT payload_json FROM jobs WHERE id = ?", (job_id,))
    if not row:
        return None
    payload = json.loads(row["payload_json"])
    raw = payload.get("grid_path")
    if not isinstance(raw, str):
        return None
    path = Path(raw)
    return path if path.is_file() else None


def generation_path(gen_id: str) -> Path | None:
    row = db.query_one("SELECT path FROM generations WHERE id = ?", (gen_id,))
    if not row:
        return None
    path = Path(row["path"])
    return path if path.is_file() else None
