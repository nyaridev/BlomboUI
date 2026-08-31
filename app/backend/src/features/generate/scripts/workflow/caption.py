from __future__ import annotations

import copy
import math
from pathlib import Path
from typing import Any

from features.generate.scripts.workflow.rembg import list_input_images, source_path

PATH_DEFAULT = "image_caption/[date]"
NAME_DEFAULT = "[index]"
_ENGINES = {"wd14", "qwen"}
_QUANTS = ("4-bit (VRAM-friendly)", "8-bit (Balanced)", "None (FP16)")
WD14_MODELS = (
    "wd-eva02-large-tagger-v3",
    "wd-vit-tagger-v3",
    "wd-swinv2-tagger-v3",
    "wd-convnext-tagger-v3",
    "wd-v1-4-moat-tagger-v2",
    "wd-v1-4-convnextv2-tagger-v2",
    "wd-v1-4-convnext-tagger-v2",
    "wd-v1-4-convnext-tagger",
    "wd-v1-4-vit-tagger-v2",
    "wd-v1-4-swinv2-tagger-v2",
    "wd-v1-4-vit-tagger",
)
QWEN_MODELS = (
    "Qwen3-VL-2B-Instruct",
    "Qwen3-VL-2B-Thinking",
    "Qwen3-VL-2B-Instruct-FP8",
    "Qwen3-VL-2B-Thinking-FP8",
    "Qwen3-VL-4B-Instruct",
    "Qwen3-VL-4B-Thinking",
    "Qwen3-VL-4B-Instruct-FP8",
    "Qwen3-VL-4B-Thinking-FP8",
    "Qwen3-VL-8B-Instruct",
    "Qwen3-VL-8B-Thinking",
    "Qwen3-VL-8B-Instruct-FP8",
    "Qwen3-VL-8B-Thinking-FP8",
    "Qwen3-VL-32B-Instruct",
    "Qwen3-VL-32B-Thinking",
    "Qwen3-VL-32B-Instruct-FP8",
    "Qwen3-VL-32B-Thinking-FP8",
    "Qwen2.5-VL-3B-Instruct",
    "Qwen2.5-VL-7B-Instruct",
    "unsloth/Qwen3.5-4B",
    "unsloth/Qwen3.6-27B",
    "unsloth/Qwen3.8-27B",
)
WD14_KIND = "WD14Tagger|pysssss"
QWEN_KIND = "AILab_QwenVL"
BASE_PROMPT = (
    "Mark the subject as `Character`.\n"
    "\n"
    "Caption provided image with following formula:\n"
    "\n"
    "[Medium + shot type] of Character.\n"
    "[pose / action / expression], [wardrobe], [environment / background],\n"
    "[lighting], [camera / lens / DoF], [film / texture / color treatment].\n"
    "\n"
    "Output only the caption. No comments and notes allowed."
)


def is_caption(values: dict[str, Any]) -> bool:
    return Path(str(values.get("workflow") or values.get("workflow_id") or "")).stem == "image_caption"


def empty_params() -> dict[str, Any]:
    return {
        "prompt": "",
        "negative_prompt": "",
        "prompt_raw": "",
        "negative_prompt_raw": "",
        "models": [],
    }


