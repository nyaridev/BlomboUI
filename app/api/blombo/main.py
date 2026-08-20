from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from blombo import civitai, comfy, db, dirs, gallery, hashes, issues, jobs, model_files, model_meta, models, pnginfo, removed, safetensors_meta, settings, templates, wildcard_files
from blombo.paths import RUNTIME, VERSION, launcher_env


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 404) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.connect()
    hashes.start()
    hashes.warm(models.hash_files())
    try:
        removed.purge_expired()
    except OSError:
        pass
    yield
    hashes.stop()


app = FastAPI(title="BlomboUI", lifespan=lifespan)
api = APIRouter()


class JobIn(BaseModel):
    prompt: str = ""
    negative_prompt: str = ""
    checkpoint: str | None = None
    width: int | None = Field(default=None, ge=64, le=4096)
    height: int | None = Field(default=None, ge=64, le=4096)
    steps: int | None = Field(default=None, ge=1, le=150)
    cfg: float | None = Field(default=None, ge=1, le=30)
    seed: int | None = None
    seed_after: str | None = None
    batch_size: int = Field(default=1, ge=1, le=8)
    batch_count: int = Field(default=1, ge=1, le=100)
    batch_grid: bool | None = None
    batch_grid_max: int | None = Field(default=None, ge=2, le=100)
    batch_grid_quality: int | None = Field(default=None, ge=40, le=95)
    batch_grid_rows: int | None = Field(default=None, ge=0, le=25)
    batch_grid_fill: bool | None = None
    batch_grid_on_cancel: bool | None = None
    save_interrupted: bool | None = None
    interrupted_in_grid: bool | None = None
    sampler: str | None = None
    scheduler: str | None = None
    workflow: str | None = None
    template: str | None = None
    output_image_path: str | None = None
    output_grid_path: str | None = None
    output_image_name: str | None = None
    output_grid_name: str | None = None


class InterruptIn(BaseModel):
    mode: Literal["skip", "cancel"] = "skip"


