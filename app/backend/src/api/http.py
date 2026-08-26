from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import Request
from fastapi.responses import FileResponse

from api.errors import ApiError
from features.models import service as models


_CACHE_LONG = {"Cache-Control": "public, max-age=31536000, immutable"}
_CACHE_SHORT = {"Cache-Control": "private, max-age=120"}


def file_response(path: Path, media: str, *, immutable: bool = False) -> FileResponse:
    return FileResponse(path, media_type=media, headers=_CACHE_LONG if immutable else _CACHE_SHORT)


def image_response(path: Path | None) -> FileResponse:
    if not path:
        raise ApiError("not_found", "image not found")
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    elif suffix == ".webp":
        media = "image/webp"
    elif suffix == ".gif":
        media = "image/gif"
    elif suffix == ".mp4":
        media = "video/mp4"
    elif suffix == ".webm":
        media = "video/webm"
    else:
        media = "image/png"
    return file_response(path, media)


def resolve_view(
    context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> tuple[str, str, bool, list[str]]:
    parts = [part.strip() for part in context.replace(",", "+").split("+") if part.strip()]
    key = models.context_key(parts)
    view_kind = "likely" if mode == "likely" else "exact"
    selected = {item for item in models.parse_context(key) if item != models.GLOBAL_ID}
    opt_parts = [part.strip() for part in optional.replace(",", "+").split("+") if part.strip()]
    opt = [item for item in models.parse_context(models.context_key(opt_parts)) if item in selected]
    return key, view_kind, bool(fallback), opt


def thumb_meta(request: Request) -> dict[str, Any]:
    raw = request.headers.get("x-blombo-thumb-meta") or ""
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def removed_error(exc: Any) -> ApiError:
    return ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status)