def _text(src: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        raw = src.get(key)
        if isinstance(raw, str):
            return raw
    return default


def _flag(src: dict[str, Any], snake: str, camel: str, default: bool = False) -> bool:
    if snake in src:
        return bool(src.get(snake))
    if camel in src:
        return bool(src.get(camel))
    return default


def _num(src: dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for key in keys:
        if key not in src:
            continue
        try:
            return float(src.get(key))
        except (TypeError, ValueError):
            continue
    return default


def clean_caption(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    engine = str(src.get("engine") or "wd14")
    if engine not in _ENGINES:
        engine = "wd14"
    wd14_model = str(src.get("wd14_model") or src.get("wd14Model") or "wd-swinv2-tagger-v3")
    if wd14_model not in WD14_MODELS:
        wd14_model = "wd-swinv2-tagger-v3"
    qwen_model = str(src.get("qwen_model") or src.get("qwenModel") or "Qwen3-VL-4B-Instruct")
    if qwen_model not in QWEN_MODELS:
        qwen_model = "Qwen3-VL-4B-Instruct"
    quant = str(src.get("quantization") or "8-bit (Balanced)")
    if quant not in _QUANTS:
        quant = "8-bit (Balanced)"
    megapixels = _num(src, "megapixels", default=1.0)
    batch_count = int(_num(src, "batch_count", "batchCount", default=1))
    threshold = _num(src, "threshold", default=0.35)
    character = _num(src, "character_threshold", "characterThreshold", default=0.85)
    return {
        "engine": engine,
        "wd14_model": wd14_model,
        "qwen_model": qwen_model,
        "quantization": quant,
        "guidance": _text(src, "guidance").strip(),
        "prefix": _text(src, "prefix"),
        "suffix": _text(src, "suffix"),
        "megapixels": max(0.25, min(4.0, megapixels)),
        "batch_count": max(1, min(16, batch_count)),
        "save_image": _flag(src, "save_image", "saveImage", True),
        "threshold": max(0.0, min(1.0, threshold)),
        "character_threshold": max(0.0, min(1.0, character)),
        "input_mode": "directory" if str(src.get("input_mode") or src.get("inputMode") or "") == "directory" else "files",
        "input_dir": str(src.get("input_dir") or src.get("inputDir") or "").strip(),
    }


def qwen_prompt(blob: dict[str, Any]) -> str:
    extra = str(blob.get("guidance") or "").strip()
    if extra:
        return f"{BASE_PROMPT}\n\n{extra}"
    return BASE_PROMPT


def format_caption(blob: dict[str, Any], text: str) -> str:
    body = str(text or "").strip()
    if blob.get("engine") != "wd14":
        return body
    return f"{blob.get('prefix') or ''}{body}{blob.get('suffix') or ''}"


def input_runs(values: dict[str, Any]) -> list[dict[str, Any]]:
    paths = list_input_images(values)
    blob = clean_caption(values.get("caption"))
    size = blob["batch_count"] if blob["engine"] == "wd14" else 1
    runs: list[dict[str, Any]] = []
    for start in range(0, len(paths), size):
        chunk = paths[start : start + size]
        runs.append(
            {
                **values,
                "caption": blob,
                "input_image": str(chunk[0]),
                "input_images": [str(path) for path in chunk],
                "file_index": start + 1,
                "batch_count": 1,
                "batch_size": 1,
            }
        )
    return runs


def _source_size(path: Path | None) -> tuple[int, int]:
    if path is None or not path.is_file():
        return 1024, 1024
    try:
        from PIL import Image

        with Image.open(path) as image:
            return max(1, int(image.size[0])), max(1, int(image.size[1]))
    except OSError:
        return 1024, 1024


def target_size(path: str | Path | None, megapixels: float) -> tuple[int, int]:
    width, height = _source_size(Path(path) if path else None)
    pixels = max(width * height, 1)
    scale = math.sqrt(max(0.25, min(4.0, float(megapixels))) * 1_000_000 / pixels)
    return max(1, int(round(width * scale))), max(1, int(round(height * scale)))


def _find_kind(workflow: dict[str, Any], kind: str) -> str | None:
    for key, node in workflow.items():
        if isinstance(node, dict) and node.get("class_type") == kind:
            return str(key)
    return None


def _pop_kinds(workflow: dict[str, Any], kinds: set[str]) -> None:
    for key, node in list(workflow.items()):
        if isinstance(node, dict) and node.get("class_type") in kinds:
            workflow.pop(key, None)


def _next_key(workflow: dict[str, Any]) -> str:
    n = 0
    for key in workflow:
        try:
            n = max(n, int(key))
        except (TypeError, ValueError):
            continue
    return str(n + 1)


def _source_for_load(values: dict[str, Any], index: int) -> Path | None:
    for key in ("source_images", "input_images"):
        raw = values.get(key)
        if isinstance(raw, list) and index < len(raw):
            path = Path(str(raw[index]))
            if path.is_file():
                return path
    return source_path(values)


def apply_caption(workflow: dict[str, Any], values: dict[str, Any]) -> None:
    blob = clean_caption(values.get("caption"))
    names = [Path(str(item)).name for item in values.get("input_images") or [] if str(item).strip()]
    if not names:
        name = Path(str(values.get("input_image") or "")).name
        if name:
            names = [name]
    load_id = _find_kind(workflow, "LoadImage")
    scale_id = _find_kind(workflow, "ImageScale")
    if load_id and names:
        workflow[load_id].setdefault("inputs", {})["image"] = names[0]
    scale_ids = [scale_id] if scale_id else []
    if load_id and scale_id and len(names) > 1:
        for index, name in enumerate(names[1:], start=1):
            extra_load = _next_key(workflow)
            workflow[extra_load] = copy.deepcopy(workflow[load_id])
            workflow[extra_load].setdefault("inputs", {})["image"] = name
            extra_scale = _next_key(workflow)
            workflow[extra_scale] = copy.deepcopy(workflow[scale_id])
            workflow[extra_scale].setdefault("inputs", {})["image"] = [extra_load, 0]
            width, height = target_size(_source_for_load(values, index), blob["megapixels"])
            inputs = workflow[extra_scale].setdefault("inputs", {})
            inputs["width"] = width
            inputs["height"] = height
            inputs["upscale_method"] = "lanczos"
            inputs["crop"] = "disabled"
            scale_ids.append(extra_scale)
    if scale_id:
        width, height = target_size(_source_for_load(values, 0), blob["megapixels"])
        inputs = workflow[scale_id].setdefault("inputs", {})
        inputs["width"] = width
        inputs["height"] = height
        inputs["upscale_method"] = "lanczos"
        inputs["crop"] = "disabled"
    image_ref = scale_ids[0] if scale_ids else None
    if blob["engine"] == "wd14" and len(scale_ids) > 1:
        # ponytail: ImageBatch resizes later images to the first size; pad-to-max if mixed aspect matters
        current = scale_ids[0]
        for extra in scale_ids[1:]:
            key = _next_key(workflow)
            workflow[key] = {
                "class_type": "ImageBatch",
                "inputs": {"image1": [current, 0], "image2": [extra, 0]},
            }
            current = key
        image_ref = current
    keep = WD14_KIND if blob["engine"] == "wd14" else QWEN_KIND
    drop = QWEN_KIND if keep == WD14_KIND else WD14_KIND
    _pop_kinds(workflow, {drop})
    keep_id = _find_kind(workflow, keep)
    if keep_id and image_ref:
        workflow[keep_id].setdefault("inputs", {})["image"] = [image_ref, 0]
    if keep_id and keep == WD14_KIND:
        inputs = workflow[keep_id].setdefault("inputs", {})
        inputs["model"] = blob["wd14_model"]
        inputs["threshold"] = blob["threshold"]
        inputs["character_threshold"] = blob["character_threshold"]
    if keep_id and keep == QWEN_KIND:
        inputs = workflow[keep_id].setdefault("inputs", {})
        inputs["model_name"] = blob["qwen_model"]
        inputs["quantization"] = blob["quantization"]
        inputs["custom_prompt"] = qwen_prompt(blob)
        inputs["keep_model_loaded"] = True
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if kind == "SaveImage" and image_ref:
            inputs["images"] = [image_ref, 0]
        elif kind == "SaveStringKJ" and keep_id:
            inputs["string"] = [keep_id, 0]
    if blob["engine"] == "wd14":
        _pop_kinds(workflow, {"SaveStringKJ"})
    if not blob["save_image"]:
        _pop_kinds(workflow, {"SaveImage"})