def _error_json(exc: ApiError | comfy.ComfyError | templates.TemplateError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": str(exc)})


@app.exception_handler(ApiError)
async def api_error(_request: Any, exc: ApiError) -> JSONResponse:
    return _error_json(exc)


@app.exception_handler(comfy.ComfyError)
async def comfy_error(_request: Any, exc: comfy.ComfyError) -> JSONResponse:
    return _error_json(exc)


@app.exception_handler(templates.TemplateError)
async def template_error(_request: Any, exc: templates.TemplateError) -> JSONResponse:
    return _error_json(exc)


class TemplateIn(BaseModel):
    name: str
    params: dict[str, Any] = Field(default_factory=dict)


class TemplateUpdate(BaseModel):
    params: dict[str, Any] | None = None
    name: str | None = None
    icon: dict[str, Any] | None = None


class WorkflowApplyIn(BaseModel):
    apply: list[str]


class ModelInfoUpdate(BaseModel):
    types: list[str] = Field(default_factory=list)
    prompt: str | None = None
    negative_prompt: str | None = None
    notes: str | None = None
    strength: float | None = None
    slider: bool | None = None


class ComfyFreeIn(BaseModel):
    unload_models: bool = False
    free_memory: bool = False


class OutputPathIn(BaseModel):
    path: str


class PathsCheckIn(BaseModel):
    paths: list[str] = Field(default_factory=list)


class WildcardFileIn(BaseModel):
    lines: list[str] | None = None
    tree: dict[str, Any] | None = None
    text: str | None = None


class WildcardCreateIn(BaseModel):
    folder: str = ""
    name: str


class WildcardPathIn(BaseModel):
    path: str = ""


class WildcardRenameIn(BaseModel):
    path: str = ""
    name: str


class WildcardMoveIn(BaseModel):
    path: str = ""
    folder: str = ""


class ModelFolderIn(BaseModel):
    folder: str = ""
    name: str


class ModelPathIn(BaseModel):
    path: str = ""


class ModelRenameIn(BaseModel):
    path: str = ""
    name: str


class ModelMoveIn(BaseModel):
    path: str = ""
    folder: str = ""


class RemovedIn(BaseModel):
    kind: str
    path: str = ""


@api.get("/workflows")
def workflows() -> dict:
    return {"workflows": comfy.list_workflows()}


@api.get("/templates/{workflow}")
def list_templates(workflow: str) -> dict:
    packed, apply = templates.list_templates(workflow)
    return {"templates": packed, "apply": apply}


@api.put("/templates/{workflow}")
def put_workflow_apply(workflow: str, body: WorkflowApplyIn) -> dict:
    return {"apply": templates.set_apply(workflow, body.apply)}


@api.post("/templates/{workflow}")
def post_template(workflow: str, body: TemplateIn) -> dict:
    return {"template": templates.create_template(workflow, body.name, body.params)}


@api.put("/templates/{workflow}/{template_id}")
def put_template(workflow: str, template_id: str, body: TemplateUpdate) -> dict:
    return {"template": templates.update_template(workflow, template_id, body.params, body.name, body.icon)}


@api.get("/comfy/ksampler")
def comfy_ksampler() -> dict:
    return comfy.ksampler_choices()


@api.get("/user-models")
def get_models() -> dict:
    return models.list_models()


@api.get("/issues")
def get_issues() -> dict:
    return {"issues": issues.list_issues()}


@api.post("/user-models/refresh")
def post_models_refresh(kind: str | None = None) -> dict:
    if kind and kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    return models.refresh_models(kind)


@api.get("/user-wildcards/tree")
def get_wildcard_tree() -> dict:
    return wildcard_files.tree()


@api.get("/user-wildcards/file")
def get_wildcard_file(path: str) -> dict:
    try:
        return wildcard_files.read_file(path)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.put("/user-wildcards/file")
def put_wildcard_file(path: str, body: WildcardFileIn) -> dict:
    try:
        return wildcard_files.write_file(path, body.model_dump())
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/file")
def post_wildcard_file(body: WildcardCreateIn) -> dict:
    try:
        return wildcard_files.create_file(body.folder, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/folder")
def post_wildcard_folder(body: WildcardCreateIn) -> dict:
    try:
        return wildcard_files.create_folder(body.folder, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/open")
def open_wildcard_file(body: WildcardPathIn) -> dict:
    try:
        wildcard_files.reveal(body.path)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
    return {"ok": True}


@api.post("/user-wildcards/move")
def move_wildcard_file(body: WildcardMoveIn) -> dict:
    try:
        return wildcard_files.move_entry(body.path, body.folder)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/rename")
def rename_wildcard_file(body: WildcardRenameIn) -> dict:
    try:
        return wildcard_files.rename_entry(body.path, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/format")
def format_wildcard_file(body: WildcardFileIn) -> dict:
    try:
        return wildcard_files.format_editor(body.tree, body.text)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.get("/user-models/{kind}/tree")
def get_model_tree(kind: str) -> dict:
    try:
        return model_files.tree(kind)
    except model_files.ModelFileError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-models/{kind}/folder")
def post_model_folder(kind: str, body: ModelFolderIn) -> dict:
    try:
        return model_files.create_folder(kind, body.folder, body.name)
    except model_files.ModelFileError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-models/{kind}/open")
def open_model_file(kind: str, body: ModelPathIn) -> dict:
    try:
        model_files.reveal(kind, body.path)
    except model_files.ModelFileError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
    return {"ok": True}


@api.post("/user-models/{kind}/move")
def move_model_file(kind: str, body: ModelMoveIn) -> dict:
    try:
        return model_files.move_entry(kind, body.path, body.folder)
    except model_files.ModelFileError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-models/{kind}/rename")
def rename_model_file(kind: str, body: ModelRenameIn) -> dict:
    try:
        return model_files.rename_entry(kind, body.path, body.name)
    except model_files.ModelFileError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


def _removed_error(exc: removed.RemovedError) -> ApiError:
    return ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status)


@api.post("/user-removed")
def post_user_removed(body: RemovedIn) -> dict:
    try:
        return removed.remove_entry(body.kind, body.path)
    except removed.RemovedError as exc:
        raise _removed_error(exc) from exc


@api.get("/user-removed")
def get_user_removed() -> dict:
    return {"items": removed.list_items()}


@api.post("/user-removed/{item_id}/restore")
def restore_user_removed(item_id: str) -> dict:
    try:
        return removed.restore(item_id)
    except removed.RemovedError as exc:
        raise _removed_error(exc) from exc


@api.delete("/user-removed")
def delete_all_user_removed() -> dict:
    return {"ok": True, "count": removed.purge_all()}


@api.delete("/user-removed/{item_id}")
def delete_user_removed(item_id: str) -> dict:
    try:
        removed.purge_permanent(item_id)
    except removed.RemovedError as exc:
        raise _removed_error(exc) from exc
    return {"ok": True}


@api.post("/user-removed/{item_id}/open")
def open_user_removed(item_id: str) -> dict:
    try:
        removed.reveal(item_id)
    except removed.RemovedError as exc:
        raise _removed_error(exc) from exc
    return {"ok": True}


@api.get("/user-removed/{item_id}/thumb")
def get_user_removed_thumb(item_id: str) -> FileResponse:
    try:
        path = removed.thumb_file(item_id)
    except removed.RemovedError as exc:
        raise _removed_error(exc) from exc
    if not path:
        raise ApiError("not_found", "thumb not found")
    return FileResponse(path, media_type=model_meta.thumb_media(path))


@api.get("/user-models/{kind}/info")
def get_model_info(kind: str, path: str) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    info = models.model_info(kind, path)
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
        return {"metadata": safetensors_meta.read(file)}
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.put("/user-models/{kind}/info")
def put_model_info(kind: str, path: str, body: ModelInfoUpdate) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    info = model_meta.set_info(
        kind,
        path,
        body.types,
        body.prompt,
        body.negative_prompt,
        body.notes,
        body.strength,
        body.slider,
    )
    return {
        "types": info["types"],
        "prompt": info["prompt"],
        "negative_prompt": info["negative_prompt"],
        "notes": info["notes"],
        "strength": info["strength"],
        "slider": info["slider"],
        "thumb": model_meta.thumb_mtime(kind, path),
    }


@api.get("/user-models/{kind}/thumb")
def get_model_thumb(kind: str, path: str) -> FileResponse:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    file = model_meta.thumb_file(kind, path)
    if not file:
        raise ApiError("not_found", "thumb not found")
    return FileResponse(file, media_type=model_meta.thumb_media(file))


@api.put("/user-models/{kind}/thumb")
async def put_model_thumb(kind: str, path: str, request: Request) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    try:
        thumb = model_meta.save_thumb(kind, path, await request.body())
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"thumb": thumb}


@api.delete("/user-models/{kind}/thumb")
def delete_model_thumb(kind: str, path: str) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    try:
        model_meta.delete_thumb(kind, path)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"thumb": 0}


@api.post("/pnginfo")
async def post_pnginfo(request: Request) -> dict:
    data = await request.body()
    return pnginfo.read(data, request.headers.get("x-filename") or "")


@api.get("/civitai/by-hash/{hash}")
def civitai_by_hash(hash: str) -> dict:
    if not civitai.valid_hash(hash):
        raise ApiError("bad_request", "invalid hash", 400)
    data = civitai.by_hash(hash)
    if not data:
        raise ApiError("not_found", "no matching resource")
    return data


@api.get("/civitai/image")
def civitai_image(url: str) -> Response:
    hit = civitai.fetch_image(url)
    if not hit:
        raise ApiError("not_found", "image not found")
    data, media = hit
    return Response(content=data, media_type=media)


@api.get("/health")
def health() -> dict:
    env = launcher_env()
    return {
        "ok": True,
        "api": "blombo",
        "version": VERSION,
        "comfy": {
            "reachable": comfy.reachable(),
            "mode": env.get("comfyui.mode"),
            "path": env.get("comfyui.path"),
            "url": comfy.comfy_base(),
        },
    }


@api.get("/comfy/stats")
def comfy_stats() -> dict:
    return comfy.gpu_stats()


@api.post("/comfy/free")
def comfy_free(body: ComfyFreeIn) -> dict:
    comfy.free(body.unload_models, body.free_memory)
    return {"ok": True}


@api.get("/user-settings")
def get_settings() -> dict:
    return {"settings": settings.load()}


@api.put("/user-settings")
def put_settings(body: dict[str, Any]) -> dict:
    data = settings.save(body)
    dirs.write_extra_model_paths()
    return {"settings": data}


@api.post("/pick-folder")
def pick_folder() -> dict:
    try:
        return {"path": dirs.pick_folder()}
    except RuntimeError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.get("/paths")
def get_paths() -> dict:
    return dirs.resolved()


@api.post("/paths/check")
def check_paths(body: PathsCheckIn) -> dict:
    exists: dict[str, bool] = {}
    for raw in body.paths[:80]:
        text = str(raw or "").strip()
        if not text:
            continue
        exists[text] = dirs.dir_exists(text)
    return {"exists": exists}


@api.post("/paths/open")
def open_path(body: OutputPathIn) -> dict:
    try:
        dirs.open_folder(body.path)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"ok": True}


