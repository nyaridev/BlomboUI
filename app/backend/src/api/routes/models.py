from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from api.errors import ApiError
from api.http import file_response, resolve_view, thumb_meta
from features.models import service as models
from features.models.schemas import ModelInfoUpdate, ScopeIn

api = APIRouter()


@api.get("/user-models")
def get_models(context: str = "", mode: str = "exact", fallback: bool = False, optional: str = "") -> dict:
    key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
    return models.list_models(key, view, use_global, opt)


@api.post("/user-models/refresh")
def post_models_refresh(
    kind: str | None = None, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> dict:
    if kind and kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
    return models.refresh_models(kind, key, view, use_global, opt)


@api.get("/user-models/{kind}/info")
def get_model_info(
    kind: str, path: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
    info = models.model_info(kind, path, key, view, use_global, opt)
    if not info:
        raise ApiError("not_found", "model not found")
    return info


@api.get("/user-models/{kind}/safetensors")
def get_model_safetensors(kind: str, path: str) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    file = models.model_file(kind, path)
    if not file:
        raise ApiError("not_found", "model not found")
    if not file.name.lower().endswith(".safetensors"):
        raise ApiError("bad_request", "not a safetensors file", 400)
    try:
        return {"metadata": models.read_safetensors(file)}
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.put("/user-models/{kind}/info")
def put_model_info(kind: str, path: str, body: ModelInfoUpdate) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    updates: dict[str, object] = {}
    if "auto_apply" in body.model_fields_set:
        updates["auto_apply"] = body.auto_apply
    if "apply_at" in body.model_fields_set:
        updates["apply_at"] = body.apply_at
    info = models.set_info(
        kind,
        path,
        body.types,
        body.prompt,
        body.negative_prompt,
        body.notes,
        body.strength,
        body.slider,
        **updates,
    )
    return {
        "types": info["types"],
        "prompt": info["prompt"],
        "negative_prompt": info["negative_prompt"],
        "notes": info["notes"],
        "strength": info["strength"],
        "slider": info["slider"],
        "auto_apply": info["auto_apply"],
        "apply_at": info["apply_at"],
        "thumb": models.thumb_mtime(kind, path),
    }


@api.get("/user-models/{kind}/thumb")
def get_model_thumb(
    kind: str, path: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> FileResponse:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
    file = models.resolved_file(kind, path, key, view, use_global, opt)
    if not file:
        raise ApiError("not_found", "thumb not found")
    return file_response(file, models.thumb_media(file), immutable=True)


@api.get("/user-models/{kind}/thumb-meta")
def get_model_thumb_meta(
    kind: str, path: str, context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    key, view, use_global, opt = resolve_view(context, mode, fallback, optional)
    file = models.resolved_file(kind, path, key, view, use_global, opt)
    return models.read_thumb_meta(file) if file else {}


@api.put("/user-models/{kind}/thumb")
async def put_model_thumb(kind: str, path: str, request: Request, context: str = "") -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    key, _, _, _ = resolve_view(context)
    try:
        thumb = models.save_thumb(
            kind,
            path,
            await request.body(),
            key,
            thumb_meta(request),
            request.headers.get("content-type", ""),
        )
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"thumb": thumb}


@api.delete("/user-models/{kind}/thumb")
def delete_model_thumb(kind: str, path: str, context: str = "", all_contexts: bool = False) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    key, _, _, _ = resolve_view(context)
    try:
        models.delete_thumb(kind, path, key, all_contexts)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"thumb": 0}


@api.get("/user-thumbs")
def get_saved_thumbs() -> dict:
    return {"thumbs": models.list_saved()}


@api.get("/user-scopes")
def get_scopes() -> dict:
    return {"scopes": models.list_scopes()}


@api.get("/user-scopes/auto")
def auto_scopes(prompt: str = "") -> dict:
    return {"ids": models.auto_ids(prompt)}


@api.post("/user-scopes")
def post_scope(body: ScopeIn) -> dict:
    try:
        return {"scope": models.create_scope(body.model_dump())}
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.put("/user-scopes/{ident}")
def put_scope(ident: str, body: ScopeIn) -> dict:
    try:
        return {"scope": models.update_scope(ident, body.model_dump())}
    except ValueError as exc:
        text = str(exc)
        status = 404 if text == "not found" else 400
        raise ApiError("not_found" if status == 404 else "bad_request", text, status) from exc


@api.delete("/user-scopes/{ident}")
def delete_scope(ident: str) -> dict:
    try:
        models.delete_scope(ident)
    except ValueError as exc:
        text = str(exc)
        status = 404 if text == "not found" else 400
        raise ApiError("not_found" if status == 404 else "bad_request", text, status) from exc
    models.drop_scope(ident)
    return {"ok": True}
