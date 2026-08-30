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


class HiresLoraIn(BaseModel):
    path: str
    strength: float = 1.0


class AttentionIn(BaseModel):
    enabled: bool = False
    engine: Literal["sage", "flash"] = "sage"
    sage_attention: str = "auto"
    allow_compile: bool = False


class HiresIn(BaseModel):
    enabled: bool = False
    scale: float = Field(default=1.5, ge=1, le=8)
    size_mode: Literal["scale", "raw", "scaler", "set"] = "scale"
    width: int | None = Field(default=None, ge=64, le=4096)
    height: int | None = Field(default=None, ge=64, le=4096)
    aspect: str = ""
    megapixels: float = Field(default=1, ge=0.2, le=4)
    upscale_model: str = ""
    steps: int = Field(default=25, ge=1, le=150)
    cfg: float = Field(default=4, ge=1, le=30)
    cfg_override: bool = False
    sampler: str = ""
    sampler_override: bool = False
    scheduler: str = ""
    scheduler_override: bool = False
    denoise: float = Field(default=0.55, ge=0, le=1)
    seed: int = -1
    seed_after: Literal["randomize", "fixed", "increment", "decrement"] = "randomize"
    seed_override: bool = False
    seed_follow: bool | None = None
    upscale_method: Literal["nearest-exact", "bilinear", "area", "bicubic", "lanczos"] = "bilinear"
    crop: Literal["disabled", "center"] = "disabled"
    prompt_override: bool = False
    prompt: str = ""
    negative_override: bool = False
    negative_prompt: str = ""
    model_override: bool = False
    checkpoint: str = ""
    vae: str = ""
    text_encoder: str = ""
    kind: str = ""
    lora_override: bool = False
    loras: list[HiresLoraIn] = Field(default_factory=list)
    save_before: bool = False
    clear_vram: bool = False
    attention_override: bool = False
    attention_engine: Literal["sage", "flash"] = "sage"
    sage_attention: str = "auto"
    allow_compile: bool = False


class AdetailerUnitIn(BaseModel):
    id: str = ""
    name: str = ""
    enabled: bool = True
    detector: str = ""
    sam_model: str = ""
    guide_size: float = Field(default=512, ge=64, le=4096)
    guide_size_for: bool = True
    max_size: float = Field(default=1024, ge=64, le=4096)
    steps: int = Field(default=20, ge=1, le=150)
    cfg: float = Field(default=4, ge=1, le=30)
    cfg_override: bool = False
    denoise: float = Field(default=0.5, ge=0, le=1)
    sampler: str = ""
    sampler_override: bool = False
    scheduler: str = ""
    scheduler_override: bool = False
    seed: int = -1
    seed_after: Literal["randomize", "fixed", "increment", "decrement"] = "randomize"
    seed_override: bool = False
    prompt_override: bool = False
    prompt: str = ""
    negative_override: bool = False
    negative_prompt: str = ""
    from_hires: bool = True
    advanced_override: bool = False
    feather: int = Field(default=5, ge=0, le=100)
    noise_mask: bool = True
    force_inpaint: bool = True
    bbox_threshold: float = Field(default=0.5, ge=0, le=1)
    bbox_dilation: int = Field(default=10, ge=-512, le=512)
    bbox_crop_factor: float = Field(default=3, ge=1, le=10)
    sam_detection_hint: str = "center-1"
    sam_dilation: int = Field(default=0, ge=-512, le=512)
    sam_threshold: float = Field(default=0.93, ge=0, le=1)
    sam_bbox_expansion: int = Field(default=0, ge=0, le=1000)
    sam_mask_hint_threshold: float = Field(default=0.7, ge=0, le=1)
    sam_mask_hint_use_negative: str = "False"
    drop_size: int = Field(default=10, ge=1, le=4096)
    cycle: int = Field(default=1, ge=1, le=10)
    inpaint_model: bool = False
    noise_mask_feather: int = Field(default=20, ge=0, le=100)
    tiled_encode: bool = False
    tiled_decode: bool = False
    device_mode: str = "Prefer GPU"
    model_override: bool = False
    checkpoint: str = ""
    vae: str = ""
    text_encoder: str = ""
    kind: str = ""
    lora_override: bool = False
    loras: list[HiresLoraIn] = Field(default_factory=list)
    attention_override: bool = False
    attention_engine: Literal["sage", "flash"] = "sage"
    sage_attention: str = "auto"
    allow_compile: bool = False


