from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from blombo.gallery import gallery, removed
from blombo.generate import jobs
from blombo.models import model_meta
from .common import ApiError, RemovedIn, file_response, image_response, removed_error, resolve_view

api = APIRouter()

@api.post("/user-removed")
def post_user_removed(body: RemovedIn) -> dict:
    try:
        return removed.remove_entry(body.kind, body.path)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc


@api.get("/user-removed")
def get_user_removed() -> dict:
    return {"items": removed.list_items()}


@api.post("/user-removed/{item_id}/restore")
def restore_user_removed(item_id: str) -> dict:
    try:
        return removed.restore(item_id)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc


@api.delete("/user-removed")
def delete_all_user_removed() -> dict:
    return {"ok": True, "count": removed.purge_all()}


@api.delete("/user-removed/{item_id}")
def delete_user_removed(item_id: str) -> dict:
    try:
        removed.purge_permanent(item_id)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc
    return {"ok": True}


@api.post("/user-removed/{item_id}/open")
def open_user_removed(item_id: str) -> dict:
    try:
        removed.reveal(item_id)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc
    return {"ok": True}


@api.get("/user-removed/{item_id}/thumb")
def get_user_removed_thumb(
    item_id: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> FileResponse:
    try:
        key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
        path = removed.thumb_file(item_id, key, view, use_global, opt)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc
    if not path:
        raise ApiError("not_found", "thumb not found")
    return file_response(path, model_meta.thumb_media(path), immutable=True)


@api.get("/user-removed/{item_id}/thumb-meta")
def get_user_removed_thumb_meta(
    item_id: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> dict:
    try:
        key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
        return removed.thumb_meta(item_id, key, view, use_global, opt)
    except removed.RemovedError as exc:
        raise removed_error(exc) from exc

@api.get("/gallery/items")
def list_gallery_items() -> dict:
    return {"items": gallery.list_items()}


@api.get("/gallery/items/latest")
def latest_gallery_item() -> dict:
    return {"item": jobs.latest_generation()}


@api.get("/gallery/items/{ident}/thumb")
def gallery_item_thumb(ident: str) -> FileResponse:
    path = gallery.item_thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return file_response(path, "image/jpeg")


@api.get("/gallery/items/{ident}/image")
def gallery_item_image(ident: str) -> FileResponse:
    path = gallery.item_image(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return image_response(path)


@api.get("/gallery/disk/{ident}/thumb")
def gallery_disk_thumb(ident: str) -> FileResponse:
    path = gallery.disk_thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return file_response(path, "image/jpeg")


@api.get("/gallery/disk/{ident}/image")
def gallery_disk_image(ident: str) -> FileResponse:
    path = gallery.disk_image(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return image_response(path)
