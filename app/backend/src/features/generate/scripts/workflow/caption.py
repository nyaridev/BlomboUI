from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path
from typing import Any

from config import RUNTIME, comfy_models_root, launcher_env, models_root
from features.generate.scripts.workflow.rembg import list_input_images, source_path
from shared import dirs

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
QWEN_GGUF_MODELS = (
    "Qwen3VL-4B-Instruct-Q4_K_M.gguf",
    "Qwen3VL-4B-Instruct-Q8_0.gguf",
    "Qwen3VL-4B-Instruct-F16.gguf",
    "Qwen3VL-8B-Instruct-Q4_K_M.gguf",
    "Qwen3VL-8B-Instruct-Q8_0.gguf",
    "Qwen3VL-8B-Instruct-F16.gguf",
    "Qwen3VL-4B-Thinking-Q4_K_M.gguf",
    "Qwen3VL-4B-Thinking-Q8_0.gguf",
    "Qwen3VL-4B-Thinking-F16.gguf",
    "Qwen3VL-8B-Thinking-Q4_K_M.gguf",
    "Qwen3VL-8B-Thinking-Q8_0.gguf",
    "Qwen3VL-8B-Thinking-F16.gguf",
    "Qwen3.5-4B-UD-Q4_K_XL.gguf",
    "Qwen3.6-27B-UD-Q3_K_XL.gguf",
    "Qwen3.8-27B-UD-Q3_K_XL.gguf",
)
WD14_KIND = "WD14Tagger|pysssss"
QWEN_KIND = "AILab_QwenVL"
QWEN_GGUF_KIND = "AILab_QwenVL_GGUF"
QWEN_PRESETS = (
    "🖼️ Tags",
    "🖼️ Simple Description",
    "🖼️ Detailed Description",
    "🖼️ Ultra Detailed Description",
    "🎬 Cinematic Description",
    "🖼️ Detailed Analysis",
    "📹 Video Summary",
    "📖 Short Story",
    "🧩Prompt Refine & Expand",
)
_SEED_AFTER = {"randomize", "fixed", "increment", "decrement"}
_NATIVE_WEIGHTS = {".safetensors", ".bin"}
QWEN_MODEL_DEFAULT = "Qwen3-VL-4B-Instruct"
QWEN_GGUF_DEFAULT = "Qwen3VL-4B-Instruct-Q8_0.gguf"
BASE_PROMPT = (
    "Mark the subject as `Subject`.\n"
    "\n"
    "Caption provided image with following formula:\n"
    "\n"
    "[Medium + shot type] of Subject.\n"
    "[pose / action / expression], [wardrobe], [environment / background],\n"
    "[lighting], [camera / lens / DoF], [film / texture / color treatment].\n"
    "\n"
    "Output only the caption. No comments and notes allowed."
)


def _llm_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()
    for folder in (models_root(), *dirs.extra_named("modelDirs").values()):
        root = folder / "LLM"
        key = str(root)
        try:
            key = str(root.resolve())
        except OSError:
            pass
        if key in seen:
            continue
        seen.add(key)
        if root.is_dir():
            roots.append(root)
    return roots


def _posix_rel(root: Path, path: Path) -> str:
    rel = path.relative_to(root).as_posix().strip("/")
    return "" if rel in {".", ""} else rel


def _native_display_name(rel: str) -> str:
    text = rel.strip("/")
    prefix = "Qwen-VL/"
    if text.lower().startswith(prefix.lower()):
        text = text[len(prefix) :]
    return text.strip("/")


def _is_native_dir(folder: Path) -> bool:
    try:
        entries = folder.iterdir()
    except OSError:
        return False
    for path in entries:
        if not path.is_file():
            continue
        if path.name.lower() == "config.json":
            return True
        if path.suffix.lower() in _NATIVE_WEIGHTS:
            return True
    return False


