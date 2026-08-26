from __future__ import annotations

from pathlib import Path
from typing import Any

from features.settings import service as settings
from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import index as gallery_index
from features.models.scripts import model_thumb_anim
from config import USER

THUMBS = USER / "gallery_thumbs"
_DEFAULT_MP = 0.5
_DEFAULT_IMAGE = "jpg"
_DEFAULT_VIDEO = "webp"
_DEFAULT_QUALITY = 85
_IMAGE_EXTS = {"png": (".png", "PNG"), "jpg": (".jpg", "JPEG"), "webp": (".webp", "WEBP")}
_THUMB_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm")
_STILL = {
    "png": ("PNG", ".png"),
    "jpg": ("JPEG", ".jpg"),
    "webp": ("WEBP", ".webp"),
    "gif": ("GIF", ".gif"),
    "video": ("JPEG", ".jpg"),
}


def _hide() -> bool:
    return bool(settings.load().get("galleryHideInterrupted", True))


def _dim(raw: object) -> int | None:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _public(row: object) -> dict[str, Any]:
    data = dict(row)  # type: ignore[arg-type]
    return {
        "id": str(data.get("id") or ""),
        "created_at": str(data.get("created_at") or ""),
        "media_kind": str(data.get("media_kind") or "image"),
        "asset_kind": str(data.get("asset_kind") or "image"),
        "checkpoint": str(data.get("checkpoint_name") or ""),
        "width": _dim(data.get("width")),
        "height": _dim(data.get("height")),
    }


def list_items(limit: int = 200) -> list[dict[str, Any]]:
    cap = max(1, min(200, int(limit)))
    return [_public(row) for row in gallery_cache.list_rows(cap, _hide())]


def list_since(created_at: str, limit: int = 60) -> list[dict[str, Any]]:
    return [_public(row) for row in gallery_cache.list_since(created_at, _hide(), limit)]


def item_image(ident: str) -> Path | None:
    return gallery_cache.path_for_id(ident)


def item_thumb(ident: str) -> Path | None:
    src = item_image(ident)
    if not src:
        return None
    return _thumb(src, ident)


def disk_image(ident: str) -> Path | None:
    return item_image(ident)


def disk_thumb(ident: str) -> Path | None:
    return item_thumb(ident)


def _thumb(src: Path, ident: str) -> Path | None:
    safe_ident = "".join(char if char.isalnum() or char in "._-" else "_" for char in ident)
    megapixels, image_fmt, video_fmt, quality = _opts()
    stem = THUMBS / _stem(safe_ident, megapixels, image_fmt, video_fmt, quality)
    try:
        src_mtime = src.stat().st_mtime
    except OSError:
        return None
    existing = _existing(stem, src_mtime)
    if existing:
        return existing
    THUMBS.mkdir(parents=True, exist_ok=True)
    path = _encode(src, stem, image_fmt, video_fmt, megapixels, quality)
    if not path:
        return None
    _drop_others(safe_ident, path)
    return path


def _opts() -> tuple[float, str, str, int]:
    cfg = settings.load()
    return (
        _clamp_mp(cfg.get("galleryItemThumbMegapixels")),
        _image_fmt(cfg.get("galleryItemThumbFormat")),
        _video_fmt(cfg.get("galleryItemThumbVideoFormat")),
        _clamp_quality(cfg.get("galleryItemThumbQuality")),
    )


def _clamp_mp(raw: object) -> float:
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _DEFAULT_MP
    if value != value or value in (float("inf"), float("-inf")):
        return _DEFAULT_MP
    return round(min(2.0, max(0.05, value)) * 20) / 20


def _image_fmt(raw: object) -> str:
    name = str(raw or "").lower()
    if name == "jpeg":
        name = "jpg"
    return name if name in _IMAGE_EXTS else _DEFAULT_IMAGE


def _video_fmt(raw: object) -> str:
    name = str(raw or "").lower()
    return name if name in model_thumb_anim.ANIM_FORMATS else _DEFAULT_VIDEO


def _clamp_quality(raw: object) -> int:
    try:
        return max(1, min(100, int(raw)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _DEFAULT_QUALITY


def _stem(ident: str, megapixels: float, image_fmt: str, video_fmt: str, quality: int) -> str:
    return f"{ident}_{int(round(megapixels * 100))}_{image_fmt}_{video_fmt}_{quality}"


def _existing(stem: Path, src_mtime: float) -> Path | None:
    for ext in _THUMB_EXTS:
        path = Path(str(stem) + ext)
        try:
            if path.is_file() and path.stat().st_mtime >= src_mtime:
                return path
        except OSError:
            continue
    return None


def _drop_others(safe_ident: str, keep: Path) -> None:
    if not THUMBS.is_dir():
        return
    prefix = f"{safe_ident}_"
    old = f"{safe_ident}.jpg"
    keep_resolved = keep.resolve()
    for path in THUMBS.iterdir():
        if not path.is_file():
            continue
        try:
            if path.resolve() == keep_resolved:
                continue
        except OSError:
            continue
        if path.name == old or path.name.startswith(prefix):
            path.unlink(missing_ok=True)


def _encode(src: Path, stem: Path, image_fmt: str, video_fmt: str, megapixels: float, quality: int) -> Path | None:
    if src.suffix.lower() in gallery_index.VIDEO_EXTS:
        return _encode_video(src, stem, video_fmt, megapixels, quality)
    return _write_still(src, stem, image_fmt, megapixels, quality)


def _encode_video(src: Path, stem: Path, video_fmt: str, megapixels: float, quality: int) -> Path | None:
    try:
        data = src.read_bytes()
    except OSError:
        data = b""
    if data:
        encoded = model_thumb_anim.encode_animated(data, src.suffix.lower(), stem, video_fmt, megapixels, quality)
        if encoded and encoded.suffix.lower() != src.suffix.lower():
            return encoded
        if encoded and encoded.stat().st_size < src.stat().st_size:
            return encoded
    frame = model_thumb_anim.first_frame_path(src)
    if frame is None:
        return None
    return _save_image(frame, stem, video_fmt, megapixels, quality)


def _write_still(src: Path, stem: Path, fmt: str, megapixels: float, quality: int) -> Path | None:
    try:
        from PIL import Image

        with Image.open(src) as opened:
            opened.load()
            image = opened.convert("RGB") if opened.mode != "RGB" else opened.copy()
    except (OSError, ValueError, SyntaxError):
        return None
    return _save_image(image, stem, fmt, megapixels, quality)


def _save_image(image: object, stem: Path, fmt: str, megapixels: float, quality: int) -> Path | None:
    pil_fmt, ext = _STILL.get(fmt, ("JPEG", ".jpg"))
    dest = Path(str(stem) + ext)
    try:
        model_thumb_anim.fit_image(image, megapixels)
        if pil_fmt == "JPEG" and getattr(image, "mode", "") != "RGB":
            image = image.convert("RGB")  # type: ignore[union-attr]
        elif pil_fmt != "JPEG" and getattr(image, "mode", "") not in {"RGB", "RGBA"}:
            image = image.convert("RGBA")  # type: ignore[union-attr]
        tmp = dest.with_name(dest.name + ".tmp")
        opts: dict[str, object] = {}
        if pil_fmt in {"JPEG", "WEBP"}:
            opts["quality"] = quality
        if pil_fmt == "JPEG":
            opts["optimize"] = True
        image.save(tmp, pil_fmt, **opts)  # type: ignore[union-attr]
        tmp.replace(dest)
        return dest
    except (OSError, ValueError, SyntaxError):
        return None

