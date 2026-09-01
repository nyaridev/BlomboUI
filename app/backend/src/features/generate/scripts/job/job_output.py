from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import jobs as jobs_repo
from infrastructure.storage.repositories import gallery as gallery_repo

from features.settings import service as settings
from features.gallery.scripts import cache as gallery_cache
from infrastructure.comfy import client as comfy
from shared import pnginfo
from features.generate.scripts import save_meta, templates
from features.generate.scripts.workflow import rembg
from features.generate.scripts.workflow import upscale as image_upscale
from features.generate.scripts.workflow import caption
from features.generate.scripts.workflow.compose import hires_enabled
from config import RUNTIME, comfy_output_root, outputs_root
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
    if key == "index":
        try:
            n = int(values.get("run_index") or values.get("file_index") or 0)
        except (TypeError, ValueError):
            n = 0
        return f"{max(0, n):06d}"
    if key == "filename":
        raw = str(values.get("source_image") or values.get("input_image") or "")
        return _safe_segment(Path(raw).stem)
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
    elif kind == "hires":
        override = str(values.get("output_hires_path") or "").strip()
        template = override or str(cfg.get("hiresPath") or settings.HIRES_PATH_DEFAULT)
        fallback = settings.HIRES_PATH_DEFAULT
    elif rembg.is_rembg(values):
        override = str(values.get("output_image_path") or "").strip()
        if override:
            path = Path(override)
            if path.is_absolute():
                path.mkdir(parents=True, exist_ok=True)
                return path
            return _expand_path(override, values, rembg.PATH_DEFAULT)
        return _expand_path(rembg.PATH_DEFAULT, values, rembg.PATH_DEFAULT)
    elif image_upscale.is_image_upscale(values):
        override = str(values.get("output_image_path") or "").strip()
        if override:
            path = Path(override)
            if path.is_absolute():
                path.mkdir(parents=True, exist_ok=True)
                return path
            return _expand_path(override, values, image_upscale.PATH_DEFAULT)
        return _expand_path(image_upscale.PATH_DEFAULT, values, image_upscale.PATH_DEFAULT)
    elif caption.is_caption(values):
        override = str(values.get("output_image_path") or "").strip()
        if override:
            path = Path(override)
            if path.is_absolute():
                path.mkdir(parents=True, exist_ok=True)
                return path
            return _expand_path(override, values, caption.PATH_DEFAULT)
        return _expand_path(caption.PATH_DEFAULT, values, caption.PATH_DEFAULT)
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
    elif kind == "hires":
        override = str(values.get("output_hires_name") or "").strip()
        raw = override or str(cfg.get("hiresName") or settings.HIRES_NAME_DEFAULT)
        fallback = settings.HIRES_NAME_DEFAULT
    elif caption.is_caption(values) and kind not in {"grids", "hires"}:
        if "output_image_name" in values:
            raw = str(values.get("output_image_name") or "").strip()
            if not raw:
                stem = _safe_segment(Path(str(values.get("source_image") or values.get("input_image") or "")).stem)
                raw = stem or "blombo"
            fallback = caption.NAME_DEFAULT
            return _strip_name_ext(raw) or fallback, fallback
        raw = caption.NAME_DEFAULT
        fallback = caption.NAME_DEFAULT
        return _strip_name_ext(raw) or fallback, fallback
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


def _overwrite_named(values: dict[str, Any]) -> bool:
    if not caption.is_caption(values):
        return False
    return bool(caption.clean_caption(values.get("caption")).get("override_existing", True))


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
        if _overwrite_named(values) or not dest.exists():
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


def _image_save_opts(values: dict[str, Any] | None = None) -> tuple[str, int, bool, int]:
    if values and rembg.is_rembg(values):
        return "png", 100, False, 4096
    if values and caption.is_caption(values):
        return "png", 100, False, 4096
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


def save_kind(values: dict[str, Any], info: dict[str, str], graph: dict[str, Any] | None) -> str:
    if not hires_enabled(values):
        return "images"
    node = graph.get(str(info.get("node") or "")) if graph else None
    title = str((node.get("_meta") or {}).get("title") or "").lower() if isinstance(node, dict) else ""
    if "first" in title:
        return "images"
    return "hires"


def _hires_save_before(values: dict[str, Any]) -> bool:
    blob = values.get("hires")
    if not isinstance(blob, dict):
        return True
    if "save_before" in blob or "saveBefore" in blob:
        raw = blob.get("save_before")
        if raw is None:
            raw = blob.get("saveBefore")
        return bool(raw)
    return False