def _known_name(name: str, catalog: list[str]) -> bool:
    if name in catalog:
        return True
    bases = {Path(item).name for item in catalog}
    return Path(name).name in bases


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _qwenvl_node_dir() -> Path | None:
    env = launcher_env()
    raw = str(env.get("comfyui.path") or "").strip()
    roots = [Path(raw)] if raw else []
    roots.append(comfy_models_root().parent)
    roots.append(RUNTIME / "comfyui" / "ComfyUI")
    seen: set[str] = set()
    for root in roots:
        folder = root / "custom_nodes" / "ComfyUI-QwenVL"
        key = str(folder)
        if key in seen:
            continue
        seen.add(key)
        if folder.is_dir():
            return folder
    return None


def _hf_vl_keys(data: dict[str, Any]) -> list[str]:
    if "hf_vl_models" in data or "hf_text_models" in data:
        models = data.get("hf_vl_models") or {}
    else:
        models = {key: value for key, value in data.items() if not str(key).startswith("_")}
    if not isinstance(models, dict):
        return []
    return [str(key) for key in models if str(key).strip()]


def _gguf_vl_keys(data: dict[str, Any]) -> list[str]:
    flattened: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    repos = data.get("qwenVL_model") or data.get("vl_repos") or data.get("repos") or {}
    if isinstance(repos, dict):
        for repo_key, repo in repos.items():
            if not isinstance(repo, dict):
                continue
            mmproj = repo.get("mmproj_file") or repo.get("mmproj_filename")
            for model_file in repo.get("model_files") or []:
                display = Path(str(model_file)).name
                if display in seen:
                    display = f"{display} ({repo_key})"
                seen.add(display)
                flattened[display] = {"mmproj_filename": mmproj}
    legacy = data.get("models") or {}
    if isinstance(legacy, dict):
        for name, entry in legacy.items():
            if isinstance(entry, dict):
                flattened[str(name)] = entry
    keys = [
        key
        for key, entry in flattened.items()
        if (entry or {}).get("mmproj_filename") or (entry or {}).get("mmproj_file")
    ]
    return sorted(keys)


def _pack_json_catalog() -> dict[str, list[str]]:
    folder = _qwenvl_node_dir()
    if folder is None:
        return {"native": [], "gguf": []}
    native = _hf_vl_keys(_read_json(folder / "hf_models.json"))
    custom = _read_json(folder / "custom_models.json")
    for name in _hf_vl_keys(custom):
        if name not in native:
            native.append(name)
    legacy = custom.get("hf_models") or custom.get("models") or {}
    if isinstance(legacy, dict):
        for name in legacy:
            text = str(name).strip()
            if text and text not in native:
                native.append(text)
    return {"native": native, "gguf": _gguf_vl_keys(_read_json(folder / "gguf_models.json"))}


def _live_node_catalog() -> dict[str, list[str]]:
    try:
        from infrastructure.comfy import client as comfy

        listed = comfy.qwen_vl_choices()
    except Exception:
        listed = {"native": [], "gguf": []}
    if not isinstance(listed, dict):
        return {"native": [], "gguf": []}
    native = listed.get("native") if isinstance(listed.get("native"), list) else []
    gguf = listed.get("gguf") if isinstance(listed.get("gguf"), list) else []
    return {
        "native": [str(item) for item in native if str(item).strip()],
        "gguf": [str(item) for item in gguf if str(item).strip()],
    }


def _node_catalog() -> dict[str, list[str]]:
    live = _live_node_catalog()
    packed = _pack_json_catalog()
    native = live["native"] or packed["native"] or list(QWEN_MODELS)
    gguf = live["gguf"] or packed["gguf"] or list(QWEN_GGUF_MODELS)
    return {"native": native, "gguf": gguf}


def _scan_llm_extras(known_native: list[str], known_gguf: list[str]) -> tuple[set[str], set[str]]:
    native: set[str] = set()
    gguf: set[str] = set()
    known_gguf_set = set(known_gguf)
    for root in _llm_roots():
        for dirpath, _dirnames, filenames in os.walk(root):
            folder = Path(dirpath)
            try:
                rel = _posix_rel(root, folder)
            except ValueError:
                continue
            gguf_tree = any(part.lower() == "gguf" for part in Path(rel).parts) if rel else False
            for name in filenames:
                path = folder / name
                if not path.is_file() or path.suffix.lower() != ".gguf":
                    continue
                if name.lower().startswith("mmproj"):
                    continue
                if name not in known_gguf_set:
                    gguf.add(name)
            if gguf_tree or not rel or not _is_native_dir(folder):
                continue
            display = _native_display_name(rel)
            if display and not _known_name(display, known_native):
                native.add(display)
    return native, gguf


