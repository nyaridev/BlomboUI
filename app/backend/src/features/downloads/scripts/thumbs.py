from __future__ import annotations

import io
import threading
from pathlib import Path

from config import browse_thumbs_root, download_thumbs_root
from features.civitai.scripts.client import fetch_image
from features.downloads.scripts import history
from features.models.scripts import model_thumb_anim
from features.settings import service as settings

_DEFAULT_MP = 0.25
_DEFAULT_IMAGE = "jpg"
_DEFAULT_VIDEO = "webp"
_DEFAULT_QUALITY = 85
_LOCKS_GUARD = threading.Lock()
_LOCKS: dict[int, threading.Lock] = {}
_IMAGE_EXTS = {"png": ".png", "jpg": ".jpg", "webp": ".webp"}
_THUMB_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm")
_MEDIA = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


def thumb_megapixels() -> float:
    return _opts()[0]


def thumb_media(path: Path) -> str:
    return _MEDIA.get(path.suffix.lower(), "image/jpeg")


def prefetch(ident: int, *, root: Path | None = None, image_url: str | None = None) -> None:
    if not ident:
        return
    threading.Thread(
        target=_prefetch,
        args=(ident, root, image_url),
        daemon=True,
        name=f"dl-thumb-{ident}",
    ).start()


def item_thumb(ident: int, *, root: Path | None = None, image_url: str | None = None) -> Path | None:
    if not ident:
        return None
    with _ident_lock(ident):
        return _item_thumb(ident, root or download_thumbs_root(), image_url)


def _prefetch(ident: int, root: Path | None, image_url: str | None) -> None:
    try:
        item_thumb(ident, root=root, image_url=image_url)
    except Exception:
        pass


def _ident_lock(ident: int) -> threading.Lock:
    with _LOCKS_GUARD:
        lock = _LOCKS.get(ident)
        if lock is None:
            lock = threading.Lock()
            _LOCKS[ident] = lock
        return lock


def _item_thumb(ident: int, root: Path, image_url: str | None) -> Path | None:
    url = str(image_url or "").strip()
    if not url:
        row = history.get(ident) if root.resolve() == download_thumbs_root().resolve() else None
        if not row:
            return None
        url = str(row.get("imageUrl") or "").strip()
    if not url:
        return None
    megapixels, image_fmt, video_fmt, quality = _opts()
    stem = root / _stem(ident, megapixels, image_fmt, video_fmt, quality)
    existing = _existing(stem)
    if existing:
        return existing
    fetched = fetch_image(url)
    if not fetched:
        return None
    data, media = fetched
    path = _encode(data, media, stem, image_fmt, video_fmt, megapixels, quality)
    if not path:
        return None
    _drop_others(ident, path, root)
    return path


def delete_thumbs(ident: int, root: Path | None = None) -> None:
    folder = root or download_thumbs_root()
    if not folder.is_dir():
        return
    prefix = f"{ident}_"
    for path in folder.iterdir():
        if path.is_file() and path.name.startswith(prefix):
            path.unlink(missing_ok=True)


def clear_thumbs(root: Path | None = None) -> None:
    folder = root or download_thumbs_root()
    if not folder.is_dir():
        return
    for path in folder.iterdir():
        if path.is_file():
            path.unlink(missing_ok=True)


def _opts() -> tuple[float, str, str, int]:
    cfg = settings.load()
    return (
        _clamp_mp(cfg.get("downloadThumbMegapixels")),
        _image_fmt(cfg.get("downloadThumbImageFormat")),
        _video_fmt(cfg.get("downloadThumbVideoFormat")),
        _clamp_quality(cfg.get("downloadThumbQuality")),
    )


def _clamp_mp(raw: object) -> float:
    try:
        value = float(raw)
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
        return max(1, min(100, int(raw)))
    except (TypeError, ValueError):
        return _DEFAULT_QUALITY


def _stem(ident: int, megapixels: float, image_fmt: str, video_fmt: str, quality: int) -> str:
    return f"{ident}_{int(round(megapixels * 100))}_{image_fmt}_{video_fmt}_{quality}"


def _existing(stem: Path) -> Path | None:
    for ext in _THUMB_EXTS:
        path = Path(str(stem) + ext)
        if path.is_file():
            return path
    return None


def _drop_others(ident: int, keep: Path, root: Path) -> None:
    if not root.is_dir():
        return
    prefix = f"{ident}_"
    for path in root.iterdir():
        if path.is_file() and path.name.startswith(prefix) and path.resolve() != keep.resolve():
            path.unlink(missing_ok=True)


def _encode(
    data: bytes,
    media: str,
    stem: Path,
    image_fmt: str,
    video_fmt: str,
    megapixels: float,
    quality: int,
) -> Path | None:
    src_ext = model_thumb_anim.detect_ext(data, media)
    motion = model_thumb_anim.is_video_ext(src_ext) or src_ext == ".gif"
    if not motion:
        motion = _animated_still(data)
    if motion:
        path = model_thumb_anim.encode_animated(data, src_ext, stem, video_fmt, megapixels, quality)
        if path:
            return path
    return _write_still(data, stem, image_fmt, megapixels, quality)


def _animated_still(data: bytes) -> bool:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            image.load()
            return model_thumb_anim.is_animated_image(image)
    except Exception:
        return False


def _fit_megapixels(image: object, megapixels: float) -> None:
    width, height = image.size  # type: ignore[attr-defined]
    if width <= 0 or height <= 0:
        return
    cap = max(0.05, megapixels) * 1_000_000
    pixels = width * height
    if pixels <= cap:
        return
    ratio = (cap / pixels) ** 0.5
    image.thumbnail((max(1, round(width * ratio)), max(1, round(height * ratio))))  # type: ignore[attr-defined]


def _write_still(data: bytes, stem: Path, fmt: str, megapixels: float, quality: int) -> Path | None:
    pil_fmt, ext = {
        "png": ("PNG", ".png"),
        "jpg": ("JPEG", ".jpg"),
        "webp": ("WEBP", ".webp"),
    }.get(fmt, ("JPEG", ".jpg"))
    dest = Path(str(stem) + ext)
    try:
        from PIL import Image

        dest.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            _fit_megapixels(image, megapixels)
            if pil_fmt == "JPEG":
                if image.mode != "RGB":
                    image = image.convert("RGB")
            elif image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA")
            tmp = dest.with_name(dest.name + ".tmp")
            opts: dict[str, object] = {}
            if pil_fmt in {"JPEG", "WEBP"}:
                opts["quality"] = quality
            if pil_fmt == "JPEG":
                opts["optimize"] = True
            image.save(tmp, pil_fmt, **opts)
        tmp.replace(dest)
        return dest
    except (OSError, ValueError, SyntaxError):
        return None
