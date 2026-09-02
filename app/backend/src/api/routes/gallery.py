from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from api.errors import ApiError
from api.http import file_response, image_response, removed_error, resolve_view
from features.gallery import service as gallery
from features.gallery.schemas import FavoriteIn, LibraryIn, LibraryOrderIn, RemovedIn
from features.generate import service as generate
from features.models import service as models

api = APIRouter()


@api.post("/user-removed")
def post_user_removed(body: RemovedIn) -> dict:
    try:
        return gallery.remove_entry(body.kind, body.path)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc


@api.get("/user-removed")
def get_user_removed() -> dict:
    return {"items": gallery.list_removed()}


@api.post("/user-removed/{item_id}/restore")
def restore_user_removed(item_id: str) -> dict:
    try:
        return gallery.restore(item_id)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc


@api.delete("/user-removed")
def delete_all_user_removed(kind: str = "") -> dict:
    return {"ok": True, "count": gallery.purge_all(kind or None)}


@api.delete("/user-removed/{item_id}")
def delete_user_removed(item_id: str) -> dict:
    try:
        gallery.purge_permanent(item_id)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc
    return {"ok": True}


@api.post("/user-removed/{item_id}/open")
def open_user_removed(item_id: str) -> dict:
    try:
        gallery.reveal(item_id)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc
    return {"ok": True}


@api.get("/user-removed/{item_id}/thumb")
def get_user_removed_thumb(
    item_id: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> FileResponse:
    try:
        key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
        path = gallery.thumb_file(item_id, key, view, use_global, opt)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc
    if not path:
        raise ApiError("not_found", "thumb not found")
    return file_response(path, models.thumb_media(path), immutable=True)


@api.get("/user-removed/{item_id}/thumb-meta")
def get_user_removed_thumb_meta(
    item_id: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> dict:
    try:
        key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
        return gallery.thumb_meta(item_id, key, view, use_global, opt)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc


@api.get("/gallery/items")
def list_gallery_items() -> dict:
    return {"items": gallery.list_items()}


@api.get("/gallery/items/since")
def list_gallery_since(created_at: str = "") -> dict:
    return {"items": gallery.list_since(created_at)}


@api.post("/gallery/sync")
def sync_gallery() -> dict:
    busy = gallery.start_sync()
    return {"ok": True, "busy": busy}


@api.get("/gallery/search")
def search_gallery(
    q: str = "",
    tag: list[str] = Query(default=[]),
    scope: list[str] = Query(default=[]),
    model: list[str] = Query(default=[]),
    lora: list[str] = Query(default=[]),
    wildcard: list[str] = Query(default=[]),
    media: str = "all",
    orientation: str = "all",
    folder: str = "",
    cursor: str = "",
    limit: int = 200,
    random: bool = False,
    favorite: bool = False,
) -> dict:
    try:
        unions = gallery.folder_unions(folder) if folder else None
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return gallery.search(
        q=q,
        tags=tag,
        scopes=scope,
        models=model,
        loras=lora,
        wildcards=wildcard,
        media=media,
        orientation=orientation,
        cursor=cursor,
        limit=limit,
        order_random=random,
        unions=unions,
        favorite=favorite,
    )


@api.get("/gallery/home")
def gallery_home() -> dict:
    return gallery.home()


@api.get("/gallery/browse/{kind}")
def gallery_browse(kind: str, sort: str = "recent", dir: str = "desc") -> dict:
    try:
        return gallery.browse(kind, sort, dir)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.get("/gallery/libraries")
def list_libraries() -> dict:
    return {"items": gallery.list_libraries()}


@api.post("/gallery/libraries")
def post_library(body: LibraryIn) -> dict:
    try:
        return gallery.create_library(body.model_dump())
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.put("/gallery/libraries/order")
def put_library_order(body: LibraryOrderIn) -> dict:
    try:
        return {"items": gallery.order_libraries(body.parent_id, body.ids)}
    except KeyError as exc:
        raise ApiError("not_found", str(exc), 404) from exc
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.put("/gallery/libraries/{ident}")
def put_library(ident: str, body: LibraryIn) -> dict:
    try:
        return gallery.update_library(ident, body.model_dump())
    except KeyError as exc:
        raise ApiError("not_found", str(exc), 404) from exc
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.delete("/gallery/libraries/{ident}")
def delete_library(ident: str) -> dict:
    if not gallery.delete_library(ident):
        raise ApiError("not_found", "gallery not found")
    return {"ok": True}


@api.get("/gallery/items/latest")
def latest_gallery_item() -> dict:
    return {"item": generate.latest_generation()}


@api.patch("/gallery/items/{ident}/favorite")
def patch_gallery_favorite(ident: str, body: FavoriteIn) -> dict:
    try:
        return gallery.set_favorite(ident, body.favorite)
    except KeyError as exc:
        raise ApiError("not_found", "image not found", 404) from exc
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.post("/gallery/items/{ident}/remove")
def post_gallery_remove(ident: str) -> dict:
    try:
        return gallery.remove_gallery_item(ident)
    except gallery.RemovedError as exc:
        raise removed_error(exc) from exc


@api.get("/gallery/items/{ident}/thumb")
def gallery_item_thumb(ident: str) -> FileResponse:
    path = gallery.item_thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return image_response(path)


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
    return image_response(path)


@api.get("/gallery/disk/{ident}/image")
def gallery_disk_image(ident: str) -> FileResponse:
    path = gallery.disk_image(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return image_response(path)
