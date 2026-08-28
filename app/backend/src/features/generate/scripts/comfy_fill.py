from __future__ import annotations

import copy
from typing import Any, Callable

from features.generate.scripts.compose import apply_adetailer, apply_hires, _adetailer_units
from features.models.scripts import loras as lora_tags


def fill_power_loras(
    inputs: dict[str, Any],
    values: dict[str, Any],
    filename: Callable[[str], str],
    rows: Any | None = None,
) -> None:
    for key in [key for key in inputs if str(key).startswith("lora_")]:
        del inputs[key]
    if rows is None:
        rows = values.get("loras")
    if not isinstance(rows, list):
        return
    index = 1
    for item in rows:
        if isinstance(item, str):
            name, strength = item, 1.0
        elif isinstance(item, dict):
            name = str(item.get("lora") or item.get("path") or "")
            try:
                raw_strength = item.get("strength", 1)
                strength = float(raw_strength if raw_strength is not None else 1)
            except (TypeError, ValueError):
                strength = 1.0
        else:
            continue
        name = name.strip()
        if not name:
            continue
        inputs[f"lora_{index}"] = {"on": True, "lora": filename(name), "strength": strength}
        index += 1


def _title(node: dict[str, Any]) -> str:
    return str((node.get("_meta") or {}).get("title") or "").lower()


def _is_hires(node: dict[str, Any]) -> bool:
    return "hires" in _title(node)


def _is_adetailer(node: dict[str, Any]) -> bool:
    return "adetailer" in _title(node)


def _is_port(node: dict[str, Any]) -> bool:
    return _title(node).startswith("port:")


def _hires_blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("hires")
    return raw if isinstance(raw, dict) else {}


def hires_enabled(values: dict[str, Any]) -> bool:
    return bool(_hires_blob(values).get("enabled"))


def adetailer_enabled(values: dict[str, Any]) -> bool:
    return bool(_adetailer_units(values))


_HIRES_ON_AD = (
    ("sampler_override", "samplerOverride"),
    ("sampler", "sampler"),
    ("scheduler_override", "schedulerOverride"),
    ("scheduler", "scheduler"),
    ("cfg_override", "cfgOverride"),
    ("cfg", "cfg"),
    ("seed_override", "seedOverride"),
    ("seed", "seed"),
    ("seed_after", "seedAfter"),
    ("prompt_override", "promptOverride"),
    ("prompt", "prompt"),
    ("negative_override", "negativeOverride"),
    ("negative_prompt", "negativePrompt"),
    ("model_override", "modelOverride"),
    ("checkpoint", "checkpoint"),
    ("vae", "vae"),
    ("text_encoder", "textEncoder"),
    ("kind", "kind"),
    ("lora_override", "loraOverride"),
    ("loras", "loras"),
)

_ADETAILER_ADVANCED = (
    ("guide_size_for", "guideSizeFor", True),
    ("feather", "feather", 5),
    ("noise_mask", "noiseMask", True),
    ("force_inpaint", "forceInpaint", True),
    ("bbox_threshold", "bboxThreshold", 0.5),
    ("bbox_dilation", "bboxDilation", 10),
    ("bbox_crop_factor", "bboxCropFactor", 3.0),
    ("sam_detection_hint", "samDetectionHint", "center-1"),
    ("sam_dilation", "samDilation", 0),
    ("sam_threshold", "samThreshold", 0.93),
    ("sam_bbox_expansion", "samBboxExpansion", 0),
    ("sam_mask_hint_threshold", "samMaskHintThreshold", 0.7),
    ("sam_mask_hint_use_negative", "samMaskHintUseNegative", "False"),
    ("drop_size", "dropSize", 10),
    ("cycle", "cycle", 1),
    ("inpaint_model", "inpaintModel", False),
    ("noise_mask_feather", "noiseMaskFeather", 20),
    ("tiled_encode", "tiledEncode", False),
    ("tiled_decode", "tiledDecode", False),
    ("device_mode", "deviceMode", "Prefer GPU"),
)


def _adetailer_from_hires(values: dict[str, Any], unit: dict[str, Any] | None = None) -> bool:
    if isinstance(unit, dict) and ("from_hires" in unit or "fromHires" in unit):
        raw = unit.get("from_hires")
        if raw is None:
            raw = unit.get("fromHires")
        return bool(raw)
    blob = values.get("adetailer")
    if not isinstance(blob, dict):
        return True
    if "from_hires" in blob:
        return bool(blob["from_hires"])
    if "fromHires" in blob:
        return bool(blob["fromHires"])
    return True


