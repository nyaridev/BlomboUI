from __future__ import annotations

import time
from io import BytesIO
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import model_meta as model_meta_db
from config import USER
from features.models.scripts import thumbnail_embed
from features.models.scripts import thumbnail_scopes
from features.models.scripts import model_thumb_anim
from .model_thumb_storage import (
    drop_context,
    drop_ident,
    ident_index,
    load_index,
    prune_empty,
    relocate,
    set_index,
    write_index,
)

ROOT = USER / "model_thumbs"
THUMBS = ROOT
THUMB_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm")
_SAVE = {"png": ("PNG", ".png"), "jpg": ("JPEG", ".jpg"), "webp": ("WEBP", ".webp")}
THUMB_MP_DEFAULT = 0.25
THUMB_FMT_DEFAULT = "jpg"
THUMB_QUALITY_DEFAULT = 85
OUTPUT_FMT_DEFAULT = "png"
OUTPUT_QUALITY_DEFAULT = 100
_MEDIA = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}
GLOBAL = thumbnail_scopes.GLOBAL_ID


def thumb_dir(kind: str, ident: str) -> Path:
    return THUMBS / kind / ident


def thumb_paths(kind: str, ident: str, context: str = GLOBAL) -> list[Path]:
    base = thumb_dir(kind, ident) / context
    return [Path(str(base) + ext) for ext in THUMB_EXTS]


def raw_paths(kind: str, ident: str, context: str = GLOBAL) -> list[Path]:
    base = thumb_dir(kind, ident) / f"{context}_raw"
    return [Path(str(base) + ext) for ext in THUMB_EXTS]


def thumb_at(kind: str, ident: str, context: str = GLOBAL) -> Path | None:
    for path in thumb_paths(kind, ident, context):
        if path.is_file():
            return path
    return None


def thumb_file(kind: str, rel: str, context: str = GLOBAL) -> Path | None:
    ident = _ident(rel)
    if not ident:
        return None
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    return thumb_at(kind, ident, key)


def thumb_mtime(kind: str, rel: str, context: str = GLOBAL) -> int:
    path = thumb_file(kind, rel, context)
    return _mtime(path)


def thumb_any_mtime(kind: str, rel: str) -> int:
    ident = _ident(rel)
    if not ident:
        return 0
    best = 0
    for row in ident_index(kind, ident).values():
        if not isinstance(row, dict):
            continue
        try:
            mtime = int(row.get("mtime") or 0)
        except (TypeError, ValueError):
            continue
        if mtime > best:
            best = mtime
    return best


def thumb_media(path: Path) -> str:
    return _MEDIA.get(path.suffix.lower(), "application/octet-stream")


def resolved_file(
    kind: str,
    rel: str,
    context: str = GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
    raw: bool = False,
) -> Path | None:
    ident = _ident(rel)
    if not ident:
        return None
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    exact = thumb_at(kind, ident, key)
    found: Path | None = None
    rank_mode = mode == "likely" or bool(optional)
    if not rank_mode:
        if exact:
            found = exact
        elif fallback and key != GLOBAL:
            found = thumb_at(kind, ident, GLOBAL)
    elif exact:
        found = exact
    else:
        ids = thumbnail_scopes.parse_context(key)
        best: tuple[tuple[int, int, int], int, Path] | None = None
        for ctx, row in ident_index(kind, ident).items():
            if ctx == key or ctx == GLOBAL:
                continue
            path = thumb_at(kind, ident, ctx)
            if not path:
                continue
            rank = thumbnail_scopes.rank_thumb(
                ids, ctx, row.get("tags") if isinstance(row, dict) else None, optional
            )
            if not rank:
                continue
            score = (rank, _mtime(path), path)
            if best is None or score[0] > best[0] or (score[0] == best[0] and score[1] > best[1]):
                best = score
        if best:
            found = best[2]
        elif fallback:
            found = thumb_at(kind, ident, GLOBAL)
    if raw and found:
        beside = _raw_beside(found)
        if beside and beside.suffix.lower() not in {".mp4", ".webm"}:
            return beside
        return found
    return found


def resolved_mtime(
    kind: str,
    rel: str,
    context: str,
    mode: str,
    fallback: bool,
    optional: list[str] | None = None,
) -> int:
    return _mtime(resolved_file(kind, rel, context, mode, fallback, optional))


