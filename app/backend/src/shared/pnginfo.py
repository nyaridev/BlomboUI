from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from config import VERSION, outputs_root
from shared.pnginfo_write import embed as write_embed
from shared.pnginfo_write import jpeg_exif as write_jpeg_exif

BLOMBOUI_KEY = "blomboui"


def read(data: bytes, filename: str = "") -> dict[str, Any]:
    from PIL import Image

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        return {"text": "Could not read image.", "raw": {}, "metadata": {}}
    return _from_image(image, filename)


def read_path(path: Path | str) -> dict[str, Any]:
    from PIL import Image

    filename = str(path)
    try:
        with Image.open(path) as image:
            return _from_image(image, filename)
    except Exception:
        return {"text": "Could not read image.", "raw": {}, "metadata": {}}


def _from_image(image: Any, filename: str = "") -> dict[str, Any]:
    texts = _texts(image)
    text = _format(texts) or _from_sidecar(filename)
    metadata = _json(texts.get(BLOMBOUI_KEY, ""))
    width, height = image.size
    return {
        "text": text or "No generation metadata found.",
        "raw": texts,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "width": width,
        "height": height,
    }


def embed(
    data: bytes,
    values: dict[str, Any],
    graph: dict[str, Any] | None = None,
    fmt: str = "png",
    quality: int = 100,
    metadata: dict[str, Any] | None = None,
) -> bytes:
    return write_embed(data, values, graph, fmt, quality, metadata, parameters_text)


def parameters_text(values: dict[str, Any], *, raw: bool = False) -> str:
    from features.generate.scripts import save_meta

    ckpt = save_meta.checkpoint_hashes(values)
    if raw:
        prompt = str(values.get("prompt_raw") or values.get("prompt") or "")
        negative = str(values.get("negative_prompt_raw") or values.get("negative_prompt") or "")
    else:
        prompt = str(values.get("prompt") or "")
        negative = str(values.get("negative_prompt") or "")
    return _lines(
        prompt,
        negative,
        values.get("steps"),
        values.get("sampler"),
        values.get("scheduler"),
        values.get("cfg"),
        values.get("seed"),
        values.get("width"),
        values.get("height"),
        None,
        ckpt.get("autov2") or values.get("model_hash"),
        ckpt.get("autov3"),
        ckpt.get("sha256"),
        ckpt.get("autov1"),
        save_meta.lora_models(values),
        values.get("interrupted"),
    )


def jpeg_exif(text: str, metadata: dict[str, Any] | None = None) -> Any:
    return write_jpeg_exif(text, metadata)


