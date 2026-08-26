from __future__ import annotations

from pathlib import Path

from features.settings import service as settings
from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import index as gallery_index
from features.models.scripts import model_thumb_anim
from config import USER

THUMB_MAX = 256
THUMBS = USER / "gallery_thumbs"


def _hide() -> bool:
    return bool(settings.load().get("galleryHideInterrupted", True))


def _public(row: object) -> dict[str, str]:
    data = dict(row)  # type: ignore[arg-type]
    return {
        "id": str(data.get("id") or ""),
        "created_at": str(data.get("created_at") or ""),
        "media_kind": str(data.get("media_kind") or "image"),
        "asset_kind": str(data.get("asset_kind") or "image"),
        "checkpoint": str(data.get("checkpoint_name") or ""),
    }


def list_items(limit: int = 200) -> list[dict[str, str]]:
    cap = max(1, min(200, int(limit)))
    return [_public(row) for row in gallery_cache.list_rows(cap, _hide())]


def list_since(created_at: str, limit: int = 60) -> list[dict[str, str]]:
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
    dest = THUMBS / f"{safe_ident}.jpg"
    try:
        src_mtime = src.stat().st_mtime
        if dest.is_file() and dest.stat().st_mtime >= src_mtime:
            return dest
        THUMBS.mkdir(parents=True, exist_ok=True)
        from PIL import Image

        if src.suffix.lower() in gallery_index.VIDEO_EXTS:
            frame = model_thumb_anim.first_frame_path(src)
            if frame is None:
                return None
            image = frame.convert("RGB")
        else:
            with Image.open(src) as opened:
                opened.load()
                image = opened.convert("RGB") if opened.mode != "RGB" else opened.copy()
        if max(image.size) > THUMB_MAX:
            image.thumbnail((THUMB_MAX, THUMB_MAX))
        tmp = dest.with_suffix(".tmp")
        image.save(tmp, "JPEG", quality=80, optimize=True)
        tmp.replace(dest)
        return dest
    except (OSError, ValueError, SyntaxError):
        return None