def tmp_first_pass(values: dict[str, Any], kind: str) -> bool:
    return hires_enabled(values) and kind == "images" and not _hires_save_before(values)


def _hires_first_tmp_dir(job_id: str) -> Path:
    ident = Path(str(job_id)).name
    if not ident or ident in {".", ".."}:
        ident = "job"
    folder = RUNTIME / "tmp" / "hires-first" / ident
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _hires_temp_after_days() -> int:
    try:
        return max(1, min(365, int(settings.load().get("hiresTempAfterDays") or 7)))
    except (TypeError, ValueError):
        return 7


def purge_hires_tmp() -> None:
    root = RUNTIME / "tmp" / "hires-first"
    cutoff = time.time() - _hires_temp_after_days() * 86400
    gone: list[str] = []
    if root.is_dir():
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            try:
                if path.stat().st_mtime > cutoff:
                    continue
                path.unlink()
                gone.append(str(path))
            except OSError:
                continue
        for folder in sorted((p for p in root.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            try:
                folder.rmdir()
            except OSError:
                pass
    stale = gallery_repo.query("SELECT path FROM gallery_items WHERE asset_kind = 'temp'")
    for row in stale:
        path = Path(str(row["path"]))
        if not path.is_file():
            gone.append(str(path))
    gallery_cache.forget_paths(gone)


def _import_image(
    job_id: str,
    values: dict[str, Any],
    info: dict[str, str],
    graph: dict[str, Any] | None = None,
    persist: bool = True,
) -> tuple[str, Path, str]:
    raw = comfy.download_image(info)
    kind = save_kind(values, info, graph) if persist else "images"
    if not persist:
        folder = _xy_temp_dir(job_id)
        index = False
    elif tmp_first_pass(values, kind):
        folder = _hires_first_tmp_dir(job_id)
        index = True
    else:
        folder = None
        index = True
    result = _import_bytes(job_id, values, raw, graph, kind, folder, index=index)
    _forget_comfy_file(info)
    return result[0], result[1], kind


def _import_preview(
    job_id: str, values: dict[str, Any], data: bytes, graph: dict[str, Any] | None = None
) -> tuple[str, Path]:
    return _import_bytes(job_id, values, data, graph, "interrupted")


def _xy_temp_dir(job_id: str) -> Path:
    folder = RUNTIME / "tmp" / "xy-plot" / job_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _import_bytes(
    job_id: str,
    values: dict[str, Any],
    raw: bytes,
    graph: dict[str, Any] | None,
    kind: str,
    folder: Path | None = None,
    index: bool | None = None,
) -> tuple[str, Path]:
    fmt, quality, sidecar, max_kb = _image_save_opts(values)
    texts = None
    src_meta = None
    if rembg.is_rembg(values):
        packed = rembg.empty_params()
        graph = None
        if rembg.preserve_metadata(values):
            source = rembg.source_path(values)
            if source is not None:
                texts = rembg.source_texts(source)
                src_meta = rembg.source_envelope(source)
                if src_meta:
                    packed = dict(src_meta.get("params") or packed)
    elif image_upscale.is_image_upscale(values):
        packed = image_upscale.empty_params()
        graph = None
    elif caption.is_caption(values):
        packed = caption.empty_params()
        graph = None
    else:
        packed = save_meta.pack_params(values, graph, kind=kind)
    if kind == "interrupted":
        packed["interrupted"] = True
    persist = folder is None
    folder = folder or _output_dir(values, kind)
    if index is None:
        index = persist
    created_at = _now()
    asset_kind = "interrupted" if kind == "interrupted" else "image"
    metadata = dict(src_meta) if src_meta else save_meta.envelope(job_id, values, packed, asset_kind, created_at)
    if src_meta and kind == "interrupted":
        metadata["params"] = packed
    data = pnginfo.embed(raw, packed, graph, fmt=fmt, quality=quality, metadata=metadata, texts=texts)
    dest = _save_image(folder, data, fmt, values, kind)
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
    ident = gallery_cache.item_id(dest)
    if index:
        gallery_cache.ingest(dest, ident)
    return ident, dest


def _save_image(folder: Path, data: bytes, ext: str, values: dict[str, Any], kind: str) -> Path:
    with _save_lock:
        dest = _alloc_named(folder, ext, values, kind)
        dest.write_bytes(data)
        return dest


def import_caption_run(
    job_id: str,
    values: dict[str, Any],
    images: list[dict[str, str]],
    texts: list[str],
    graph: dict[str, Any] | None,
) -> list[tuple[str, Path]]:
    blob = caption.clean_caption(values.get("caption"))
    sources = [str(item) for item in values.get("source_images") or values.get("input_images") or [] if str(item).strip()]
    if not sources:
        src = str(values.get("source_image") or values.get("input_image") or "")
        if src:
            sources = [src]
    image_infos = [
        info
        for info in images
        if Path(str(info.get("filename") or "")).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    ]
    n = max(len(sources), len(image_infos) if blob["save_image"] else 0, len(texts), 1)
    try:
        start = int(values.get("file_index") or 1)
    except (TypeError, ValueError):
        start = 1
    saved: list[tuple[str, Path]] = []
    for i in range(n):
        run_values = {
            **values,
            "run_index": start + i,
            "source_image": sources[i] if i < len(sources) else str(values.get("source_image") or ""),
        }
        text = caption.format_caption(blob, texts[i] if i < len(texts) else "")
        if blob["save_image"] and i < len(image_infos):
            ident, path, _kind = _import_image(job_id, run_values, image_infos[i], graph)
            path.with_suffix(".txt").write_text(text, encoding="utf-8")
            saved.append((ident, path))
            continue
        folder = _output_dir(run_values, "images")
        with _save_lock:
            dest = _alloc_named(folder, "txt", run_values, "images")
            dest.write_text(text, encoding="utf-8")
        saved.append(("", dest))
    for info in image_infos if not blob["save_image"] else []:
        _forget_comfy_file(info)
    for info in images:
        if info not in image_infos:
            _forget_comfy_file(info)
    return saved


def _grid_values(first: Path, job_values: dict[str, Any]) -> dict[str, Any]:
    row = gallery_cache.row_for_path(str(first))
    if row:
        try:
            packed = json.loads(row["params_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            packed = None
        taken = save_meta.take_params(packed)
        if taken:
            return taken
    try:
        info = pnginfo.read(first.read_bytes(), str(first))
    except (OSError, ValueError):
        info = {}
    meta = info.get("metadata") if isinstance(info, dict) else None
    params = meta.get("params") if isinstance(meta, dict) else None
    taken = save_meta.take_params(params)
    if taken:
        return taken
    return save_meta.pack_params(job_values)


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
        from features.generate.scripts.grid.grid import save_contact_sheet

        for i in range(0, len(paths), max_n):
            chunk = paths[i : i + max_n]
            if len(chunk) < 2:
                continue
            packed = _grid_values(chunk[0], values)
            created_at = _now()
            metadata = save_meta.envelope(job_id, values, packed, "grid", created_at)
            with _save_lock:
                dest = _alloc_named(folder, fmt, values, "grids", start=_file_index(chunk[0]))
                save_contact_sheet(
                    chunk,
                    dest,
                    quality,
                    rows,
                    fill,
                    fmt=fmt,
                    values=packed,
                    metadata=metadata,
                )
            dests.append(str(dest))
    except Exception:
        return
    if not dests:
        return
    values["grid_path"] = dests[0]
    values["grid_paths"] = dests
    jobs_repo.set_payload(job_id, json.dumps(values))


def _maybe_xy_grid(job_id: str, values: dict[str, Any], paths: list[Path]) -> None:
    xy = values.get("xy_plot")
    if not isinstance(xy, dict) or not paths:
        return
    quality = int(values.get("batch_grid_quality") or 85)
    fmt = _grid_fmt(values.get("batch_grid_format"))
    folder = _output_dir(values, "grids")
    try:
        from features.generate.scripts.grid.grid import save_xy_sheet
        from features.generate.scripts.grid.xy_plot import xy_labels, xy_shape

        cols, rows = xy_shape(xy)
        x_labels, y_labels = xy_labels(xy)
        packed = _grid_values(paths[0], values)
        created_at = _now()
        metadata = save_meta.envelope(job_id, values, packed, "grid", created_at)
        with _save_lock:
            dest = _alloc_named(folder, fmt, values, "grids", start=_file_index(paths[0]))
            save_xy_sheet(
                paths,
                dest,
                cols,
                rows,
                int(xy.get("grid_margin") or 0),
                x_labels,
                y_labels,
                bool(xy.get("draw_legend", True)),
                quality,
                fmt=fmt,
                values=packed,
                metadata=metadata,
            )
    except Exception:
        return
    values["grid_path"] = str(dest)
    values["grid_paths"] = [str(dest)]
    jobs_repo.set_payload(job_id, json.dumps(values))
