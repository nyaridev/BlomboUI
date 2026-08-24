from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from blombo.models import thumbnail_scopes


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 404) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class PromptMatrixIn(BaseModel):
    lines: str = ""
    save_grid: bool = True
    use_batch: bool = True


class AutoLoraIn(BaseModel):
    path: str
    strength: float = 1.0


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
    batch_grid_format: str | None = None
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
    auto_loras: list[str | AutoLoraIn] = Field(default_factory=list)
    prompt_matrix: PromptMatrixIn | None = None


class InterruptIn(BaseModel):
    mode: Literal["skip", "cancel"] = "skip"


class CivitaiDownloadIn(BaseModel):
    modelId: int = Field(gt=0)
    versionId: int = Field(gt=0)
    fileId: int | None = Field(default=None, gt=0)
    customNaming: bool = False
    modelName: str = ""
    creatorAlias: str = ""


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
    auto_apply: bool | None = None
    apply_at: Literal["start", "end"] | None = None


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


class AutocompleteCsvIn(BaseModel):
    name: str


class ScopeIn(BaseModel):
    name: str = ""
    group: str = ""
    anyGroups: list[list[str]] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)
    priority: int = 0


def error_json(exc: Any) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": str(exc)})


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
    else:
        media = "image/png"
    return file_response(path, media)


def resolve_view(
    context: str = "", mode: str = "exact", fallback: bool = False, optional: str = ""
) -> tuple[str, str, bool, list[str]]:
    parts = [part.strip() for part in context.replace(",", "+").split("+") if part.strip()]
    key = thumbnail_scopes.context_key(parts)
    view_kind = "likely" if mode == "likely" else "exact"
    selected = {item for item in thumbnail_scopes.parse_context(key) if item != thumbnail_scopes.GLOBAL_ID}
    opt_parts = [part.strip() for part in optional.replace(",", "+").split("+") if part.strip()]
    opt = [item for item in thumbnail_scopes.parse_context(thumbnail_scopes.context_key(opt_parts)) if item in selected]
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
