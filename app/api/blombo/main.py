from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from blombo import civitai, comfy, db, hashes, issues, jobs, model_meta, models, pnginfo, safetensors_meta, settings, templates
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
    yield
    hashes.stop()


app = FastAPI(title="BlomboUI", lifespan=lifespan)


class JobIn(BaseModel):
    prompt: str = ""
    negative_prompt: str = ""
    checkpoint: str | None = None
    width: int | None = Field(default=None, ge=64, le=4096)
    height: int | None = Field(default=None, ge=64, le=4096)
    steps: int | None = Field(default=None, ge=1, le=150)
    cfg: float | None = Field(default=None, ge=1, le=30)
    seed: int | None = None
    batch_size: int = Field(default=1, ge=1, le=8)
    batch_count: int = Field(default=1, ge=1, le=100)
    batch_grid: bool | None = None
    batch_grid_max: int | None = Field(default=None, ge=2, le=100)
    batch_grid_quality: int | None = Field(default=None, ge=40, le=95)
    batch_grid_rows: int | None = Field(default=None, ge=0, le=25)
    batch_grid_fill: bool | None = None
    sampler: str | None = None
    scheduler: str | None = None
    workflow: str | None = None
    template: str | None = None


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


class WorkflowApplyIn(BaseModel):
    apply: list[str]


class ModelInfoUpdate(BaseModel):
    types: list[str] = Field(default_factory=list)
    prompt: str | None = None
    negative_prompt: str | None = None


class ComfyFreeIn(BaseModel):
    unload_models: bool = False
    free_memory: bool = False


@app.get("/workflows")
def workflows() -> dict:
    return {"workflows": comfy.list_workflows()}


@app.get("/templates/{workflow}")
def list_templates(workflow: str) -> dict:
    packed, apply = templates.list_templates(workflow)
    return {"templates": packed, "apply": apply}


@app.put("/templates/{workflow}")
def put_workflow_apply(workflow: str, body: WorkflowApplyIn) -> dict:
    return {"apply": templates.set_apply(workflow, body.apply)}


@app.post("/templates/{workflow}")
def post_template(workflow: str, body: TemplateIn) -> dict:
    return {"template": templates.create_template(workflow, body.name, body.params)}


@app.put("/templates/{workflow}/{template_id}")
def put_template(workflow: str, template_id: str, body: TemplateUpdate) -> dict:
    return {"template": templates.update_template(workflow, template_id, body.params, body.name)}


@app.get("/comfy/ksampler")
def comfy_ksampler() -> dict:
    return comfy.ksampler_choices()


@app.get("/user-models")
def get_models() -> dict:
    return models.list_models()


@app.get("/issues")
def get_issues() -> dict:
    return {"issues": issues.list_issues()}


@app.post("/user-models/refresh")
def post_models_refresh(kind: str | None = None) -> dict:
    if kind and kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    return models.refresh_models(kind)


@app.get("/user-models/{kind}/info")
def get_model_info(kind: str, path: str) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    info = models.model_info(kind, path)
    if not info:
        raise ApiError("not_found", "model not found")
    return info


@app.get("/user-models/{kind}/safetensors")
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


@app.put("/user-models/{kind}/info")
def put_model_info(kind: str, path: str, body: ModelInfoUpdate) -> dict:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    if not models.model_file(kind, path):
        raise ApiError("not_found", "model not found")
    info = model_meta.set_info(kind, path, body.types, body.prompt, body.negative_prompt)
    return {
        "types": info["types"],
        "prompt": info["prompt"],
        "negative_prompt": info["negative_prompt"],
        "thumb": model_meta.thumb_mtime(kind, path),
    }


@app.get("/user-models/{kind}/thumb")
def get_model_thumb(kind: str, path: str) -> FileResponse:
    if kind not in models.ALL_KINDS:
        raise ApiError("bad_request", f"unknown model kind: {kind}", 400)
    file = model_meta.thumb_file(kind, path)
    if not file:
        raise ApiError("not_found", "thumb not found")
    return FileResponse(file, media_type=model_meta.thumb_media(file))


@app.put("/user-models/{kind}/thumb")
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


@app.delete("/user-models/{kind}/thumb")
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


@app.post("/pnginfo")
async def post_pnginfo(request: Request) -> dict:
    data = await request.body()
    return pnginfo.read(data, request.headers.get("x-filename") or "")


@app.get("/civitai/by-hash/{hash}")
def civitai_by_hash(hash: str) -> dict:
    if not civitai.valid_hash(hash):
        raise ApiError("bad_request", "invalid hash", 400)
    data = civitai.by_hash(hash)
    if not data:
        raise ApiError("not_found", "no matching resource")
    return data


@app.get("/civitai/image")
def civitai_image(url: str) -> Response:
    hit = civitai.fetch_image(url)
    if not hit:
        raise ApiError("not_found", "image not found")
    data, media = hit
    return Response(content=data, media_type=media)


@app.get("/health")
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


@app.get("/comfy/stats")
def comfy_stats() -> dict:
    return comfy.gpu_stats()


@app.post("/comfy/free")
def comfy_free(body: ComfyFreeIn) -> dict:
    comfy.free(body.unload_models, body.free_memory)
    return {"ok": True}


@app.get("/user-settings")
def get_settings() -> dict:
    return {"settings": settings.load()}


@app.put("/user-settings")
def put_settings(body: dict[str, Any]) -> dict:
    return {"settings": settings.save(body)}


@app.post("/reload")
def reload_app() -> dict:
    flag = RUNTIME / "tmp" / "restart"
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text("1", encoding="utf-8")
    return {"ok": True}


@app.post("/jobs")
async def post_job(body: JobIn) -> dict:
    job = jobs.create_job(body.model_dump())
    return {"job": job}


@app.get("/jobs/latest")
def latest_job() -> dict:
    job = jobs.latest_job()
    return {"job": job}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get_job(job_id)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@app.post("/jobs/{job_id}/interrupt")
def interrupt_job(job_id: str, body: InterruptIn) -> dict:
    job = jobs.interrupt_job(job_id, body.mode)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@app.get("/jobs/{job_id}/grid")
def job_grid(job_id: str) -> FileResponse:
    path = jobs.grid_path(job_id, 0)
    if not path:
        raise ApiError("not_found", "grid not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/jobs/{job_id}/grid/{index}")
def job_grid_at(job_id: str, index: int) -> FileResponse:
    path = jobs.grid_path(job_id, index)
    if not path:
        raise ApiError("not_found", "grid not found")
    return FileResponse(path, media_type="image/jpeg")


def _preview_response(data: bytes | None) -> Response:
    if not data:
        raise ApiError("not_found", "preview not found")
    return Response(
        content=data,
        media_type=jobs.preview_media(data),
        headers={"Cache-Control": "no-store"},
    )


@app.get("/jobs/{job_id}/preview")
def job_preview(job_id: str) -> Response:
    if not jobs.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return _preview_response(jobs.preview_bytes(job_id))


@app.get("/jobs/{job_id}/previews/{step}")
def job_preview_step(job_id: str, step: int) -> Response:
    if not jobs.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return _preview_response(jobs.preview_bytes(job_id, step))


@app.get("/generations/latest")
def latest_generation() -> dict:
    row = jobs.latest_generation()
    return {"generation": row}


@app.get("/generations/{gen_id}/image")
def generation_image(gen_id: str) -> FileResponse:
    path = jobs.generation_path(gen_id)
    if not path:
        raise ApiError("not_found", "image not found")
    return FileResponse(path, media_type="image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png")
