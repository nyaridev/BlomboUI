from __future__ import annotations

from pathlib import Path

from blombo import settings
from blombo.gallery import cache as gallery_cache
from blombo.paths import USER

THUMB_MAX = 256
THUMBS = USER / "gallery_thumbs"


def list_items(limit: int = 200) -> list[dict[str, str]]:
    cap = max(1, min(200, int(limit)))
    hide = bool(settings.load().get("galleryHideInterrupted", True))
    return [
        {"id": str(row["id"]), "created_at": str(row["created_at"])}
        for row in gallery_cache.list_rows(cap, hide)
    ]


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
        from PIL import Image

        THUMBS.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as image:
            image.load()
            if max(image.size) > THUMB_MAX:
                image.thumbnail((THUMB_MAX, THUMB_MAX))
            if image.mode != "RGB":
                image = image.convert("RGB")
            tmp = dest.with_suffix(".tmp")
            image.save(tmp, "JPEG", quality=80, optimize=True)
        tmp.replace(dest)
        return dest
    except (OSError, ValueError, SyntaxError):
        return None
