from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Any

from config import models_root
from features.generate.scripts.workflow.rembg import source_path

PATH_DEFAULT = "image_upscale/[date]"
SEED_MAX = 2**32 - 1
SEED_SPAN = SEED_MAX + 1
_ENGINES = {"model", "seedvr2"}
_SIZE_MODES = {"scale", "raw", "scaler", "set", "max"}
_IMAGE_SCALE_METHODS = frozenset({"nearest-exact", "bilinear", "area", "bicubic", "lanczos"})
_IMAGE_SCALE_CROPS = frozenset({"disabled", "center"})
_MODEL_KINDS = {"UpscaleModelLoader", "ImageUpscaleWithModel", "ImageScale"}
_SEEDVR2_KINDS = {
    "JoinImageWithAlpha",
    "SeedVR2TorchCompileSettings",
    "SeedVR2LoadVAEModel",
    "SeedVR2LoadDiTModel",
    "SeedVR2VideoUpscaler",
}
_MODEL_EXTS = {".safetensors", ".pt", ".pth", ".ckpt", ".bin"}
_BACKGROUNDS = {"Alpha", "Color"}
DIT_DEFAULT = "seedvr2_ema_7b_sharp_fp16.safetensors"
VAE_DEFAULT = "ema_vae_fp16.safetensors"


def is_image_upscale(values: dict[str, Any]) -> bool:
    return Path(str(values.get("workflow") or values.get("workflow_id") or "")).stem == "image_upscale"


def is_file_utility(values: dict[str, Any]) -> bool:
    return Path(str(values.get("workflow") or values.get("workflow_id") or "")).stem in {
        "background_removal",
        "image_upscale",
        "image_caption",
        "dataset_prep",
    }


def empty_params() -> dict[str, Any]:
    return {
        "prompt": "",
        "negative_prompt": "",
        "prompt_raw": "",
        "negative_prompt_raw": "",
        "models": [],
    }


def list_seedvr2_models() -> list[str]:
    names: set[str] = set()
    root = models_root() / "SEEDVR2"
    if root.is_dir():
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix.lower() in _MODEL_EXTS:
                names.add(str(path.relative_to(root)).replace("\\", "/"))
    return sorted(names)


def _blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("upscale")
    return raw if isinstance(raw, dict) else {}


def _flag(src: dict[str, Any], snake: str, camel: str) -> bool:
    if snake in src:
        return bool(src.get(snake))
    return bool(src.get(camel))