@api.put("/paths/output")
def put_output_path(body: OutputPathIn) -> dict:
    try:
        return dirs.set_output_root(body.path)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.post("/paths/models/sync")
def sync_model_paths() -> dict:
    dirs.write_extra_model_paths()
    return {"ok": True}


@api.post("/reload")
def reload_app() -> dict:
    flag = RUNTIME / "tmp" / "restart"
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text("1", encoding="utf-8")
    return {"ok": True}


@api.post("/jobs")
async def post_job(body: JobIn) -> dict:
    job = jobs.create_job(body.model_dump())
    return {"job": job}


@api.get("/jobs/latest")
def latest_job() -> dict:
    job = jobs.latest_job()
    return {"job": job}


@api.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get_job(job_id)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@api.post("/jobs/{job_id}/interrupt")
def interrupt_job(job_id: str, body: InterruptIn) -> dict:
    job = jobs.interrupt_job(job_id, body.mode)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@api.get("/jobs/{job_id}/grid")
def job_grid(job_id: str) -> FileResponse:
    path = jobs.grid_path(job_id, 0)
    if not path:
        raise ApiError("not_found", "grid not found")
    return FileResponse(path, media_type="image/png" if path.suffix.lower() == ".png" else "image/jpeg")


@api.get("/jobs/{job_id}/grid/{index}")
def job_grid_at(job_id: str, index: int) -> FileResponse:
    path = jobs.grid_path(job_id, index)
    if not path:
        raise ApiError("not_found", "grid not found")
    return FileResponse(path, media_type="image/png" if path.suffix.lower() == ".png" else "image/jpeg")


