from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import FileResponse

from api.errors import ApiError
from api.http import file_response
from features.history import service as history

api = APIRouter()


@api.get("/history/browse")
def get_browse_history() -> dict:
    return {"items": history.list_items()}


@api.post("/history/browse")
def post_browse_history(body: dict[str, Any]) -> dict:
    try:
        return history.record(body)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.get("/history/browse/{ident}/thumb")
def get_browse_thumb(ident: int) -> FileResponse:
    path = history.thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return file_response(path, history.thumb_media(path))


@api.delete("/history/browse/{ident}")
def delete_browse_item(ident: int) -> dict:
    if not history.remove(ident):
        raise ApiError("not_found", "history item not found")
    return {"ok": True}


@api.delete("/history/browse")
def delete_browse_history() -> dict:
    return {"ok": True, "count": history.clear()}