def _text(src: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        raw = src.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return default


def _int(src: dict[str, Any], *keys: str, default: int = 0) -> int:
    for key in keys:
        if key not in src:
            continue
        try:
            return int(src.get(key))
        except (TypeError, ValueError):
            continue
    return default


def _float(src: dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for key in keys:
        if key not in src:
            continue
        try:
            return float(src.get(key))
        except (TypeError, ValueError):
            continue
    return default


def wrap_seed(raw: int) -> int:
    if raw < 0:
        return random.randint(0, SEED_MAX)
    return raw % SEED_SPAN


def _clean_seed(src: dict[str, Any]) -> int:
    seed = _int(src, "seed", default=42)
    if seed < 0:
        return -1
    return seed % SEED_SPAN


def _round_to_8(value: float) -> int:
    return max(8, int(math.ceil(float(value) / 8.0)) * 8)


def clean_upscale(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    engine = str(src.get("engine") or "model")
    if engine not in _ENGINES:
        engine = "model"
    mode = str(src.get("size_mode") or src.get("sizeMode") or "scale").strip().lower()
    if mode not in _SIZE_MODES:
        mode = "scale"
    method = str(src.get("upscale_method") or src.get("upscaleMethod") or "bilinear").strip()
    if method not in _IMAGE_SCALE_METHODS:
        method = "bilinear"
    crop = str(src.get("crop") or "disabled").strip()
    if crop not in _IMAGE_SCALE_CROPS:
        crop = "disabled"
    try:
        scale = float(src.get("scale") if src.get("scale") is not None else 2)
    except (TypeError, ValueError):
        scale = 2.0
    try:
        megapixels = float(src.get("megapixels") if src.get("megapixels") is not None else 1)
    except (TypeError, ValueError):
        megapixels = 1.0
    color = _text(src, "color_correction", "colorCorrection", default="lab") or "lab"
    background = str(src.get("background") or "Alpha").strip()
    if background not in _BACKGROUNDS:
        background = "Alpha"
    background_color = str(src.get("background_color") or src.get("backgroundColor") or "#222222").strip() or "#222222"
    offload = _text(src, "offload_device", "offloadDevice", default="cpu") or "cpu"
    dit_device = _text(src, "dit_device", "ditDevice", default="cuda:0") or "cuda:0"
    vae_device = _text(src, "vae_device", "vaeDevice", default="cuda:0") or "cuda:0"
    attention = _text(src, "attention_mode", "attentionMode", default="sdpa") or "sdpa"
    compile_backend = _text(src, "compile_backend", "compileBackend", default="inductor") or "inductor"
    compile_mode = _text(src, "compile_mode", "compileMode", default="default") or "default"
    tile_debug = str(src.get("tile_debug") or src.get("tileDebug") or "false")
    return {
        "engine": engine,
        "input_mode": "directory" if str(src.get("input_mode") or src.get("inputMode") or "") == "directory" else "files",
        "input_dir": _text(src, "input_dir", "inputDir"),
        "upscale_model": _text(src, "upscale_model", "upscaleModel"),
        "scale": max(1.0, min(8.0, scale)),
        "size_mode": mode,
        "width": max(64, min(4096, _int(src, "width", default=1024))),
        "height": max(64, min(4096, _int(src, "height", default=1024))),
        "aspect": _text(src, "aspect", default="2:3") or "2:3",
        "megapixels": max(0.2, min(4.0, megapixels)),
        "upscale_method": method,
        "crop": crop,
        "seed": _clean_seed(src),
        "color_correction": color,
        "background": background,
        "background_color": background_color,
        "resolution": max(64, min(8192, _int(src, "resolution", default=2560))),
        "max_resolution": max(0, min(8192, _int(src, "max_resolution", "maxResolution", default=2560))),
        "max_resolution_override": _flag(src, "max_resolution_override", "maxResolutionOverride"),
        "batch_size": 1,
        "uniform_batch_size": False,
        "temporal_overlap": max(0, min(64, _int(src, "temporal_overlap", "temporalOverlap", default=0))),
        "prepend_frames": max(0, min(64, _int(src, "prepend_frames", "prependFrames", default=0))),
        "input_noise_scale": max(0.0, min(1.0, _float(src, "input_noise_scale", "inputNoiseScale", default=0.0))),
        "latent_noise_scale": max(0.0, min(1.0, _float(src, "latent_noise_scale", "latentNoiseScale", default=0.0))),
        "offload_device": offload,
        "enable_debug": _flag(src, "enable_debug", "enableDebug"),
        "dit_model": _text(src, "dit_model", "ditModel", default=DIT_DEFAULT) or DIT_DEFAULT,
        "dit_device": dit_device,
        "blocks_to_swap": max(0, min(64, _int(src, "blocks_to_swap", "blocksToSwap", default=36))),
        "swap_io_components": _flag(src, "swap_io_components", "swapIoComponents"),
        "dit_offload_device": _text(src, "dit_offload_device", "ditOffloadDevice", default="cpu") or "cpu",
        "dit_cache_model": _flag(src, "dit_cache_model", "ditCacheModel"),
        "attention_mode": attention,
        "vae_model": _text(src, "vae_model", "vaeModel", default=VAE_DEFAULT) or VAE_DEFAULT,
        "vae_device": vae_device,
        "encode_tiled": bool(src.get("encode_tiled") if "encode_tiled" in src else src.get("encodeTiled", True)),
        "encode_tile_size": max(64, min(4096, _int(src, "encode_tile_size", "encodeTileSize", default=1024))),
        "encode_tile_overlap": max(0, min(1024, _int(src, "encode_tile_overlap", "encodeTileOverlap", default=128))),
        "decode_tiled": bool(src.get("decode_tiled") if "decode_tiled" in src else src.get("decodeTiled", True)),
        "decode_tile_size": max(64, min(4096, _int(src, "decode_tile_size", "decodeTileSize", default=1024))),
        "decode_tile_overlap": max(0, min(1024, _int(src, "decode_tile_overlap", "decodeTileOverlap", default=128))),
        "tile_debug": tile_debug,
        "vae_offload_device": _text(src, "vae_offload_device", "vaeOffloadDevice", default="cpu") or "cpu",
        "vae_cache_model": _flag(src, "vae_cache_model", "vaeCacheModel"),
        "allow_compile": _flag(src, "allow_compile", "allowCompile"),
        "compile_backend": compile_backend,
        "compile_mode": compile_mode,
        "compile_fullgraph": _flag(src, "compile_fullgraph", "compileFullgraph"),
        "compile_dynamic": _flag(src, "compile_dynamic", "compileDynamic"),
        "dynamo_cache_size_limit": max(1, min(256, _int(src, "dynamo_cache_size_limit", "dynamoCacheSizeLimit", default=64))),
        "dynamo_recompile_limit": max(1, min(512, _int(src, "dynamo_recompile_limit", "dynamoRecompileLimit", default=128))),
    }


def _fully_opaque(image: Any) -> bool:
    return image.getchannel("A").getextrema() == (255, 255)


def _source_rgba(values: dict[str, Any]) -> Any | None:
    path = source_path(values)
    if path is None:
        return None
    try:
        from PIL import Image

        with Image.open(path) as image:
            image.load()
            return image.convert("RGBA")
    except OSError:
        return None


def finish_image(raw: bytes, values: dict[str, Any]) -> bytes:
    from io import BytesIO

    from PIL import Image

    from features.generate.scripts.workflow.dataset import parse_color

    blob = clean_upscale(values.get("upscale"))
    try:
        with Image.open(BytesIO(raw)) as image:
            image.load()
            rgba = image.convert("RGBA")
    except OSError:
        return raw
    source = _source_rgba(values)
    if source is not None and not _fully_opaque(source):
        rgba.putalpha(source.getchannel("A").resize(rgba.size, Image.Resampling.LANCZOS))
    if blob["background"] == "Color":
        canvas = Image.new("RGBA", rgba.size, parse_color(str(blob.get("background_color") or "#222222")))
        rgba = Image.alpha_composite(canvas, rgba)
    out = BytesIO()
    rgba.save(out, format="PNG")
    return out.getvalue()


def _source_size(values: dict[str, Any]) -> tuple[int, int]:
    path = source_path(values)
    if path is None:
        raw = str(values.get("input_image") or "").strip()
        candidate = Path(raw) if raw else None
        path = candidate if candidate is not None and candidate.is_file() else None
    if path is None:
        return 512, 512
    try:
        from PIL import Image

        with Image.open(path) as image:
            return max(1, int(image.size[0])), max(1, int(image.size[1]))
    except OSError:
        return 512, 512


def target_size(values: dict[str, Any]) -> tuple[int, int]:
    blob = clean_upscale(values.get("upscale"))
    mode = blob["size_mode"]
    base_w, base_h = _source_size(values)
    scaled = (_round_to_8(base_w * blob["scale"]), _round_to_8(base_h * blob["scale"]))
    if mode == "max":
        current = max(base_w, base_h)
        factor = blob["max_resolution"] / max(1, current)
        return max(64, min(8192, _round_to_8(base_w * factor))), max(64, min(8192, _round_to_8(base_h * factor)))
    if mode not in {"raw", "scaler", "set"}:
        return scaled
    width = blob["width"]
    height = blob["height"]
    if width < 64 or height < 64:
        return scaled
    return max(64, min(4096, _round_to_8(width))), max(64, min(4096, _round_to_8(height)))


def _pop_kinds(workflow: dict[str, Any], kinds: set[str]) -> None:
    for key, node in list(workflow.items()):
        if isinstance(node, dict) and node.get("class_type") in kinds:
            workflow.pop(key, None)


def _find_kind(workflow: dict[str, Any], kind: str) -> str | None:
    for key, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") == kind:
            return str(key)
    return None


def apply_upscale(workflow: dict[str, Any], values: dict[str, Any], filename: Any) -> None:
    blob = clean_upscale(values.get("upscale"))
    if blob["engine"] == "seedvr2":
        _pop_kinds(workflow, _MODEL_KINDS)
        keep = _find_kind(workflow, "SeedVR2VideoUpscaler")
    else:
        _pop_kinds(workflow, _SEEDVR2_KINDS)
        keep = _find_kind(workflow, "ImageScale")
    if keep:
        for node in workflow.values():
            if isinstance(node, dict) and node.get("class_type") == "SaveImage":
                node.setdefault("inputs", {})["images"] = [keep, 0]
    width, height = target_size(values)
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if kind == "UpscaleModelLoader":
            name = filename(str(blob.get("upscale_model") or ""))
            if name:
                inputs["model_name"] = name
        elif kind == "ImageScale":
            inputs["width"] = width
            inputs["height"] = height
            inputs["upscale_method"] = blob["upscale_method"]
            inputs["crop"] = blob["crop"]
        elif kind == "SeedVR2VideoUpscaler":
            try:
                seed = int(blob.get("seed"))
            except (TypeError, ValueError):
                try:
                    seed = int(values.get("seed"))
                except (TypeError, ValueError):
                    seed = 42
            inputs["seed"] = wrap_seed(seed)
            inputs["resolution"] = blob["resolution"]
            inputs["max_resolution"] = blob["max_resolution"]
            inputs["batch_size"] = 1
            inputs["uniform_batch_size"] = False
            inputs["color_correction"] = blob["color_correction"]
            inputs["temporal_overlap"] = blob["temporal_overlap"]
            inputs["prepend_frames"] = blob["prepend_frames"]
            inputs["input_noise_scale"] = blob["input_noise_scale"]
            inputs["latent_noise_scale"] = blob["latent_noise_scale"]
            inputs["offload_device"] = blob["offload_device"]
            inputs["enable_debug"] = blob["enable_debug"]
        elif kind == "SeedVR2LoadDiTModel":
            inputs["model"] = filename(blob["dit_model"]) or blob["dit_model"]
            inputs["device"] = blob["dit_device"]
            inputs["blocks_to_swap"] = blob["blocks_to_swap"]
            inputs["swap_io_components"] = blob["swap_io_components"]
            inputs["offload_device"] = blob["dit_offload_device"]
            inputs["cache_model"] = blob["dit_cache_model"]
            inputs["attention_mode"] = blob["attention_mode"]
        elif kind == "SeedVR2LoadVAEModel":
            inputs["model"] = filename(blob["vae_model"]) or blob["vae_model"]
            inputs["device"] = blob["vae_device"]
            inputs["encode_tiled"] = blob["encode_tiled"]
            inputs["encode_tile_size"] = blob["encode_tile_size"]
            inputs["encode_tile_overlap"] = blob["encode_tile_overlap"]
            inputs["decode_tiled"] = blob["decode_tiled"]
            inputs["decode_tile_size"] = blob["decode_tile_size"]
            inputs["decode_tile_overlap"] = blob["decode_tile_overlap"]
            inputs["tile_debug"] = blob["tile_debug"]
            inputs["offload_device"] = blob["vae_offload_device"]
            inputs["cache_model"] = blob["vae_cache_model"]
        elif kind == "SeedVR2TorchCompileSettings":
            inputs["backend"] = blob["compile_backend"]
            inputs["mode"] = blob["compile_mode"]
            inputs["fullgraph"] = blob["compile_fullgraph"]
            inputs["dynamic"] = blob["compile_dynamic"]
            inputs["dynamo_cache_size_limit"] = blob["dynamo_cache_size_limit"]
            inputs["dynamo_recompile_limit"] = blob["dynamo_recompile_limit"]
    if blob["engine"] == "seedvr2" and not blob["allow_compile"]:
        _pop_kinds(workflow, {"SeedVR2TorchCompileSettings"})
        for node in workflow.values():
            if isinstance(node, dict) and node.get("class_type") in {"SeedVR2LoadVAEModel", "SeedVR2LoadDiTModel"}:
                node.setdefault("inputs", {}).pop("torch_compile_args", None)