def save_thumb(
    kind: str,
    rel: str,
    data: bytes,
    context: str = GLOBAL,
    meta: dict[str, Any] | None = None,
    media: str = "",
) -> int:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    from PIL import Image

    ext = model_thumb_anim.detect_ext(data, media)
    image = None
    if model_thumb_anim.is_video_ext(ext):
        if ext == ".mp4" and not model_thumb_anim.is_mp4(data):
            raise ValueError("could not read mp4")
    else:
        try:
            image = Image.open(BytesIO(data))
            image.load()
        except Exception as exc:
            raise ValueError("could not read image") from exc
        if not ext and model_thumb_anim.is_animated_image(image):
            ext = ".webp"
    animated_src = ext == ".gif" or model_thumb_anim.is_video_ext(ext) or model_thumb_anim.is_animated_image(image)
    megapixels, thumb_fmt, thumb_quality, save_raw, out_fmt, out_quality, save_animated, anim_fmt = _save_opts()
    source = thumbnail_embed.extract_source(data) if not model_thumb_anim.is_video_ext(ext) else {}
    if meta:
        _apply_meta(source, meta)
    payload = thumbnail_embed.pack(key, source)
    dest_stem = thumb_dir(kind, ident) / key
    dest: Path | None = None
    if animated_src and save_animated:
        dest = model_thumb_anim.encode_animated(data, ext, dest_stem, anim_fmt, megapixels, thumb_quality)
        if dest is None:
            raise ValueError("could not encode animated thumbnail")
        if save_raw:
            raw_dest = model_thumb_anim.write_original(thumb_dir(kind, ident) / f"{key}_raw", ext, data)
            for old in raw_paths(kind, ident, key):
                if old != raw_dest and old.is_file():
                    old.unlink()
        else:
            _drop_raw(kind, ident, key)
    elif animated_src:
        frame = model_thumb_anim.first_frame(data, ext)
        if frame is None:
            raise ValueError("could not read image")
        full = frame.copy()
        _fit_megapixels(frame, megapixels)
        dest = _write_still(frame, thumb_fmt, thumb_quality, payload, dest_stem)
        if save_raw:
            raw_dest = _write_still(full, out_fmt, out_quality, payload, thumb_dir(kind, ident) / f"{key}_raw")
            for old in raw_paths(kind, ident, key):
                if old != raw_dest and old.is_file():
                    old.unlink()
        else:
            _drop_raw(kind, ident, key)
    else:
        assert image is not None
        full = image.copy()
        _fit_megapixels(image, megapixels)
        dest = _write_still(image, thumb_fmt, thumb_quality, payload, dest_stem)
        if save_raw:
            raw_dest = _write_still(full, out_fmt, out_quality, payload, thumb_dir(kind, ident) / f"{key}_raw")
            for old in raw_paths(kind, ident, key):
                if old != raw_dest and old.is_file():
                    old.unlink()
        else:
            _drop_raw(kind, ident, key)
    for old in thumb_paths(kind, ident, key):
        if old != dest and old.is_file():
            old.unlink()
    stamp = int(dest.stat().st_mtime)
    set_index(kind, ident, key, stamp, payload.get("tags") if isinstance(payload.get("tags"), list) else [])
    return stamp


def delete_thumb(kind: str, rel: str, context: str | None = None, all_contexts: bool = False) -> None:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    if all_contexts:
        folder = thumb_dir(kind, ident)
        if folder.is_dir():
            for path in list(folder.glob("*")):
                if path.is_file():
                    path.unlink(missing_ok=True)
            prune_empty(folder, THUMBS / kind)
        drop_ident(kind, ident)
        return
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context or GLOBAL))
    for path in [*thumb_paths(kind, ident, key), *raw_paths(kind, ident, key)]:
        if path.is_file():
            path.unlink()
    drop_context(kind, ident, key)
    prune_empty(thumb_dir(kind, ident), THUMBS / kind)


def drop_scope(scope_id: str) -> None:
    name = str(scope_id or "").strip().lower()
    if not name or name == GLOBAL:
        return
    data = load_index()
    changed = False
    for kind, rows in list(data.items()):
        root = THUMBS / kind
        if not isinstance(rows, dict):
            continue
        for ident, contexts in list(rows.items()):
            if not isinstance(contexts, dict):
                continue
            for key in list(contexts):
                parts = thumbnail_scopes.parse_context(key)
                if name not in parts:
                    continue
                for path in [*thumb_paths(kind, ident, key), *raw_paths(kind, ident, key)]:
                    if path.is_file():
                        path.unlink()
                contexts.pop(key, None)
                changed = True
            if not contexts:
                rows.pop(ident, None)
                prune_empty(thumb_dir(kind, ident), root)
        if not rows:
            data.pop(kind, None)
    if changed:
        write_index(data)


def iter_idents(kind: str) -> list[str]:
    folder = THUMBS / kind
    if not folder.is_dir():
        return []
    out: list[str] = []
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        ident = _ident_of(folder, path)
        if ident and ident not in out:
            out.append(ident)
    return out


