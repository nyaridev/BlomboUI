from __future__ import annotations

from pathlib import Path

from blombo import dirs, jobs, settings
from blombo.paths import USER

THUMB_MAX = 256
THUMBS = USER / "gallery_thumbs"


def list_items(limit: int = 200) -> list[dict[str, str]]:
    cap = max(1, min(200, int(limit)))
    hide = bool(settings.load().get("galleryHideInterrupted", True))
    rows = jobs.list_generations(cap, hide_interrupted=hide) + dirs.extra_gallery_items(hide_interrupted=hide)
    rows.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return rows[:cap]


def generation_thumb(gen_id: str) -> Path | None:
    src = jobs.generation_path(gen_id)
    if not src:
        return None
    return _thumb(src, gen_id)


def disk_image(ident: str) -> Path | None:
    path = dirs.disk_path(ident)
    if not path or not dirs.allowed_file(path):
        return None
    return path


def disk_thumb(ident: str) -> Path | None:
    src = disk_image(ident)
    if not src:
        return None
    return _thumb(src, ident)


def _thumb(src: Path, ident: str) -> Path | None:
    dest = THUMBS / f"{ident}.jpg"
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