def _texts(image: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    blob = getattr(image, "text", None) or {}
    if isinstance(blob, dict):
        for key, value in blob.items():
            if isinstance(key, str) and isinstance(value, str) and value.strip():
                out[key] = value
    skip = {"exif", "icc_profile", "dpi", "jfif", "jfif_unit", "jfif_density", "adobe", "progression"}
    for key, value in image.info.items():
        if key in skip or not isinstance(key, str) or not isinstance(value, str) or not value.strip():
            continue
        out.setdefault(key, value)
    comment = _exif_comment(image)
    if comment:
        out.setdefault("UserComment", comment)
        envelope = _json(comment)
        if isinstance(envelope, dict) and isinstance(envelope.get(BLOMBOUI_KEY), dict):
            out[BLOMBOUI_KEY] = json.dumps(envelope[BLOMBOUI_KEY], ensure_ascii=False)
            params = envelope.get("parameters")
            if isinstance(params, str) and params.strip():
                out.setdefault("parameters", params)
    return out


def _exif_comment(image: Any) -> str:
    try:
        exif = image.getexif()
    except Exception:
        return ""
    if not exif:
        return ""
    raw = exif.get(0x9286) or exif.get(270)
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if not isinstance(raw, (bytes, bytearray)):
        return str(raw).strip()
    data = bytes(raw)
    if data.startswith(b"ASCII\x00\x00\x00"):
        return data[8:].decode("ascii", "replace").strip("\x00").strip()
    if data.startswith(b"UNICODE\x00"):
        return data[8:].decode("utf-16", "replace").strip("\x00").strip()
    try:
        return data.decode("utf-8").strip("\x00").strip()
    except UnicodeDecodeError:
        return data.decode("latin-1", "replace").strip("\x00").strip()


def _format(texts: dict[str, str]) -> str:
    if texts.get("parameters"):
        return texts["parameters"].strip()
    prompt = texts.get("prompt")
    parsed = _from_prompt(prompt) if prompt else ""
    if parsed:
        return parsed
    for key in ("UserComment", "Comment", "comment"):
        value = texts.get(key)
        if not value:
            continue
        parsed = _from_comment(value)
        if parsed:
            return parsed
        if value.strip():
            return value.strip()
    return ""


def _from_comment(value: str) -> str:
    data = _json(value)
    if not isinstance(data, dict):
        return ""
    prompt = data.get("prompt") or data.get("v4_prompt")
    if isinstance(prompt, dict):
        prompt = prompt.get("caption") or prompt.get("base_caption") or ""
    negative = data.get("uc") or data.get("negative_prompt") or data.get("v4_negative_prompt") or ""
    if isinstance(negative, dict):
        negative = negative.get("caption") or negative.get("base_caption") or ""
    if not isinstance(prompt, str) or not prompt.strip():
        return ""
    steps = data.get("steps")
    sampler = data.get("sampler")
    cfg = data.get("scale") or data.get("cfg_scale") or data.get("cfg")
    seed = data.get("seed")
    width = data.get("width")
    height = data.get("height")
    model = data.get("model") or data.get("sm")
    return _lines(prompt, str(negative) if negative else "", steps, sampler, None, cfg, seed, width, height, model)


def _from_prompt(raw: str) -> str:
    data = _json(raw)
    if not isinstance(data, dict):
        return raw.strip()
    nodes = {str(key): value for key, value in data.items() if isinstance(value, dict)}
    if not nodes:
        return ""
    sampler = next((node for node in nodes.values() if "KSampler" in str(node.get("class_type") or "")), None)
    ckpt = ""
    size = _size(nodes)
    for node in nodes.values():
        inputs = node.get("inputs") or {}
        if not ckpt:
            ckpt = str(inputs.get("ckpt_name") or inputs.get("unet_name") or "")
    positive = negative = ""
    seed = steps = cfg = None
    sampler_name = scheduler = ""
    if sampler:
        inputs = sampler.get("inputs") or {}
        seed = inputs.get("seed")
        steps = inputs.get("steps")
        cfg = inputs.get("cfg")
        sampler_name = str(inputs.get("sampler_name") or "")
        scheduler = str(inputs.get("scheduler") or "")
        positive = _follow_text(nodes, inputs.get("positive"))
        negative = _follow_text(nodes, inputs.get("negative"))
    if not positive:
        clips = [
            str((node.get("inputs") or {}).get("text") or "")
            for node in nodes.values()
            if "CLIPTextEncode" in str(node.get("class_type") or "")
            and isinstance((node.get("inputs") or {}).get("text"), str)
        ]
        if clips:
            positive = clips[0]
            negative = clips[1] if len(clips) > 1 else ""
    text = _lines(positive, negative, steps, sampler_name, scheduler, cfg, seed, size[0] if size else None, size[1] if size else None, ckpt)
    return text or json.dumps(data, indent=2)


def _size(nodes: dict[str, dict[str, Any]]) -> tuple[int, int] | None:
    found: tuple[int, int] | None = None
    for node in nodes.values():
        inputs = node.get("inputs") or {}
        width, height = inputs.get("width"), inputs.get("height")
        if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
            continue
        pair = (int(width), int(height))
        if "Latent" in str(node.get("class_type") or ""):
            return pair
        found = found or pair
    return found


def _follow_text(nodes: dict[str, dict[str, Any]], ref: Any, depth: int = 0) -> str:
    if depth > 8:
        return ""
    if isinstance(ref, str):
        return ref
    if not isinstance(ref, list) or not ref:
        return ""
    node = nodes.get(str(ref[0]))
    if not node:
        return ""
    inputs = node.get("inputs") or {}
    cls = str(node.get("class_type") or "")
    if "CLIPTextEncode" in cls or "text" in inputs:
        value = inputs.get("text")
        if isinstance(value, str):
            return value
        return _follow_text(nodes, value, depth + 1)
    for key in ("prompt", "positive", "string"):
        value = inputs.get(key)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, list):
            got = _follow_text(nodes, value, depth + 1)
            if got:
                return got
    return ""


