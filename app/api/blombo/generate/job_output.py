from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from blombo import db, settings
from blombo.gallery import cache as gallery_cache
from blombo.generate import comfy, pnginfo, templates
from blombo.paths import comfy_output_root, outputs_root
from .job_plan import DEFAULTS

_save_lock = threading.Lock()
_SAFE_DIR = re.compile(r"^[A-Za-z0-9._-]+$")
_PATH_TOKEN = re.compile(r"\[([A-Za-z_]+)\]")
_UNSAFE_SEG = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
_LAST_DIGITS = re.compile(r"(\d+)(?!.*\d)")
_NAME_NUMBER = "___NUM___"
_NAME_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

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
    item = _template_entry(values)
    if item:
        return _safe_segment(str(item.get("name") or item.get("id") or DEFAULTS["template"]))
    raw = str(values.get("template_id") or values.get("template") or DEFAULTS["template"]).strip()
    return _safe_segment(raw or str(DEFAULTS["template"]))


def _template_entry(values: dict[str, Any]) -> dict[str, Any] | None:
    raw = str(values.get("template_id") or values.get("template") or DEFAULTS["template"]).strip()
    raw = raw or str(DEFAULTS["template"])
    needle = raw.lower()
    try:
        items, _ = templates.list_templates(_workflow_dir(values))
    except templates.TemplateError:
        items = []
    for item in items:
        if str(item.get("id") or "").lower() == needle or str(item.get("name") or "").lower() == needle:
            return item
    return None


def _template_snapshot(values: dict[str, Any]) -> dict[str, Any]:
    item = _template_entry(values)
    if not item:
        ident = str(values.get("template_id") or values.get("template") or DEFAULTS["template"])
        return {"id": ident, "name": ident, "params": {}}
    return {
        "id": str(item.get("id") or DEFAULTS["template"]),
        "name": str(item.get("name") or item.get("id") or DEFAULTS["template"]),
        "params": dict(item.get("params") or {}) if isinstance(item.get("params"), dict) else {},
    }


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


def _import_image(
    job_id: str, values: dict[str, Any], info: dict[str, str], graph: dict[str, Any] | None = None
) -> tuple[str, Path]:
    raw = comfy.download_image(info)
    result = _import_bytes(job_id, values, raw, graph, "images")
    _forget_comfy_file(info)
    return result


def _import_preview(
    job_id: str, values: dict[str, Any], data: bytes, graph: dict[str, Any] | None = None
) -> tuple[str, Path]:
    return _import_bytes(job_id, values, data, graph, "interrupted")


def _import_bytes(
    job_id: str, values: dict[str, Any], raw: bytes, graph: dict[str, Any] | None, kind: str
) -> tuple[str, Path]:
    fmt, quality, sidecar, max_kb = _image_save_opts()
    packed = {
        key: value
        for key, value in values.items()
        if key not in {"outputs", "grid_path", "grid_paths", "duration_ms"}
    }
    if kind == "interrupted":
        packed["interrupted"] = True
    folder = _output_dir(values, kind)
    created_at = _now()
    metadata = {
        "version": 1,
        "asset_kind": "interrupted" if kind == "interrupted" else "image",
        "created_at": created_at,
        "job_id": job_id,
        "workflow_id": str(values.get("workflow_id") or values.get("workflow") or ""),
        "template_id": str(values.get("template_id") or ""),
        "template_name": str(values.get("template_name") or values.get("template") or ""),
        "template_params": values.get("template_params")
        if isinstance(values.get("template_params"), dict)
        else {},
        "params": packed,
    }
    data = pnginfo.embed(raw, packed, graph, fmt=fmt, quality=quality, metadata=metadata)
    dest = _save_image(folder, data, fmt, packed, kind)
    if sidecar and fmt != "jpg" and dest.stat().st_size > max_kb * 1024:
        try:
            jpeg = pnginfo.embed(
                raw,
                packed,
                graph,
                fmt="jpg",
                quality=quality,
                metadata={**metadata, "sidecar": True, "sidecar_for": str(dest)},
            )
            with _save_lock:
                dest.with_suffix(".jpg").write_bytes(jpeg)
        except Exception:
            pass
    return gallery_cache.item_id(dest), dest


def _save_image(folder: Path, data: bytes, ext: str, values: dict[str, Any], kind: str) -> Path:
    with _save_lock:
        dest = _alloc_named(folder, ext, values, kind)
        dest.write_bytes(data)
        return dest


def _grid_values(first: Path, job_values: dict[str, Any]) -> dict[str, Any]:
    row = gallery_cache.row_for_path(str(first))
    if not row:
        row = gallery_cache.output_row({"id": gallery_cache.item_id(first), "path": str(first)})
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


def _grid_fmt(raw: Any) -> str:
    name = str(raw or "").lower()
    if name == "jpeg":
        name = "jpg"
    if name in {"png", "jpg", "webp"}:
        return name
    name = str(settings.load().get("gridFormat") or "jpg").lower()
    if name == "jpeg":
        name = "jpg"
    return name if name in {"png", "jpg", "webp"} else "jpg"


def _maybe_grid(job_id: str, values: dict[str, Any], paths: list[Path]) -> None:
    if not values.get("batch_grid", True):
        return
    if len(paths) < 2:
        return
    max_n = max(2, min(100, int(values.get("batch_grid_max") or 36)))
    quality = int(values.get("batch_grid_quality") or 85)
    rows = int(values.get("batch_grid_rows") or 0)
    fill = bool(values.get("batch_grid_fill", False))
    fmt = _grid_fmt(values.get("batch_grid_format"))
    dests: list[str] = []
    folder = _output_dir(values, "grids")
    try:
        from blombo.generate.grid import save_contact_sheet

        for i in range(0, len(paths), max_n):
            chunk = paths[i : i + max_n]
            if len(chunk) < 2:
                continue
            with _save_lock:
                dest = _alloc_named(folder, fmt, values, "grids", start=_file_index(chunk[0]))
                save_contact_sheet(
                    chunk,
                    dest,
                    quality,
                    rows,
                    fill,
                    pnginfo.parameters_text(_grid_values(chunk[0], values), raw=True),
                    fmt,
                )
            dests.append(str(dest))
    except Exception:
        return
    if not dests:
        return
    values["grid_path"] = dests[0]
    values["grid_paths"] = dests
    db.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (json.dumps(values), job_id))
