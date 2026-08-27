from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from api.errors import ApiError
from api.http import image_response
from features.generate import service as generate
from features.generate.schemas import InterruptIn, JobIn, TemplateIn, TemplateOrderIn, TemplateUpdate, WorkflowApplyIn

api = APIRouter()


@api.get("/workflows")
def workflows() -> dict:
    return {"workflows": generate.list_workflows()}


@api.get("/templates/{workflow}")
def list_templates(workflow: str) -> dict:
    packed, apply = generate.list_templates(workflow)
    return {"templates": packed, "defaultApply": apply, "apply": apply}


@api.put("/templates/{workflow}")
def put_workflow_apply(workflow: str, body: WorkflowApplyIn) -> dict:
    apply = generate.set_apply(workflow, body.apply)
    return {"defaultApply": apply, "apply": apply}


@api.post("/templates/{workflow}")
def post_template(workflow: str, body: TemplateIn) -> dict:
    return {"template": generate.create_template(workflow, body.name, body.params)}


@api.put("/templates/{workflow}/order")
def put_template_order(workflow: str, body: TemplateOrderIn) -> dict:
    packed, apply = generate.reorder_templates(workflow, body.ids)
    return {"templates": packed, "defaultApply": apply, "apply": apply}


@api.put("/templates/{workflow}/{template_id}")
def put_template(workflow: str, template_id: str, body: TemplateUpdate) -> dict:
    return {
        "template": generate.update_template(
            workflow, template_id, body.params, body.name, body.icon, body.apply, body.enabled
        )
    }


@api.delete("/templates/{workflow}/{template_id}")
def delete_template(workflow: str, template_id: str) -> dict:
    generate.delete_template(workflow, template_id)
    return {"ok": True}


@api.get("/comfy/ksampler")
def comfy_ksampler() -> dict:
    return generate.ksampler_choices()


@api.post("/jobs")
async def post_job(body: JobIn) -> dict:
    job = await generate.create_job(body.model_dump())
    return {"job": job}


@api.get("/jobs/latest")
def latest_job() -> dict:
    job = generate.latest_job()
    return {"job": job}


@api.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = generate.get_job(job_id)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@api.post("/jobs/{job_id}/interrupt")
def interrupt_job(job_id: str, body: InterruptIn) -> dict:
    job = generate.interrupt_job(job_id, body.mode)
    if not job:
        raise ApiError("not_found", "job not found")
    return {"job": job}


@api.get("/jobs/{job_id}/grid")
def job_grid(job_id: str) -> FileResponse:
    path = generate.grid_path(job_id, 0)
    if not path:
        raise ApiError("not_found", "grid not found")
    return image_response(path)


@api.get("/jobs/{job_id}/grid/{index}")
def job_grid_at(job_id: str, index: int) -> FileResponse:
    path = generate.grid_path(job_id, index)
    if not path:
        raise ApiError("not_found", "grid not found")
    return image_response(path)


def preview_response(data: bytes | None) -> Response:
    if not data:
        raise ApiError("not_found", "preview not found")
    return Response(
        content=data,
        media_type=generate.preview_media(data),
        headers={"Cache-Control": "no-store"},
    )


@api.get("/jobs/{job_id}/preview")
def job_preview(job_id: str) -> Response:
    if not generate.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return preview_response(generate.preview_bytes(job_id))


@api.get("/jobs/{job_id}/previews/{step}")
def job_preview_step(job_id: str, step: int) -> Response:
    if not generate.get_job(job_id):
        raise ApiError("not_found", "job not found")
    return preview_response(generate.preview_bytes(job_id, step))
