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
_SEED_AFTER = {"randomize", "fixed", "increment", "decrement"}


def _seed_after(values: dict[str, Any]) -> str:
    mode = str(values.get("seed_after") or "")
    return mode if mode in _SEED_AFTER else "increment"


def _batch_plan(values: dict[str, Any]) -> tuple[int, int]:
    count = max(1, int(values.get("batch_count") or 1))
    size = max(1, int(values.get("batch_size") or 1))
    if _seed_after(values) in {"randomize", "fixed"}:
        return count * size, 1
    return count, size


def _run_seed(mode: str, base: int, index: int) -> int:
    if mode == "randomize":
        return base if index == 0 else random.randint(0, 2**53 - 1)
    if mode == "fixed":
        return base
    if mode == "decrement":
        return base - index
    return base + index


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
_PATH_TOKEN = re.compile(r"\[([A-Za-z_]+)\]")
_UNSAFE_SEG = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
_LAST_DIGITS = re.compile(r"(\d+)(?!.*\d)")
_NAME_NUMBER = "___NUM___"
_NAME_EXTS = (".png", ".jpg", ".jpeg", ".webp")


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


def list_generations(limit: int = 200, hide_interrupted: bool = False) -> list[dict[str, Any]]:
    cap = max(1, min(200, int(limit)))
    fetch = min(800, cap * 4) if hide_interrupted else cap
    rows = db.query(
        "SELECT id, created_at, path, params_json FROM generations ORDER BY created_at DESC LIMIT ?",
        (fetch,),
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        if not Path(row["path"]).is_file():
            continue
        if hide_interrupted and _is_interrupted(row["path"], row["params_json"]):
            continue
        out.append({"id": row["id"], "created_at": row["created_at"]})
        if len(out) >= cap:
            break
    return out


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
    values["batch_grid_on_cancel"] = bool(values.get("batch_grid_on_cancel", True))
    values["save_interrupted"] = bool(values.get("save_interrupted", True))
    values["interrupted_in_grid"] = bool(values.get("interrupted_in_grid", False))
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
        _live[job_id] = LiveJob(int(values["steps"]), _batch_plan(values)[0])
    task = asyncio.create_task(run_job(job_id, values))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    job = get_job(job_id)
    assert job is not None
    return job


async def run_job(job_id: str, values: dict[str, Any]) -> None:
    try:
        mode = _seed_after(values)
        batch_count, batch_size = _batch_plan(values)
        base_seed = int(values["seed"])
        prompt_id = ""
        saved: list[Path] = []
        had_image = False
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

            run_values = {**values, "seed": _run_seed(mode, base_seed, i), "batch_size": batch_size}
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

            graph = comfy.fill_txt2img({**run_values, "filename_prefix": f"blombo/{job_id}-{i}"})
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
                preview = b""
                if live:
                    if live.preview:
                        preview = bytes(live.preview)
                    elif live.snapshots:
                        preview = bytes(live.snapshots[max(live.snapshots)])
                if live and live.cancel:
                    canceled = True
                if live and (skip or canceled):
                    live.skip = False
                    live.preview = None
                    live.snapshots.clear()
            if (skip or canceled) and preview and values.get("save_interrupted", True):
                gen_id = await asyncio.to_thread(_import_preview, job_id, run_values, preview, graph)
                path = generation_path(gen_id)
                if path:
                    had_image = True
                    if values.get("interrupted_in_grid", False):
                        saved.append(path)
            if canceled:
                break
            if skip:
                continue
            for info in images:
                gen_id = await asyncio.to_thread(_import_image, job_id, run_values, info, graph)
                path = generation_path(gen_id)
                if path:
                    had_image = True
                    saved.append(path)
        values["duration_ms"] = int((time.monotonic() - started) * 1000)
        if canceled:
            if saved and values.get("batch_grid_on_cancel", True):
                _maybe_grid(job_id, values, saved)
            db.execute(
                "UPDATE jobs SET status = 'canceled', finished_at = ?, payload_json = ? WHERE id = ?",
                (_now(), json.dumps(values), job_id),
            )
            return
        if not had_image:
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
        override = str(values.get("output_grid_path") or "").strip()
        template = override or str(cfg.get("gridPath") or settings.GRID_PATH_DEFAULT)
        fallback = settings.GRID_PATH_DEFAULT
    elif kind == "interrupted":
        override = str(values.get("output_interrupted_path") or "").strip()
        template = override or str(cfg.get("interruptedPath") or settings.INTERRUPTED_PATH_DEFAULT)
        fallback = settings.INTERRUPTED_PATH_DEFAULT
    else:
        override = str(values.get("output_image_path") or "").strip()
        template = override or str(cfg.get("imagePath") or settings.IMAGE_PATH_DEFAULT)
        fallback = settings.IMAGE_PATH_DEFAULT
    return _expand_path(template, values, fallback)


def _strip_name_ext(text: str) -> str:
    lower = text.lower()
    for ext in _NAME_EXTS:
        if lower.endswith(ext):
            return text[: -len(ext)]
    return text


def _name_template(values: dict[str, Any], kind: str) -> tuple[str, str]:
    cfg = settings.load()
    if kind == "grids":
        override = str(values.get("output_grid_name") or "").strip()
        raw = override or str(cfg.get("gridName") or settings.GRID_NAME_DEFAULT)
        fallback = settings.GRID_NAME_DEFAULT
    else:
        override = str(values.get("output_image_name") or "").strip()
        raw = override or str(cfg.get("imageName") or settings.IMAGE_NAME_DEFAULT)
        fallback = settings.IMAGE_NAME_DEFAULT
    return _strip_name_ext(raw) or fallback, fallback


def _name_parts(template: str, values: dict[str, Any], now: datetime) -> list[str]:
    def repl(match: re.Match[str]) -> str:
        if match.group(1).lower() == "number":
            return _NAME_NUMBER
        return _token_value(match.group(1), values, now)

    filled = _PATH_TOKEN.sub(repl, template)
    return [_UNSAFE_SEG.sub("_", part) for part in filled.split(_NAME_NUMBER)]


def _join_name(parts: list[str], number: int | None) -> str:
    if len(parts) == 1 or number is None:
        stem = parts[0] if len(parts) == 1 else "".join(parts)
    else:
        stem = f"{number:06d}".join(parts)
    stem = re.sub(r"\s+", "_", stem).strip(" .")
    if not stem or stem in {".", ".."}:
        return "blombo"
    return stem[:120]


def _max_named(folder: Path, parts: list[str], ext: str) -> int:
    if len(parts) != 2:
        return 0
    prefix, suffix = parts
    n = 0
    suffixes = {f".{ext.lower()}"}
    if ext.lower() == "jpg":
        suffixes.add(".jpeg")
    try:
        names = list(folder.iterdir())
    except OSError:
        return 0
    for path in names:
        if not path.is_file() or path.suffix.lower() not in suffixes:
            continue
        stem = path.stem
        if prefix and not stem.startswith(prefix):
            continue
        if suffix and not stem.endswith(suffix):
            continue
        mid = stem[len(prefix) : len(stem) - len(suffix) if suffix else len(stem)]
        if mid.isdigit():
            n = max(n, int(mid))
    return n


def _file_index(path: Path) -> int:
    match = _LAST_DIGITS.search(path.stem)
    return int(match.group(1)) if match else 0


def _alloc_named(folder: Path, ext: str, values: dict[str, Any], kind: str, start: int = 0) -> Path:
    template, fallback = _name_template(values, kind)
    now = datetime.now()
    parts = _name_parts(template, values, now)
    if not _join_name(parts, 1 if len(parts) > 1 else None).strip("._") and template != fallback:
        parts = _name_parts(fallback, values, now)
    if len(parts) == 1:
        stem = _join_name(parts, None)
        dest = folder / f"{stem}.{ext}"
        if not dest.exists():
            return dest
        n = 1
        while True:
            n += 1
            dest = folder / f"{stem}_{n}.{ext}"
            if not dest.exists():
                return dest
    n = max(start, _max_named(folder, parts, ext))
    if start > 0:
        dest = folder / f"{_join_name(parts, start)}.{ext}"
        if not dest.exists():
            return dest
    while True:
        n += 1
        dest = folder / f"{_join_name(parts, n)}.{ext}"
        if not dest.exists():
            return dest


def _image_save_opts() -> tuple[str, int, bool, int]:
    cfg = settings.load()
    fmt = str(cfg.get("imageFormat") or "png").lower()
    if fmt == "jpeg":
        fmt = "jpg"
    if fmt not in {"png", "jpg", "webp"}:
        fmt = "png"
    try:
        quality = max(1, min(100, int(cfg.get("imageQuality") or 100)))
    except (TypeError, ValueError):
        quality = 100
    sidecar = bool(cfg.get("saveLargeAsJpeg", False))
    try:
        max_kb = max(256, min(65536, int(cfg.get("largeJpegMaxKb") or 4096)))
    except (TypeError, ValueError):
        max_kb = 4096
    return fmt, quality, sidecar, max_kb


def _import_image(job_id: str, values: dict[str, Any], info: dict[str, str], graph: dict[str, Any] | None = None) -> str:
    raw = comfy.download_image(info)
    gen_id = _import_bytes(job_id, values, raw, graph, "images")
    _forget_comfy_file(info)
    return gen_id


def _import_preview(job_id: str, values: dict[str, Any], data: bytes, graph: dict[str, Any] | None = None) -> str:
    return _import_bytes(job_id, values, data, graph, "interrupted")


def _import_bytes(
    job_id: str, values: dict[str, Any], raw: bytes, graph: dict[str, Any] | None, kind: str
) -> str:
    fmt, quality, sidecar, max_kb = _image_save_opts()
    packed = dict(values)
    if kind == "interrupted":
        packed["interrupted"] = True
    data = pnginfo.embed(raw, packed, graph, fmt=fmt, quality=quality)
    root = outputs_root()
    folder = _output_dir(values, kind)
    gen_id = str(uuid.uuid4())
    dest = _save_image(folder, data, fmt, packed, kind)
    if sidecar and fmt != "jpg" and dest.stat().st_size > max_kb * 1024:
        try:
            jpeg = pnginfo.embed(raw, packed, graph, fmt="jpg", quality=quality)
            with _save_lock:
                dest.with_suffix(".jpg").write_bytes(jpeg)
        except Exception:
            pass
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
            str(dest),
            str(root),
            int(packed["width"]),
            int(packed["height"]),
            int(packed["seed"]),
            str(packed["checkpoint"]),
            str(packed.get("prompt") or ""),
            str(packed.get("negative_prompt") or ""),
            json.dumps(packed),
            _now(),
        ),
    )
    return gen_id


def _save_image(folder: Path, data: bytes, ext: str, values: dict[str, Any], kind: str) -> Path:
    with _save_lock:
        dest = _alloc_named(folder, ext, values, kind)
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
    data.pop("interrupted", None)
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
                dest = _alloc_named(folder, "png", values, "grids", start=_file_index(chunk[0]))
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
