from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PromptMatrixIn(BaseModel):
    lines: str = ""
    save_grid: bool = True
    use_batch: bool = True
    mode: Literal["start", "end", "prompt_sr"] = "end"
    target: Literal["prompt", "negative"] = "prompt"
    search: str = ""


class XyAxisIn(BaseModel):
    type: str = "none"
    values: list[str] = Field(default_factory=list)


class XyPlotIn(BaseModel):
    x: XyAxisIn = Field(default_factory=XyAxisIn)
    y: XyAxisIn = Field(default_factory=XyAxisIn)
    draw_legend: bool = True
    draw_type: bool = False
    keep_minus_one: bool = False
    include_sub_images: bool = True
    respect_instant_lora: bool = False
    grid_margin: int = Field(default=0, ge=0, le=256)


class AutoLoraIn(BaseModel):
    path: str
    strength: float = 1.0


class JobIn(BaseModel):
    prompt: str = ""
    negative_prompt: str = ""
    checkpoint: str | None = None
    vae: str | None = None
    text_encoder: str | None = None
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
    xy_plot: XyPlotIn | None = None


class InterruptIn(BaseModel):
    mode: Literal["skip", "cancel"] = "skip"


class TemplateIn(BaseModel):
    name: str
    params: dict[str, Any] = Field(default_factory=dict)


class TemplateUpdate(BaseModel):
    params: dict[str, Any] | None = None
    name: str | None = None
    icon: dict[str, Any] | None = None
    apply: list[str] | None = None
    enabled: bool | None = None


class WorkflowApplyIn(BaseModel):
    apply: list[str]


class TemplateOrderIn(BaseModel):
    ids: list[str]


class ComfyFreeIn(BaseModel):
    unload_models: bool = False
    free_memory: bool = False