def _lines(
    prompt: str,
    negative: str,
    steps: Any,
    sampler: Any,
    scheduler: Any,
    cfg: Any,
    seed: Any,
    width: Any,
    height: Any,
    model: Any,
    model_hash: Any = None,
    autov3: Any = None,
    sha256: Any = None,
    autov1: Any = None,
    loras: Any = None,
    interrupted: Any = None,
) -> str:
    parts = [str(prompt or "").strip()]
    if str(negative or "").strip():
        parts.append(f"Negative prompt: {str(negative).strip()}")
    bits: list[str] = []
    if steps is not None and steps != "":
        bits.append(f"Steps: {steps}")
    if sampler:
        bits.append(f"Sampler: {sampler}")
    if scheduler:
        bits.append(f"Scheduler: {scheduler}")
    if cfg is not None and cfg != "":
        bits.append(f"CFG scale: {cfg}")
    if seed is not None and seed != "":
        bits.append(f"Seed: {seed}")
    if width and height:
        bits.append(f"Size: {int(width)}x{int(height)}")
    if model_hash:
        bits.append(f"Model hash: {model_hash}")
    if autov1:
        bits.append(f"AutoV1: {autov1}")
    if autov3:
        bits.append(f"AutoV3: {autov3}")
    if sha256:
        bits.append(f"SHA256: {sha256}")
    if model:
        bits.append(f"Model: {model}")
    if interrupted:
        bits.append("Interrupted: True")
    if bits:
        parts.append(", ".join(bits))
    parts.extend(_lora_lines(loras))
    text = "\n".join(part for part in parts if part).strip()
    if not text:
        return ""
    return f"{text}\nGenerated using BlomboUI {VERSION}"


def _lora_lines(raw: Any) -> list[str]:
    if not isinstance(raw, list) or not raw:
        return []
    hashes: list[str] = []
    weights: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        row = item.get("hashes") if isinstance(item.get("hashes"), dict) else {}
        digest = str(row.get("autov2") or row.get("sha256") or item.get("hash") or "")
        try:
            strength = float(item.get("strength") if item.get("strength") is not None else 1)
        except (TypeError, ValueError):
            strength = 1.0
        if not digest:
            continue
        hashes.append(digest)
        weights.append(f"{digest}: {strength:g}")
    out: list[str] = []
    if hashes:
        out.append(f"Lora hashes: {', '.join(hashes)}")
    if weights:
        out.append(f"Lora weights: {', '.join(weights)}")
    return out


def _from_sidecar(filename: str) -> str:
    stem = Path(filename).name.rsplit(".", 1)[0]
    if not stem or stem.startswith("."):
        return ""
    hits = list(outputs_root().rglob(f"{stem}.json"))
    if not hits:
        return ""
    try:
        data = json.loads(hits[0].read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    if not isinstance(data, dict):
        return ""
    payload = data["params"] if isinstance(data.get("params"), dict) else data
    return parameters_text(payload)


def _json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def parse_parameters(text: str) -> dict[str, Any]:
    lines = str(text or "").replace("\r\n", "\n").split("\n")
    prompt: list[str] = []
    negative: list[str] = []
    index = 0
    while index < len(lines) and not lines[index].lower().startswith(
        ("negative prompt:", "steps:", "generated using ")
    ):
        prompt.append(lines[index])
        index += 1
    if index < len(lines) and lines[index].lower().startswith("negative prompt:"):
        negative.append(lines[index].split(":", 1)[1].strip())
        index += 1
        while index < len(lines) and not lines[index].lower().startswith(("steps:", "generated using ")):
            negative.append(lines[index])
            index += 1
    out: dict[str, Any] = {}
    prompt_text = "\n".join(prompt).strip()
    negative_text = "\n".join(negative).strip()
    if prompt_text:
        out["prompt"] = prompt_text
    if negative_text:
        out["negative_prompt"] = negative_text
    if index >= len(lines) or not lines[index].lower().startswith("steps:"):
        return out

    fields: dict[str, str] = {}
    for chunk in lines[index][len("Steps:") :].split(", "):
        if ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        fields[key.strip().lower()] = value.strip()

    def number(key: str) -> int | float | None:
        raw = fields.get(key)
        if not raw:
            return None
        try:
            value = float(raw)
        except ValueError:
            return None
        return int(value) if value.is_integer() else value

    mapping = {
        "sampler": "sampler",
        "scheduler": "scheduler",
        "model": "checkpoint",
        "model hash": "model_hash",
        "autov1": "autov1",
        "autov3": "autov3",
        "sha256": "sha256",
    }
    for source, target in mapping.items():
        value = fields.get(source)
        if value:
            out[target] = value
    steps = number("steps")
    seed = number("seed")
    cfg = number("cfg scale")
    if steps is not None:
        out["steps"] = int(steps)
    if seed is not None:
        out["seed"] = int(seed)
    if cfg is not None:
        out["cfg"] = cfg
    size = fields.get("size", "").lower().split("x")
    if len(size) == 2:
        try:
            out["width"], out["height"] = int(size[0]), int(size[1])
        except ValueError:
            pass
    return out