def _adetailer_unit_for_fill(unit: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    out = dict(unit)
    if _adetailer_from_hires(values, out) and hires_enabled(values):
        hires = _hires_blob(values)
        for snake, camel in _HIRES_ON_AD:
            if snake in hires:
                value = hires[snake]
            elif camel in hires:
                value = hires[camel]
            else:
                continue
            out[snake] = value
            out[camel] = value
    if not _flag(out, "advanced_override", "advancedOverride"):
        for snake, camel, value in _ADETAILER_ADVANCED:
            out[snake] = value
            out[camel] = value
    return out


def round_to_8(value: float) -> int:
    return max(8, int(round(float(value) / 8.0)) * 8)


def hires_target_size(values: dict[str, Any]) -> tuple[int, int]:
    blob = _hires_blob(values)
    mode = str(blob.get("size_mode") or blob.get("sizeMode") or "scale").strip().lower()
    base_w = max(1, int(values.get("width") or 1))
    base_h = max(1, int(values.get("height") or 1))
    try:
        scale = float(blob.get("scale") if blob.get("scale") is not None else 1.5)
    except (TypeError, ValueError):
        scale = 1.5
    scale = max(1.0, min(8.0, scale))
    scaled = (round_to_8(base_w * scale), round_to_8(base_h * scale))
    if mode not in {"raw", "scaler", "set"}:
        return scaled
    try:
        width = int(blob.get("width") or 0)
        height = int(blob.get("height") or 0)
    except (TypeError, ValueError):
        return scaled
    if width < 64 or height < 64:
        return scaled
    return max(64, min(4096, round_to_8(width))), max(64, min(4096, round_to_8(height)))


_IMAGE_SCALE_METHODS = frozenset({"nearest-exact", "bilinear", "area", "bicubic", "lanczos"})
_IMAGE_SCALE_CROPS = frozenset({"disabled", "center"})


def _hires_scale_opts(blob: dict[str, Any]) -> tuple[str, str]:
    method = str(blob.get("upscale_method") or blob.get("upscaleMethod") or "bilinear").strip()
    crop = str(blob.get("crop") or "disabled").strip()
    if method not in _IMAGE_SCALE_METHODS:
        method = "bilinear"
    if crop not in _IMAGE_SCALE_CROPS:
        crop = "disabled"
    return method, crop


def _flag(blob: dict[str, Any], snake: str, camel: str, default: bool = False) -> bool:
    if snake in blob or camel in blob:
        return bool(blob.get(snake) if blob.get(snake) is not None else blob.get(camel))
    return default


def _seed_override(blob: dict[str, Any]) -> bool:
    if "seed_override" in blob or "seedOverride" in blob:
        return _flag(blob, "seed_override", "seedOverride")
    follow = blob.get("seed_follow")
    if follow is None:
        follow = blob.get("seedFollow")
    if follow is not None:
        return not bool(follow)
    return False


def _hires_seed(values: dict[str, Any], blob: dict[str, Any]) -> int:
    if not _seed_override(blob):
        return int(values["seed"])
    try:
        seed = int(blob.get("seed"))
    except (TypeError, ValueError):
        seed = int(values["seed"])
    if seed < 0:
        return int(values["seed"])
    return seed


def _fill_hires_sampler(inputs: dict[str, Any], values: dict[str, Any]) -> None:
    blob = _hires_blob(values)
    try:
        steps = int(blob.get("steps") if blob.get("steps") is not None else 25)
    except (TypeError, ValueError):
        steps = 25
    try:
        if _flag(blob, "cfg_override", "cfgOverride"):
            cfg = float(blob.get("cfg") if blob.get("cfg") is not None else values["cfg"])
        else:
            cfg = float(values["cfg"])
    except (TypeError, ValueError):
        cfg = float(values["cfg"])
    try:
        denoise = float(blob.get("denoise") if blob.get("denoise") is not None else 0.55)
    except (TypeError, ValueError):
        denoise = 0.55
    first_sampler = str(values.get("sampler") or "")
    first_scheduler = str(values.get("scheduler") or "")
    sampler = (
        str(blob.get("sampler") or first_sampler)
        if _flag(blob, "sampler_override", "samplerOverride")
        else first_sampler
    )
    scheduler = (
        str(blob.get("scheduler") or first_scheduler)
        if _flag(blob, "scheduler_override", "schedulerOverride")
        else first_scheduler
    )
    inputs["seed"] = _hires_seed(values, blob)
    inputs["steps"] = max(1, min(150, steps))
    inputs["cfg"] = cfg
    inputs["sampler_name"] = sampler
    inputs["scheduler"] = scheduler
    inputs["denoise"] = max(0.0, min(1.0, denoise))


def hires_meta_fields(values: dict[str, Any]) -> dict[str, Any]:
    blob = _hires_blob(values)
    inputs: dict[str, Any] = {}
    _fill_hires_sampler(inputs, values)
    method, crop = _hires_scale_opts(blob)
    width, height = hires_target_size(values)
    out: dict[str, Any] = {
        "steps": inputs["steps"],
        "cfg": inputs["cfg"],
        "sampler": inputs["sampler_name"],
        "scheduler": inputs["scheduler"],
        "denoise": inputs["denoise"],
        "width": width,
        "height": height,
        "upscale_method": method,
        "crop": crop,
    }
    mode = str(blob.get("size_mode") or blob.get("sizeMode") or "scale").strip().lower()
    if mode not in {"raw", "scaler", "set"}:
        try:
            scale = float(blob.get("scale") if blob.get("scale") is not None else 1.5)
        except (TypeError, ValueError):
            scale = 1.5
        out["scale"] = max(1.0, min(8.0, scale))
    if _seed_override(blob):
        out["seed"] = inputs["seed"]
    if _flag(blob, "prompt_override", "promptOverride"):
        out["prompt"] = str(blob.get("prompt") or "")
    if _flag(blob, "negative_override", "negativeOverride"):
        out["negative_prompt"] = str(blob.get("negative_prompt") or blob.get("negativePrompt") or "")
    return out


def adetailer_meta_fields(unit: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    unit = _adetailer_unit_for_fill(unit, values)
    first_sampler = str(values.get("sampler") or "euler")
    first_scheduler = str(values.get("scheduler") or "sgm_uniform")
    try:
        first_cfg = float(values.get("cfg") if values.get("cfg") is not None else 4)
    except (TypeError, ValueError):
        first_cfg = 4.0
    sampler = (
        str(unit.get("sampler") or first_sampler)
        if _flag(unit, "sampler_override", "samplerOverride")
        else first_sampler
    )
    scheduler = (
        str(unit.get("scheduler") or first_scheduler)
        if _flag(unit, "scheduler_override", "schedulerOverride")
        else first_scheduler
    )
    try:
        steps = int(unit.get("steps") or 20)
    except (TypeError, ValueError):
        steps = 20
    try:
        if _flag(unit, "cfg_override", "cfgOverride"):
            cfg = float(unit.get("cfg") if unit.get("cfg") is not None else first_cfg)
        else:
            cfg = first_cfg
    except (TypeError, ValueError):
        cfg = first_cfg
    try:
        denoise = float(unit.get("denoise") if unit.get("denoise") is not None else 0.5)
    except (TypeError, ValueError):
        denoise = 0.5
    out: dict[str, Any] = {
        "steps": max(1, min(150, steps)),
        "cfg": cfg,
        "sampler": sampler,
        "scheduler": scheduler,
        "denoise": max(0.0, min(1.0, denoise)),
    }
    if _flag(unit, "seed_override", "seedOverride"):
        try:
            seed = int(unit.get("seed") if unit.get("seed") is not None else values.get("seed") or 0)
        except (TypeError, ValueError):
            seed = int(values.get("seed") or 0)
        out["seed"] = seed
    if _flag(unit, "prompt_override", "promptOverride"):
        out["prompt"] = str(unit.get("prompt") or "")
    if _flag(unit, "negative_override", "negativeOverride"):
        out["negative_prompt"] = str(unit.get("negative_prompt") or unit.get("negativePrompt") or "")
    return out


def _find_node(
    workflow: dict[str, Any],
    kind: str,
    contains: str | None = None,
    hires: bool | None = None,
) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    for key, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != kind:
            continue
        if _is_port(node):
            continue
        if contains is not None and contains not in _title(node):
            continue
        if hires is True and not _is_hires(node):
            continue
        if hires is False and _is_hires(node):
            continue
        return str(key), node
    return None, None


def _typed_nodes(workflow: dict[str, Any], kind: str, hires: bool | None = None) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for key, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != kind:
            continue
        if _is_port(node):
            continue
        if hires is True and not _is_hires(node):
            continue
        if hires is False and _is_hires(node):
            continue
        out.append((str(key), node))
    return out


def _link(key: str, slot: int) -> list[Any]:
    return [key, slot]


def _hires_kind_diffusion(blob: dict[str, Any]) -> bool:
    kind = str(blob.get("kind") or blob.get("model_kind") or "").strip().lower()
    return kind in {"diffusion_models", "diffusion", "unet"}


def _prompt_lora_rows(text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in lora_tags.TAG.finditer(str(text or "")):
        name = match.group(1).strip()
        if not name:
            continue
        key = name.replace("\\", "/").lower()
        if key in seen:
            continue
        seen.add(key)
        strength = float(match.group(2)) if match.group(2) else 1.0
        rows.append({"lora": name, "strength": strength})
    return rows


def _lora_row_key(item: Any) -> str:
    if isinstance(item, str):
        return item.replace("\\", "/").strip().lower()
    if isinstance(item, dict):
        return str(item.get("lora") or item.get("path") or "").replace("\\", "/").strip().lower()
    return ""


def _merge_lora_rows(*groups: Any) -> list[Any]:
    out: list[Any] = []
    seen: set[str] = set()
    for group in groups:
        if not isinstance(group, list):
            continue
        for item in group:
            key = _lora_row_key(item)
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def _hires_lora_rows(values: dict[str, Any], blob: dict[str, Any], lora_on: bool, prompt_on: bool) -> list[Any]:
    prompt_text = str(blob.get("prompt") or "") if prompt_on else str(values.get("prompt") or "")
    prompt_rows = _prompt_lora_rows(prompt_text)
    if lora_on:
        return _merge_lora_rows(prompt_rows, blob.get("loras"))
    if prompt_on:
        return _merge_lora_rows(prompt_rows, values.get("auto_loras_resolved"))
    return list(values.get("loras") or [])


def _rewire_hires(workflow: dict[str, Any], values: dict[str, Any], filename: Callable[[str], str]) -> None:
    blob = _hires_blob(values)
    model_on = _flag(blob, "model_override", "modelOverride")
    lora_on = _flag(blob, "lora_override", "loraOverride")
    prompt_on = _flag(blob, "prompt_override", "promptOverride")
    negative_on = _flag(blob, "negative_override", "negativeOverride")
    first_ckpt = _typed_nodes(workflow, "CheckpointLoaderSimple", False)
    first_unet = _typed_nodes(workflow, "UNETLoader", False)
    first_clip = _typed_nodes(workflow, "CLIPLoader", False)
    first_lora = _typed_nodes(workflow, "Power Lora Loader (rgthree)", False)
    first_pos = [(k, n) for k, n in _typed_nodes(workflow, "CLIPTextEncode", False) if "negative" not in _title(n)]
    first_neg = [(k, n) for k, n in _typed_nodes(workflow, "CLIPTextEncode", False) if "negative" in _title(n)]
    hires_ckpt = _typed_nodes(workflow, "CheckpointLoaderSimple", True)
    hires_unet = _typed_nodes(workflow, "UNETLoader", True)
    hires_clip_loader = _typed_nodes(workflow, "CLIPLoader", True)
    hires_vae_loader = _typed_nodes(workflow, "VAELoader", True)
    hires_lora = _typed_nodes(workflow, "Power Lora Loader (rgthree)", True)
    hires_ks = _typed_nodes(workflow, "KSampler", True)
    hires_pos = [(k, n) for k, n in _typed_nodes(workflow, "CLIPTextEncode", True) if "negative" not in _title(n)]
    hires_neg = [(k, n) for k, n in _typed_nodes(workflow, "CLIPTextEncode", True) if "negative" in _title(n)]
    base_model = first_lora[0][0] if first_lora else (first_unet[0][0] if first_unet else (first_ckpt[0][0] if first_ckpt else ""))
    base_clip = first_lora[0][0] if first_lora else (first_clip[0][0] if first_clip else (first_ckpt[0][0] if first_ckpt else ""))
    base_model_slot = 0
    base_clip_slot = 1 if first_lora or first_ckpt else 0
    hires_model_key = ""
    hires_clip_key = ""
    hires_model_slot = 0
    hires_clip_slot = 1
    diffusion = _hires_kind_diffusion(blob)
    if model_on and diffusion and hires_unet:
        name = filename(str(blob.get("checkpoint") or ""))
        if name:
            hires_unet[0][1].setdefault("inputs", {})["unet_name"] = name
        if hires_clip_loader:
            clip_name = filename(str(blob.get("text_encoder") or blob.get("textEncoder") or ""))
            if clip_name:
                hires_clip_loader[0][1].setdefault("inputs", {})["clip_name"] = clip_name
            if first_clip:
                src = first_clip[0][1].get("inputs") or {}
                dest = hires_clip_loader[0][1].setdefault("inputs", {})
                if src.get("type"):
                    dest["type"] = src["type"]
                if src.get("device"):
                    dest["device"] = src["device"]
        if hires_vae_loader:
            vae_name = filename(str(blob.get("vae") or ""))
            if vae_name:
                hires_vae_loader[0][1].setdefault("inputs", {})["vae_name"] = vae_name
        hires_model_key = hires_unet[0][0]
        hires_model_slot = 0
        if hires_clip_loader:
            hires_clip_key, hires_clip_slot = hires_clip_loader[0][0], 0
        else:
            hires_clip_key = first_clip[0][0] if first_clip else (first_lora[0][0] if first_lora else "")
            hires_clip_slot = 0 if first_clip else 1
    elif model_on and hires_ckpt:
        name = filename(str(blob.get("checkpoint") or ""))
        if name:
            hires_ckpt[0][1].setdefault("inputs", {})["ckpt_name"] = name
        hires_model_key, hires_clip_key = hires_ckpt[0][0], hires_ckpt[0][0]
        hires_model_slot, hires_clip_slot = 0, 1
    elif model_on and hires_unet:
        name = filename(str(blob.get("checkpoint") or ""))
        if name:
            hires_unet[0][1].setdefault("inputs", {})["unet_name"] = name
        hires_model_key = hires_unet[0][0]
        hires_clip_key = first_clip[0][0] if first_clip else (first_lora[0][0] if first_lora else "")
        hires_model_slot, hires_clip_slot = 0, 0 if first_clip else 1
    use_hires_lora = (model_on or lora_on or prompt_on) and bool(hires_lora)
    if use_hires_lora:
        loader = hires_lora[0][1].setdefault("inputs", {})
        src_model = hires_model_key or (first_ckpt[0][0] if first_ckpt else (first_unet[0][0] if first_unet else base_model))
        src_clip = hires_clip_key or base_clip
        src_m_slot = hires_model_slot if hires_model_key else (0 if first_ckpt or first_unet else base_model_slot)
        src_c_slot = hires_clip_slot if hires_clip_key else base_clip_slot
        if first_ckpt and src_model == first_ckpt[0][0]:
            src_m_slot, src_c_slot = 0, 1
        if first_unet and src_model == first_unet[0][0]:
            src_m_slot = 0
        if first_clip and src_clip == first_clip[0][0]:
            src_c_slot = 0
        if hires_ckpt and src_model == hires_ckpt[0][0]:
            src_m_slot, src_c_slot = 0, 1
        if hires_unet and src_model == hires_unet[0][0]:
            src_m_slot = 0
        if hires_clip_loader and src_clip == hires_clip_loader[0][0]:
            src_c_slot = 0
        loader["model"] = _link(src_model, src_m_slot)
        loader["clip"] = _link(src_clip, src_c_slot)
        fill_power_loras(loader, values, filename, _hires_lora_rows(values, blob, lora_on, prompt_on))
        hires_model_key, hires_clip_key = hires_lora[0][0], hires_lora[0][0]
        hires_model_slot, hires_clip_slot = 0, 1
    if not hires_ks:
        return
    ks = hires_ks[0][1].setdefault("inputs", {})
    if hires_model_key:
        ks["model"] = _link(hires_model_key, hires_model_slot)
    clip_for_encode = _link(hires_clip_key, hires_clip_slot) if hires_clip_key else _link(base_clip, base_clip_slot)
    reencode = model_on or lora_on or prompt_on or negative_on
    if reencode and hires_pos:
        if prompt_on:
            text = lora_tags.strip_tags(str(blob.get("prompt") or ""))
        else:
            text = str(values.get("prompt_clip") or lora_tags.strip_tags(str(values.get("prompt") or "")))
        hires_pos[0][1].setdefault("inputs", {})["text"] = text
        hires_pos[0][1]["inputs"]["clip"] = clip_for_encode
        ks["positive"] = _link(hires_pos[0][0], 0)
    elif first_pos:
        ks["positive"] = _link(first_pos[0][0], 0)
    if reencode and hires_neg:
        if negative_on:
            text = lora_tags.strip_tags(str(blob.get("negative_prompt") or blob.get("negativePrompt") or ""))
        else:
            text = str(values.get("negative_clip") or lora_tags.strip_tags(str(values.get("negative_prompt") or "")))
        hires_neg[0][1].setdefault("inputs", {})["text"] = text
        hires_neg[0][1]["inputs"]["clip"] = clip_for_encode
        ks["negative"] = _link(hires_neg[0][0], 0)
    elif first_neg:
        ks["negative"] = _link(first_neg[0][0], 0)
    if model_on and diffusion and hires_vae_loader:
        vae = _link(hires_vae_loader[0][0], 0)
        for _, node in _typed_nodes(workflow, "VAEEncode", True):
            node.setdefault("inputs", {})["vae"] = vae
        for _, node in _typed_nodes(workflow, "VAEDecode", True):
            node.setdefault("inputs", {})["vae"] = vae
    elif model_on and hires_ckpt and not diffusion:
        vae = _link(hires_ckpt[0][0], 2)
        for _, node in _typed_nodes(workflow, "VAEEncode", True):
            node.setdefault("inputs", {})["vae"] = vae
        for _, node in _typed_nodes(workflow, "VAEDecode", True):
            node.setdefault("inputs", {})["vae"] = vae


PROGRESS_STAGES = ("generation", "upscaling", "hires", "adetailer")
_UPSCALE_KINDS = {"UpscaleModelLoader", "ImageUpscaleWithModel", "ImageScale", "VAEEncode"}
_ADETAILER_KINDS = {"FaceDetailer", "UltralyticsDetectorProvider", "SAMLoader"}


def progress_stages(values: dict[str, Any]) -> tuple[str, ...]:
    stages = ["generation"]
    if hires_enabled(values):
        stages.extend(["upscaling", "hires"])
    if adetailer_enabled(values):
        stages.append("adetailer")
    return tuple(stages)


def node_progress_stage(node: dict[str, Any], key: str = "", has_adetailer: bool = False) -> str:
    kind = str(node.get("class_type") or "")
    title = _title(node)
    if str(key).startswith("adetailer/") or kind in _ADETAILER_KINDS or _is_adetailer(node):
        return "adetailer"
    if kind in _UPSCALE_KINDS:
        return "upscaling"
    if kind == "SaveImage" and "first" in title:
        return "generation"
    if kind == "easy cleanGpuUsed":
        return "upscaling" if "before" in title else "hires"
    if kind == "SaveImage":
        return "adetailer" if has_adetailer else "hires"
    if _is_hires(node):
        return "hires"
    return "generation"


def progress_stage_map(graph: dict[str, Any]) -> dict[str, str]:
    has_adetailer = any(
        isinstance(node, dict) and str(node.get("class_type") or "") in _ADETAILER_KINDS for node in graph.values()
    )
    out: dict[str, str] = {}
    for key, node in graph.items():
        if isinstance(node, dict) and node.get("class_type"):
            out[str(key)] = node_progress_stage(node, str(key), has_adetailer)
    return out


def stage_index(stage: str, stages: tuple[str, ...] | None = None) -> int:
    order = stages or PROGRESS_STAGES
    try:
        return order.index(stage)
    except ValueError:
        return 0


def combined_progress(stage: str, value: int, maximum: int, stages: tuple[str, ...] | None = None) -> int:
    order = stages or PROGRESS_STAGES
    index = stage_index(stage, order)
    span = 100.0 / len(order)
    frac = (value / maximum) if maximum > 0 else 0.0
    return min(100, int(index * span + max(0.0, min(1.0, frac)) * span))


def _rewire_save_to_first_decode(workflow: dict[str, Any]) -> None:
    first = None
    for key, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != "VAEDecode":
            continue
        if _is_hires(node):
            continue
        first = key
        break
    if first is None:
        return
    for node in workflow.values():
        if not isinstance(node, dict) or node.get("class_type") != "SaveImage":
            continue
        node.setdefault("inputs", {})["images"] = [first, 0]


def _apply_hires_saves(workflow: dict[str, Any], values: dict[str, Any]) -> None:
    blob = _hires_blob(values)
    on = hires_enabled(values)
    clear_vram = on and _flag(blob, "clear_vram", "clearVram", False)
    first_id, _ = _find_node(workflow, "VAEDecode", hires=False)
    hires_id, _ = _find_node(workflow, "VAEDecode", hires=True)
    _, upscale = _find_node(workflow, "ImageUpscaleWithModel")
    first_save_id, first_save = _find_node(workflow, "SaveImage", contains="first")
    before_id, before = _find_node(workflow, "easy cleanGpuUsed", contains="before")
    after_id, after = _find_node(workflow, "easy cleanGpuUsed", contains="after")
    if on and first_save is not None and first_id:
        first_save.setdefault("inputs", {})["images"] = [first_id, 0]
    elif not on and first_save_id:
        workflow.pop(first_save_id, None)
    if not clear_vram:
        if before_id:
            workflow.pop(before_id, None)
        if after_id:
            workflow.pop(after_id, None)
        if upscale is not None and first_id:
            upscale.setdefault("inputs", {})["image"] = [first_id, 0]
    else:
        if before is not None and before_id and first_id:
            before.setdefault("inputs", {})["anything"] = [first_id, 0]
            if upscale is not None:
                upscale.setdefault("inputs", {})["image"] = [before_id, 0]
        if after is not None and hires_id:
            after.setdefault("inputs", {})["anything"] = [hires_id, 0]
    if not on and not adetailer_enabled(values):
        _rewire_save_to_first_decode(workflow)


def _adetailer_index(key: str) -> int | None:
    parts = str(key).split("/")
    if len(parts) < 3 or parts[0] != "adetailer":
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def _adetailer_kind_diffusion(unit: dict[str, Any]) -> bool:
    kind = str(unit.get("kind") or unit.get("model_kind") or "").strip().lower()
    return kind in {"diffusion_models", "diffusion", "unet"}


def _fill_adetailer(
    workflow: dict[str, Any],
    values: dict[str, Any],
    filename: Callable[[str], str],
    host_ports: dict[str, Any] | None = None,
) -> None:
    units = [_adetailer_unit_for_fill(item, values) for item in _adetailer_units(values)]
    if not units:
        return
    ports = host_ports if isinstance(host_ports, dict) else {}
    first_sampler = str(values.get("sampler") or "euler")
    first_scheduler = str(values.get("scheduler") or "sgm_uniform")
    try:
        first_seed = int(values.get("seed") or 0)
    except (TypeError, ValueError):
        first_seed = 0
    empty_sam: set[int] = set()
    for key, node in list(workflow.items()):
        if not isinstance(node, dict):
            continue
        index = _adetailer_index(str(key))
        if index is None or index >= len(units):
            continue
        unit = units[index]
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if kind == "UltralyticsDetectorProvider":
            name = filename(str(unit.get("detector") or ""))
            if name:
                inputs["model_name"] = name
        elif kind == "SAMLoader":
            name = filename(str(unit.get("sam_model") or unit.get("samModel") or ""))
            inputs["device_mode"] = str(unit.get("device_mode") or unit.get("deviceMode") or "Prefer GPU")
            if name:
                inputs["model_name"] = name
            else:
                empty_sam.add(index)
        elif kind == "FaceDetailer":
            sampler = str(unit.get("sampler") or first_sampler) if _flag(unit, "sampler_override", "samplerOverride") else first_sampler
            scheduler = str(unit.get("scheduler") or first_scheduler) if _flag(unit, "scheduler_override", "schedulerOverride") else first_scheduler
            seed = first_seed
            if _flag(unit, "seed_override", "seedOverride"):
                try:
                    seed = int(unit.get("seed") if unit.get("seed") is not None else first_seed)
                except (TypeError, ValueError):
                    seed = first_seed
            inputs["guide_size"] = float(unit.get("guide_size") if unit.get("guide_size") is not None else unit.get("guideSize") or 512)
            inputs["guide_size_for"] = bool(unit["guide_size_for"]) if "guide_size_for" in unit else bool(unit.get("guideSizeFor", True))
            inputs["max_size"] = float(unit.get("max_size") if unit.get("max_size") is not None else unit.get("maxSize") or 1024)
            inputs["seed"] = seed
            inputs["steps"] = int(unit.get("steps") or 20)
            try:
                first_cfg = float(values.get("cfg") if values.get("cfg") is not None else 4)
            except (TypeError, ValueError):
                first_cfg = 4.0
            try:
                if _flag(unit, "cfg_override", "cfgOverride"):
                    cfg = float(unit.get("cfg") if unit.get("cfg") is not None else first_cfg)
                else:
                    cfg = first_cfg
            except (TypeError, ValueError):
                cfg = first_cfg
            inputs["cfg"] = cfg
            inputs["sampler_name"] = sampler
            inputs["scheduler"] = scheduler
            inputs["denoise"] = float(unit.get("denoise") if unit.get("denoise") is not None else 0.5)
            inputs["feather"] = int(unit.get("feather") if unit.get("feather") is not None else 5)
            inputs["noise_mask"] = bool(unit["noise_mask"]) if "noise_mask" in unit else bool(unit.get("noiseMask", True))
            inputs["force_inpaint"] = bool(unit["force_inpaint"]) if "force_inpaint" in unit else bool(unit.get("forceInpaint", True))
            inputs["bbox_threshold"] = float(unit.get("bbox_threshold") if unit.get("bbox_threshold") is not None else unit.get("bboxThreshold") or 0.5)
            inputs["bbox_dilation"] = int(unit.get("bbox_dilation") if unit.get("bbox_dilation") is not None else unit.get("bboxDilation") or 10)
            inputs["bbox_crop_factor"] = float(unit.get("bbox_crop_factor") if unit.get("bbox_crop_factor") is not None else unit.get("bboxCropFactor") or 3)
            inputs["sam_detection_hint"] = str(unit.get("sam_detection_hint") or unit.get("samDetectionHint") or "center-1")
            inputs["sam_dilation"] = int(unit.get("sam_dilation") if unit.get("sam_dilation") is not None else unit.get("samDilation") or 0)
            inputs["sam_threshold"] = float(unit.get("sam_threshold") if unit.get("sam_threshold") is not None else unit.get("samThreshold") or 0.93)
            inputs["sam_bbox_expansion"] = int(unit.get("sam_bbox_expansion") if unit.get("sam_bbox_expansion") is not None else unit.get("samBboxExpansion") or 0)
            inputs["sam_mask_hint_threshold"] = float(
                unit.get("sam_mask_hint_threshold") if unit.get("sam_mask_hint_threshold") is not None else unit.get("samMaskHintThreshold") or 0.7
            )
            inputs["sam_mask_hint_use_negative"] = str(unit.get("sam_mask_hint_use_negative") or unit.get("samMaskHintUseNegative") or "False")
            inputs["drop_size"] = int(unit.get("drop_size") if unit.get("drop_size") is not None else unit.get("dropSize") or 10)
            inputs["wildcard"] = ""
            inputs["cycle"] = int(unit.get("cycle") or 1)
            inputs["inpaint_model"] = _flag(unit, "inpaint_model", "inpaintModel")
            inputs["noise_mask_feather"] = int(unit.get("noise_mask_feather") if unit.get("noise_mask_feather") is not None else unit.get("noiseMaskFeather") or 20)
            inputs["tiled_encode"] = _flag(unit, "tiled_encode", "tiledEncode")
            inputs["tiled_decode"] = _flag(unit, "tiled_decode", "tiledDecode")
            if not _flag(unit, "prompt_override", "promptOverride"):
                port = ports.get("POSITIVE") or ports.get("positive")
                if isinstance(port, (list, tuple)) and len(port) == 2:
                    inputs["positive"] = [port[0], port[1]]
            if not _flag(unit, "negative_override", "negativeOverride"):
                port = ports.get("NEGATIVE") or ports.get("negative")
                if isinstance(port, (list, tuple)) and len(port) == 2:
                    inputs["negative"] = [port[0], port[1]]
        elif kind == "CheckpointLoaderSimple":
            if _flag(unit, "model_override", "modelOverride"):
                name = filename(str(unit.get("checkpoint") or ""))
                if name:
                    inputs["ckpt_name"] = name
        elif kind == "UNETLoader":
            if _flag(unit, "model_override", "modelOverride"):
                name = filename(str(unit.get("checkpoint") or ""))
                if name:
                    inputs["unet_name"] = name
        elif kind == "CLIPLoader":
            if _flag(unit, "model_override", "modelOverride"):
                name = filename(str(unit.get("text_encoder") or unit.get("textEncoder") or ""))
                if name:
                    inputs["clip_name"] = name
        elif kind == "VAELoader":
            if _flag(unit, "model_override", "modelOverride"):
                name = filename(str(unit.get("vae") or ""))
                if name:
                    inputs["vae_name"] = name
        elif kind == "CLIPTextEncode":
            title = _title(node)
            if "positive" in title:
                text = str(unit.get("prompt") or "") if _flag(unit, "prompt_override", "promptOverride") else str(values.get("prompt_clip") or values.get("prompt") or "")
                inputs["text"] = text
            elif "negative" in title:
                text = (
                    str(unit.get("negative_prompt") or unit.get("negativePrompt") or "")
                    if _flag(unit, "negative_override", "negativeOverride")
                    else str(values.get("negative_clip") or values.get("negative_prompt") or "")
                )
                inputs["text"] = text
    _rewire_adetailer_models(workflow, units, values, filename)
    for key, node in list(workflow.items()):
        index = _adetailer_index(str(key))
        if index is None or not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        unit = units[index] if index < len(units) else {}
        model_on = _flag(unit, "model_override", "modelOverride")
        use_lora = model_on or _flag(unit, "lora_override", "loraOverride") or _flag(unit, "prompt_override", "promptOverride")
        if not model_on and kind in {"CheckpointLoaderSimple", "UNETLoader", "CLIPLoader", "VAELoader"}:
            workflow.pop(key, None)
            continue
        if not use_lora and kind == "Power Lora Loader (rgthree)":
            workflow.pop(key, None)
            continue
        if index in empty_sam and kind == "SAMLoader":
            workflow.pop(key, None)
        elif index in empty_sam and kind == "FaceDetailer":
            node.setdefault("inputs", {}).pop("sam_model_opt", None)


def _rewire_adetailer_models(
    workflow: dict[str, Any],
    units: list[dict[str, Any]],
    values: dict[str, Any],
    filename: Callable[[str], str],
) -> None:
    by_index: dict[int, dict[str, str]] = {}
    for key, node in workflow.items():
        if not isinstance(node, dict):
            continue
        index = _adetailer_index(str(key))
        if index is None or index >= len(units):
            continue
        slot = by_index.setdefault(index, {})
        kind = node.get("class_type")
        if kind == "FaceDetailer":
            slot["face"] = str(key)
        elif kind == "CheckpointLoaderSimple":
            slot["ckpt"] = str(key)
        elif kind == "UNETLoader":
            slot["unet"] = str(key)
        elif kind == "CLIPLoader":
            slot["clip"] = str(key)
        elif kind == "VAELoader":
            slot["vae"] = str(key)
        elif kind == "Power Lora Loader (rgthree)":
            slot["lora"] = str(key)
        elif kind == "CLIPTextEncode":
            title = _title(node)
            if "positive" in title:
                slot["pos"] = str(key)
            elif "negative" in title:
                slot["neg"] = str(key)
    for index, unit in enumerate(units):
        keys = by_index.get(index) or {}
        face = workflow.get(keys.get("face") or "")
        if not isinstance(face, dict):
            continue
        inputs = face.setdefault("inputs", {})
        model_on = _flag(unit, "model_override", "modelOverride")
        lora_on = _flag(unit, "lora_override", "loraOverride")
        prompt_on = _flag(unit, "prompt_override", "promptOverride")
        lora_key = keys.get("lora") or ""
        lora_node = workflow.get(lora_key)
        use_lora = (model_on or lora_on or prompt_on) and isinstance(lora_node, dict)
        diffusion = _adetailer_kind_diffusion(unit)
        clip_link = None
        if use_lora:
            loader = lora_node.setdefault("inputs", {})
            fill_power_loras(loader, values, filename, _hires_lora_rows(values, unit, lora_on, prompt_on))
            if model_on and diffusion and keys.get("unet"):
                loader["model"] = _link(keys["unet"], 0)
                if keys.get("clip"):
                    loader["clip"] = _link(keys["clip"], 0)
            elif model_on and keys.get("ckpt"):
                loader["model"] = _link(keys["ckpt"], 0)
                loader["clip"] = _link(keys["ckpt"], 1)
            inputs["model"] = _link(lora_key, 0)
            inputs["clip"] = _link(lora_key, 1)
            clip_link = _link(lora_key, 1)
        elif model_on and diffusion and keys.get("unet"):
            inputs["model"] = _link(keys["unet"], 0)
            if keys.get("clip"):
                inputs["clip"] = _link(keys["clip"], 0)
            clip_link = _link(keys["clip"], 0) if keys.get("clip") else None
        elif model_on and keys.get("ckpt"):
            inputs["model"] = _link(keys["ckpt"], 0)
            inputs["clip"] = _link(keys["ckpt"], 1)
            clip_link = _link(keys["ckpt"], 1)
        if model_on and diffusion and keys.get("vae"):
            inputs["vae"] = _link(keys["vae"], 0)
        elif model_on and keys.get("ckpt"):
            inputs["vae"] = _link(keys["ckpt"], 2)
        if clip_link:
            for encode_key in (keys.get("pos"), keys.get("neg")):
                node = workflow.get(encode_key or "")
                if isinstance(node, dict):
                    node.setdefault("inputs", {})["clip"] = clip_link


def fill_txt2img(
    values: dict[str, Any],
    load_workflow: Callable[[str], dict[str, Any]],
    filename: Callable[[str], str],
    graph: Callable[[Any], dict[str, Any]],
) -> dict[str, Any]:
    lora_tags.apply(values)
    clip_prompt = lora_tags.strip_tags(str(values.get("prompt") or ""))
    clip_negative = lora_tags.strip_tags(str(values.get("negative_prompt") or ""))
    values["prompt_clip"] = clip_prompt
    values["negative_clip"] = clip_negative
    loaded = copy.deepcopy(load_workflow(str(values.get("workflow") or "txt2img")))
    if hires_enabled(values):
        loaded = apply_hires(loaded, values)
    if adetailer_enabled(values):
        loaded = apply_adetailer(loaded, values)
    host_ports = loaded.get("ports") if isinstance(loaded.get("ports"), dict) else {}
    workflow = graph(loaded)
    positive_done = False
    batch_size = max(1, int(values.get("batch_size") or 1))
    blob = _hires_blob(values)
    upscale = filename(str(blob.get("upscale_model") or blob.get("upscaleModel") or ""))
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        title = _title(node)
        if _is_port(node):
            continue
        if kind == "CheckpointLoaderSimple":
            if _is_hires(node) or _is_adetailer(node):
                continue
            inputs["ckpt_name"] = filename(str(values["checkpoint"]))
        elif kind == "UNETLoader":
            if _is_hires(node) or _is_adetailer(node):
                continue
            inputs["unet_name"] = filename(str(values.get("checkpoint") or ""))
        elif kind == "CLIPLoader":
            if _is_hires(node) or _is_adetailer(node):
                continue
            name = filename(str(values.get("text_encoder") or ""))
            if name:
                inputs["clip_name"] = name
        elif kind == "VAELoader":
            if _is_hires(node) or _is_adetailer(node):
                continue
            name = filename(str(values.get("vae") or ""))
            if name:
                inputs["vae_name"] = name
        elif kind == "CLIPTextEncode":
            if _is_hires(node) or _is_adetailer(node):
                continue
            if "negative" in title:
                inputs["text"] = clip_negative
            elif "positive" in title or not positive_done:
                inputs["text"] = clip_prompt
                positive_done = True
            else:
                inputs["text"] = clip_negative
        elif kind == "KSampler":
            if _is_hires(node):
                _fill_hires_sampler(inputs, values)
            else:
                inputs["seed"] = int(values["seed"])
                inputs["steps"] = int(values["steps"])
                inputs["cfg"] = float(values["cfg"])
                inputs["sampler_name"] = values["sampler"]
                inputs["scheduler"] = values["scheduler"]
        elif kind == "EmptyLatentImage":
            inputs["width"] = int(values["width"])
            inputs["height"] = int(values["height"])
            inputs["batch_size"] = batch_size
        elif kind == "SaveImage":
            prefix = str(values.get("filename_prefix") or "").strip() or "blombo"
            inputs["filename_prefix"] = prefix
        elif kind == "Power Lora Loader (rgthree)":
            if _is_hires(node) or _is_adetailer(node):
                continue
            fill_power_loras(inputs, values, filename)
        elif kind == "UpscaleModelLoader":
            if upscale:
                inputs["model_name"] = upscale
        elif kind == "ImageScale":
            width, height = hires_target_size(values)
            method, crop = _hires_scale_opts(blob)
            inputs["width"] = width
            inputs["height"] = height
            inputs["upscale_method"] = method
            inputs["crop"] = crop
    if hires_enabled(values):
        _rewire_hires(workflow, values, filename)
    _apply_hires_saves(workflow, values)
    _fill_adetailer(workflow, values, filename, host_ports)
    latent = workflow.get("7")
    if isinstance(latent, dict):
        latent.setdefault("inputs", {})["batch_size"] = batch_size
    return workflow