def _merge_catalog(catalog: list[str], extras: set[str]) -> list[str]:
    seen = set(catalog)
    extra_names = sorted((name for name in extras if name not in seen), key=str.lower)
    return [*catalog, *extra_names]


def list_qwen_vl_models() -> dict[str, list[str]]:
    catalog = _node_catalog()
    native_extra, gguf_extra = _scan_llm_extras(catalog["native"], catalog["gguf"])
    return {
        "native": _merge_catalog(catalog["native"], native_extra),
        "gguf": _merge_catalog(catalog["gguf"], gguf_extra),
    }


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
    wd14_model = str(src.get("wd14_model") or src.get("wd14Model") or "wd-v1-4-moat-tagger-v2")
    if wd14_model not in WD14_MODELS:
        wd14_model = "wd-v1-4-moat-tagger-v2"
    qwen_backend = str(src.get("qwen_backend") or src.get("qwenBackend") or "native")
    if qwen_backend not in {"native", "gguf"}:
        qwen_backend = "native"
    listed = list_qwen_vl_models()
    qwen_model = str(src.get("qwen_model") or src.get("qwenModel") or QWEN_MODEL_DEFAULT)
    if qwen_model not in listed["native"]:
        qwen_model = QWEN_MODEL_DEFAULT
    qwen_gguf_model = str(src.get("qwen_gguf_model") or src.get("qwenGgufModel") or QWEN_GGUF_DEFAULT)
    if qwen_gguf_model not in listed["gguf"]:
        qwen_gguf_model = QWEN_GGUF_DEFAULT
    quant = str(src.get("quantization") or "8-bit (Balanced)")
    if quant not in _QUANTS:
        quant = "8-bit (Balanced)"
    megapixels = _num(src, "megapixels", default=1.0)
    batch_size = int(_num(src, "batch_size", "batchSize", "batch_count", "batchCount", default=1))
    threshold = _num(src, "threshold", default=0.35)
    character = _num(src, "character_threshold", "characterThreshold", default=0.85)
    preset_prompt = _text(src, "preset_prompt", "presetPrompt", default="🖼️ Detailed Description")
    if preset_prompt not in QWEN_PRESETS:
        preset_prompt = "🖼️ Detailed Description"
    source = str(src.get("prompt_source") or src.get("promptSource") or "custom")
    if source not in {"preset", "custom"}:
        source = "custom"
    max_tokens = int(_num(src, "max_tokens", "maxTokens", default=512))
    seed = int(_num(src, "seed", default=1))
    seed_after = str(src.get("seed_after") or src.get("seedAfter") or "fixed")
    if seed_after not in _SEED_AFTER:
        seed_after = "fixed"
    return {
        "engine": engine,
        "qwen_backend": qwen_backend,
        "wd14_model": wd14_model,
        "qwen_model": qwen_model,
        "qwen_gguf_model": qwen_gguf_model,
        "quantization": quant,
        "guidance": _text(src, "guidance").strip(),
        "prefix": _text(src, "prefix"),
        "suffix": _text(src, "suffix"),
        "megapixels": max(0.25, min(4.0, megapixels)),
        "batch_size": max(1, min(16, batch_size)),
        "save_image": _flag(src, "save_image", "saveImage", True),
        "override_existing": _flag(src, "override_existing", "overrideExisting", True),
        "threshold": max(0.0, min(1.0, threshold)),
        "character_threshold": max(0.0, min(1.0, character)),
        "replace_underscore": _flag(src, "replace_underscore", "replaceUnderscore", False),
        "trailing_comma": _flag(src, "trailing_comma", "trailingComma", False),
        "exclude_tags": _text(src, "exclude_tags", "excludeTags"),
        "prompt_source": source,
        "preset_prompt": preset_prompt,
        "max_tokens": max(16, min(8192, max_tokens)),
        "keep_model_loaded": _flag(src, "keep_model_loaded", "keepModelLoaded", True),
        "seed": seed,
        "seed_after": seed_after,
        "input_mode": "directory" if str(src.get("input_mode") or src.get("inputMode") or "") == "directory" else "files",
        "input_dir": str(src.get("input_dir") or src.get("inputDir") or "").strip(),
    }