def move_thumbs(kind: str, old: str, new: str) -> None:
    src_ident = _ident(old)
    dest_ident = _ident(new)
    if not src_ident or not dest_ident or src_ident == dest_ident:
        return

    def mapped(key: str) -> str | None:
        if key == src_ident:
            return dest_ident
        for sep in ("/", "#"):
            if key.startswith(src_ident + sep):
                return dest_ident + key[len(src_ident) :]
        return None

    idents = [ident for ident in iter_idents(kind) if mapped(ident)]
    idents.sort(key=len, reverse=True)
    for ident in idents:
        nxt = mapped(ident)
        if nxt:
            _move_ident(kind, ident, nxt)
    data = load_index()
    rows = data.get(kind)
    if not isinstance(rows, dict):
        return
    out: dict[str, Any] = {}
    changed = False
    for key, value in rows.items():
        nxt = mapped(str(key))
        if not nxt:
            out[key] = value
            continue
        changed = True
        if nxt not in rows and nxt not in out:
            out[nxt] = value
    if changed:
        data[kind] = out
        write_index(data)


def take(kind: str, ident: str, dest: Path) -> None:
    src = _ident(ident)
    if not src:
        return
    dest.mkdir(parents=True, exist_ok=True)
    root = THUMBS / kind
    for thumb_ident in list(iter_idents(kind)):
        if thumb_ident != src and not thumb_ident.startswith(src + "#"):
            continue
        folder = thumb_dir(kind, thumb_ident)
        if not folder.is_dir():
            continue
        for file in list(folder.iterdir()):
            if not file.is_file():
                continue
            try:
                rel = file.relative_to(root)
            except ValueError:
                rel = Path(thumb_ident) / file.name
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            relocate(file, out)
        prune_empty(folder, root)
        drop_ident(kind, thumb_ident)


def put(kind: str, thumbs: Path) -> None:
    if not thumbs.is_dir():
        return
    root = THUMBS / kind
    root.mkdir(parents=True, exist_ok=True)
    for file in thumbs.rglob("*"):
        if not file.is_file():
            continue
        dest = root / file.relative_to(thumbs)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            continue
        relocate(file, dest)
        ident = _ident_of(root, dest)
        context = _context_of(dest)
        if ident and context:
            payload = thumbnail_embed.read_file(dest)
            tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
            set_index(kind, ident, context, _mtime(dest), tags)


def contexts(kind: str, rel: str) -> dict[str, dict[str, Any]]:
    ident = _ident(rel)
    if not ident:
        return {}
    return ident_index(kind, ident)


LOOKUP_KINDS = (
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "text_encoders",
    "upscale_models",
    "controlnet",
    "embeddings",
    "wildcards",
)


def list_saved() -> list[dict[str, Any]]:
    data = load_index()
    out: list[dict[str, Any]] = []
    for kind in LOOKUP_KINDS:
        rows = data.get(kind)
        if not isinstance(rows, dict):
            continue
        for ident, contexts in rows.items():
            if not isinstance(contexts, dict):
                continue
            path = str(ident)
            for ctx, meta in contexts.items():
                key = str(ctx)
                if not thumbnail_scopes.is_context_key(key):
                    continue
                ids = thumbnail_scopes.parse_context(key)
                file = thumb_at(kind, str(ident), key)
                stamp = int(meta.get("mtime") or 0) if isinstance(meta, dict) else 0
                out.append(
                    {
                        "kind": kind,
                        "path": path,
                        "context": key,
                        "scopes": [item for item in ids if item != GLOBAL],
                        "mtime": stamp,
                        "media": thumb_media(file) if file else "",
                    }
                )
    out.sort(key=lambda row: (-int(row["mtime"]), str(row["kind"]), str(row["path"])))
    return out


def rebuild_index() -> None:
    data: dict[str, dict[str, dict[str, Any]]] = {}
    if THUMBS.is_dir():
        for kind_dir in THUMBS.iterdir():
            if not kind_dir.is_dir():
                continue
            kind = kind_dir.name
            for path in kind_dir.rglob("*"):
                if not path.is_file():
                    continue
                ident = _ident_of(kind_dir, path)
                context = _context_of(path)
                if not ident or not context:
                    continue
                payload = thumbnail_embed.read_file(path)
                tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
                data.setdefault(kind, {}).setdefault(ident, {})[context] = {
                    "mtime": _mtime(path),
                    "tags": [str(item) for item in tags if str(item).strip()],
                }
    write_index(data)


def _ident(rel: str) -> str | None:
    ident = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if not ident or ".." in Path(ident).parts:
        return None
    return ident


def _media_ext(data: bytes, media: str) -> str:
    return model_thumb_anim.detect_ext(data, media)


def _is_mp4(data: bytes) -> bool:
    return model_thumb_anim.is_mp4(data)