def _preview_response(data: bytes | None) -> Response:
    if not data:
        raise ApiError("not_found", "preview not found")
    return Response(
        content=data,
        media_type=jobs.preview_media(data),
        headers={"Cache-Control": "no-store"},
    )


@api.get("/jobs/{job_id}/preview")
def job_preview(job_id: str) -> Response:
    if not jobs.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return _preview_response(jobs.preview_bytes(job_id))


@api.get("/jobs/{job_id}/previews/{step}")
def job_preview_step(job_id: str, step: int) -> Response:
    if not jobs.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return _preview_response(jobs.preview_bytes(job_id, step))


@api.get("/generations")
def list_generations() -> dict:
    return {"generations": gallery.list_items()}


@api.get("/generations/latest")
def latest_generation() -> dict:
    row = jobs.latest_generation()
    return {"generation": row}


@api.get("/gallery/disk/{ident}/thumb")
def gallery_disk_thumb(ident: str) -> FileResponse:
    path = gallery.disk_thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return FileResponse(path, media_type="image/jpeg")


@api.get("/gallery/disk/{ident}/image")
def gallery_disk_image(ident: str) -> FileResponse:
    path = gallery.disk_image(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    elif suffix == ".webp":
        media = "image/webp"
    else:
        media = "image/png"
    return FileResponse(path, media_type=media)


@api.get("/generations/{gen_id}/thumb")
def generation_thumb(gen_id: str) -> FileResponse:
    path = gallery.generation_thumb(gen_id)
    if not path:
        raise ApiError("not_found", "image not found")
    return FileResponse(path, media_type="image/jpeg")


@api.get("/generations/{gen_id}/image")
def generation_image(gen_id: str) -> FileResponse:
    path = jobs.generation_path(gen_id)
    if not path:
        raise ApiError("not_found", "image not found")
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    elif suffix == ".webp":
        media = "image/webp"
    else:
        media = "image/png"
    return FileResponse(path, media_type=media)


app.include_router(api, prefix="/api")