class AdetailerIn(BaseModel):
    enabled: bool = False
    from_hires: bool = True
    units: list[AdetailerUnitIn] = Field(default_factory=list)


class RembgIn(BaseModel):
    engine: Literal["rmbg", "birefnet"] = "rmbg"
    rmbg_model: str = "RMBG-2.0"
    birefnet_model: str = "BiRefNet-general"
    sensitivity: float = Field(default=1, ge=0, le=1)
    process_res: int = Field(default=1024, ge=256, le=2048)
    mask_blur: int = Field(default=0, ge=0, le=64)
    mask_offset: int = Field(default=0, ge=-64, le=64)
    invert_output: bool = False
    refine_foreground: bool = False
    background: Literal["Alpha", "Color"] = "Alpha"
    background_color: str = "#222222"
    input_mode: Literal["files", "directory"] = "files"
    input_dir: str = ""
    preserve_metadata: bool = False


class UpscaleIn(BaseModel):
    engine: Literal["model", "seedvr2"] = "model"
    input_mode: Literal["files", "directory"] = "files"
    input_dir: str = ""
    upscale_model: str = ""
    scale: float = Field(default=2, ge=1, le=8)
    size_mode: Literal["scale", "raw", "scaler", "set"] = "scale"
    width: int = Field(default=1024, ge=64, le=4096)
    height: int = Field(default=1024, ge=64, le=4096)
    aspect: str = "2:3"
    megapixels: float = Field(default=1, ge=0.2, le=4)
    upscale_method: Literal["nearest-exact", "bilinear", "area", "bicubic", "lanczos"] = "bilinear"
    crop: Literal["disabled", "center"] = "disabled"
    seed: int = 42
    color_correction: str = "lab"
    max_resolution: int = Field(default=4096, ge=64, le=8192)
    max_resolution_override: bool = False
    batch_size: int = Field(default=1, ge=1, le=64)
    uniform_batch_size: bool = False
    temporal_overlap: int = Field(default=0, ge=0, le=64)
    prepend_frames: int = Field(default=0, ge=0, le=64)
    input_noise_scale: float = Field(default=0, ge=0, le=1)
    latent_noise_scale: float = Field(default=0, ge=0, le=1)
    offload_device: str = "cpu"
    enable_debug: bool = False
    dit_model: str = "seedvr2_ema_7b_sharp_fp16.safetensors"
    dit_device: str = "cuda:0"
    blocks_to_swap: int = Field(default=36, ge=0, le=64)
    swap_io_components: bool = False
    dit_offload_device: str = "cpu"
    dit_cache_model: bool = False
    attention_mode: str = "sdpa"
    vae_model: str = "ema_vae_fp16.safetensors"
    vae_device: str = "cuda:0"
    encode_tiled: bool = True
    encode_tile_size: int = Field(default=1024, ge=64, le=4096)
    encode_tile_overlap: int = Field(default=128, ge=0, le=1024)
    decode_tiled: bool = True
    decode_tile_size: int = Field(default=1024, ge=64, le=4096)
    decode_tile_overlap: int = Field(default=128, ge=0, le=1024)
    tile_debug: str = "false"
    vae_offload_device: str = "cpu"
    vae_cache_model: bool = False
    allow_compile: bool = False
    compile_backend: str = "inductor"
    compile_mode: str = "default"
    compile_fullgraph: bool = False
    compile_dynamic: bool = False
    dynamo_cache_size_limit: int = Field(default=64, ge=1, le=256)
    dynamo_recompile_limit: int = Field(default=128, ge=1, le=512)


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
    clip_skip: int | None = Field(default=None, ge=1, le=10)
    clip_type: str | None = None
    clip_device: str | None = None
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
    output_hires_path: str | None = None
    output_hires_name: str | None = None
    hires: HiresIn | None = None
    adetailer: AdetailerIn | None = None
    auto_loras: list[str | AutoLoraIn] = Field(default_factory=list)
    prompt_matrix: PromptMatrixIn | None = None
    xy_plot: XyPlotIn | None = None
    rembg: RembgIn | None = None
    upscale: UpscaleIn | None = None
    attention: AttentionIn | None = None
    input_dir: str | None = None
    input_paths: list[str] = Field(default_factory=list)


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