def _apply_meta(source: dict[str, Any], meta: dict[str, Any]) -> None:
    if meta.get("tags") is not None:
        source["tags"] = meta.get("tags")
    if meta.get("prompt"):
        source["prompt"] = str(meta["prompt"])
    if meta.get("parameters"):
        source["parameters"] = str(meta["parameters"])
    if isinstance(meta.get("raw"), dict):
        source["raw"] = meta["raw"]
    if meta.get("origin"):
        source["origin"] = str(meta["origin"])
    if isinstance(meta.get("civitai"), dict):
        source["civitai"] = meta["civitai"]


def _thumb_ext(name: str) -> str:
    lower = name.lower()
    return next((item for item in THUMB_EXTS if lower.endswith(item)), "")


def _context_of(path: Path) -> str:
    ext = _thumb_ext(path.name)
    if not ext:
        return ""
    name = path.name[: -len(ext)]
    return name if thumbnail_scopes.is_context_key(name) else ""


def _ident_of(kind_dir: Path, path: Path) -> str | None:
    context = _context_of(path)
    if not context:
        return None
    try:
        rel = path.parent.relative_to(kind_dir).as_posix()
    except ValueError:
        return None
    return _ident(rel)


def _mtime(path: Path | None) -> int:
    if not path or not path.is_file():
        return 0
    try:
        return int(path.stat().st_mtime)
    except OSError:
        return 0


def _raw_beside(path: Path) -> Path | None:
    ext = _thumb_ext(path.name)
    if not ext:
        return None
    context = path.name[: -len(ext)]
    if context.endswith("_raw"):
        return path if path.is_file() else None
    for item in THUMB_EXTS:
        candidate = path.parent / f"{context}_raw{item}"
        if candidate.is_file():
            return candidate
    return None


def _drop_raw(kind: str, ident: str, context: str) -> None:
    for path in raw_paths(kind, ident, context):
        if path.is_file():
            path.unlink()


def _fit_megapixels(image: Any, megapixels: float) -> None:
    width, height = image.size
    if width <= 0 or height <= 0:
        return
    cap = max(0.05, megapixels) * 1_000_000
    pixels = width * height
    if pixels <= cap:
        return
    ratio = (cap / pixels) ** 0.5
    image.thumbnail((max(1, round(width * ratio)), max(1, round(height * ratio))))


def _save_opts() -> tuple[float, str, int, bool, str, int, bool, str]:
    from features.settings import service as settings

    cfg = settings.load()
    anim = str(cfg.get("animatedThumbFormat") or "webp").lower()
    if anim not in model_thumb_anim.ANIM_FORMATS:
        anim = "webp"
    save_animated = cfg.get("saveAnimatedThumbs", True)
    return (
        _clamp_mp(cfg.get("thumbMegapixels", THUMB_MP_DEFAULT)),
        _image_fmt(cfg.get("thumbFormat"), THUMB_FMT_DEFAULT),
        _clamp_quality(cfg.get("thumbQuality"), THUMB_QUALITY_DEFAULT),
        bool(cfg.get("saveRawThumbs", True)),
        _image_fmt(cfg.get("imageFormat"), OUTPUT_FMT_DEFAULT),
        _clamp_quality(cfg.get("imageQuality"), OUTPUT_QUALITY_DEFAULT),
        False if save_animated is False else bool(save_animated),
        anim,
    )


def _clamp_mp(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return THUMB_MP_DEFAULT
    if value != value or value in (float("inf"), float("-inf")):
        return THUMB_MP_DEFAULT
    return round(min(2.0, max(0.05, value)) * 20) / 20


def _image_fmt(raw: Any, fallback: str) -> str:
    name = str(raw or "").lower()
    if name == "jpeg":
        name = "jpg"
    return name if name in _SAVE else fallback


def _clamp_quality(raw: Any, fallback: int) -> int:
    try:
        return max(1, min(100, int(raw)))
    except (TypeError, ValueError):
        return fallback


def _write_still(image: Any, fmt: str, quality: int, payload: dict[str, Any], base: Path) -> Path:
    pil_fmt, ext = _SAVE[fmt]
    dest = Path(str(base) + ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    thumbnail_embed.write_image(image, pil_fmt, payload, dest, quality)
    return dest




def _move_ident(kind: str, old: str, new: str) -> None:
    src = thumb_dir(kind, old)
    if not src.exists():
        return
    dest = thumb_dir(kind, new)
    if dest.is_file():
        dest.unlink(missing_ok=True)
    if dest.is_dir():
        for child in list(src.iterdir()):
            relocate(child, dest / child.name)
        prune_empty(src, THUMBS / kind)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    relocate(src, dest)
    prune_empty(src.parent, THUMBS / kind)














