from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from blombo.generate import comfy, jobs, pnginfo, templates
from .common import (
    ApiError,
    InterruptIn,
    JobIn,
    TemplateIn,
    TemplateUpdate,
    WorkflowApplyIn,
    file_response,
    image_response,
)

api = APIRouter()

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
    return image_response(path)


@api.get("/jobs/{job_id}/grid/{index}")
def job_grid_at(job_id: str, index: int) -> FileResponse:
    path = jobs.grid_path(job_id, index)
    if not path:
        raise ApiError("not_found", "grid not found")
    return image_response(path)


def preview_response(data: bytes | None) -> Response:
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
    return preview_response(jobs.preview_bytes(job_id))


@api.get("/jobs/{job_id}/previews/{step}")
def job_preview_step(job_id: str, step: int) -> Response:
    if not jobs.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return preview_response(jobs.preview_bytes(job_id, step))