def qwen_prompt(blob: dict[str, Any]) -> str:
    if str(blob.get("prompt_source") or "custom") != "custom":
        return ""
    return str(blob.get("guidance") or "").strip()


def join_caption_parts(*parts: str) -> str:
    chunks: list[str] = []
    for part in parts:
        text = str(part or "").strip().strip(",").strip()
        if text:
            chunks.append(text)
    return ", ".join(chunks)


def format_caption(blob: dict[str, Any], text: str) -> str:
    body = str(text or "").strip()
    if blob.get("engine") != "wd14":
        return body
    return join_caption_parts(str(blob.get("prefix") or ""), body, str(blob.get("suffix") or ""))


def input_runs(values: dict[str, Any]) -> list[dict[str, Any]]:
    paths = list_input_images(values)
    blob = clean_caption(values.get("caption"))
    size = blob["batch_size"] if blob["engine"] == "wd14" else 1
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
    total = int(round(max(0.25, min(4.0, float(megapixels))) * 1024 * 1024))
    scale = math.sqrt(total / pixels)
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


def _fill_qwen(inputs: dict[str, Any], blob: dict[str, Any], *, model_key: str, quant: bool) -> None:
    inputs["model_name"] = blob[model_key]
    if quant:
        inputs["quantization"] = blob["quantization"]
    inputs["preset_prompt"] = blob["preset_prompt"]
    inputs["custom_prompt"] = qwen_prompt(blob)
    inputs["max_tokens"] = blob["max_tokens"]
    inputs["keep_model_loaded"] = blob["keep_model_loaded"]
    inputs["seed"] = blob["seed"]


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
    if blob["engine"] == "wd14":
        keep = WD14_KIND
        drop = {QWEN_KIND, QWEN_GGUF_KIND}
    elif blob["qwen_backend"] == "gguf":
        keep = QWEN_GGUF_KIND
        drop = {WD14_KIND, QWEN_KIND}
    else:
        keep = QWEN_KIND
        drop = {WD14_KIND, QWEN_GGUF_KIND}
    _pop_kinds(workflow, drop)
    keep_id = _find_kind(workflow, keep)
    if keep_id and image_ref:
        workflow[keep_id].setdefault("inputs", {})["image"] = [image_ref, 0]
    if keep_id and keep == WD14_KIND:
        inputs = workflow[keep_id].setdefault("inputs", {})
        inputs["model"] = blob["wd14_model"]
        inputs["threshold"] = blob["threshold"]
        inputs["character_threshold"] = blob["character_threshold"]
        inputs["replace_underscore"] = blob["replace_underscore"]
        inputs["trailing_comma"] = blob["trailing_comma"]
        inputs["exclude_tags"] = blob["exclude_tags"]
    if keep_id and keep == QWEN_KIND:
        _fill_qwen(workflow[keep_id].setdefault("inputs", {}), blob, model_key="qwen_model", quant=True)
    if keep_id and keep == QWEN_GGUF_KIND:
        _fill_qwen(workflow[keep_id].setdefault("inputs", {}), blob, model_key="qwen_gguf_model", quant=False)
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if kind == "SaveImage" and image_ref:
            inputs["images"] = [image_ref, 0]
        elif kind == "PreviewAny" and keep_id:
            inputs["source"] = [keep_id, 0]
    if blob["engine"] == "wd14":
        _pop_kinds(workflow, {"PreviewAny"})
    if not blob["save_image"]:
        _pop_kinds(workflow, {"SaveImage"})
