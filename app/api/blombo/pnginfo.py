from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

from blombo.paths import VERSION, outputs_root


def read(data: bytes, filename: str = "") -> dict[str, Any]:
    from PIL import Image

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        return {"text": "Could not read image.", "raw": {}}
    texts = _texts(image)
    text = _format(texts) or _from_sidecar(filename)
    return {"text": text or "No generation metadata found.", "raw": texts}


def embed(
    data: bytes,
    values: dict[str, Any],
    graph: dict[str, Any] | None = None,
    fmt: str = "png",
    quality: int = 100,
) -> bytes:
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        return data
    fmt = "jpg" if fmt in {"jpg", "jpeg"} else fmt
    if fmt == "png":
        info = PngInfo()
        for key, value in (getattr(image, "text", None) or {}).items():
            if isinstance(key, str) and isinstance(value, str) and key not in {"parameters", "prompt"}:
                info.add_text(key, value, zip=True)
        info.add_text("parameters", parameters_text(values))
        if graph:
            info.add_text("prompt", json.dumps(graph), zip=True)
        out = BytesIO()
        image.save(out, format="PNG", pnginfo=info)
        return out.getvalue()
    if fmt == "jpg":
        image = _rgb(image)
    q = max(1, min(100, int(quality)))
    exif = jpeg_exif(parameters_text(values))
    out = BytesIO()
    opts: dict[str, Any] = {"quality": q}
    if exif is not None:
        opts["exif"] = exif
    try:
        if fmt == "webp":
            image.save(out, format="WEBP", **opts)
        else:
            image.save(out, format="JPEG", optimize=True, **opts)
    except OSError:
        if fmt == "webp":
            image.save(out, format="WEBP", quality=q)
        else:
            image.save(out, format="JPEG", quality=q, optimize=True)
    return out.getvalue()


def _rgb(image: Any) -> Any:
    from PIL import Image

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        bg = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return image.convert("RGB")


def parameters_text(values: dict[str, Any], *, raw: bool = False) -> str:
    hashes = values.get("model_hashes")
    autov1 = autov3 = sha256 = ""
    if isinstance(hashes, dict):
        autov1 = str(hashes.get("autov1") or "")
        autov3 = str(hashes.get("autov3") or "")
        sha256 = str(hashes.get("sha256") or "")
    if raw:
        prompt = str(values.get("prompt") or "")
        negative = str(values.get("negative_prompt") or "")
    else:
        prompt = str(values.get("prompt_expanded") or values.get("prompt") or "")
        negative = str(values.get("negative_prompt_expanded") or values.get("negative_prompt") or "")
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
        values.get("checkpoint"),
        values.get("model_hash"),
        autov3,
        sha256,
        autov1,
        values.get("loras"),
        values.get("interrupted"),
    )


def jpeg_exif(text: str) -> Any:
    from PIL import Image

    comment = str(text or "").strip()
    if not comment:
        return None
    exif = Image.Exif()
    payload = b"UNICODE\x00" + comment.encode("utf-16")
    if len(payload) > 60000:
        payload = payload[:60000]
    exif[0x9286] = payload
    try:
        exif[270] = comment[:4096]
    except Exception:
        pass
    return exif


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


def _lora_stem(path: str) -> str:
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name


def _lora_lines(raw: Any) -> list[str]:
    if not isinstance(raw, list) or not raw:
        return []
    hashes: list[str] = []
    weights: list[str] = []
    for item in raw:
        if isinstance(item, str):
            name, strength, digest = item, 1.0, ""
        elif isinstance(item, dict):
            name = str(item.get("lora") or item.get("path") or "")
            digest = str(item.get("hash") or "")
            try:
                strength = float(item.get("strength") if item.get("strength") is not None else 1)
            except (TypeError, ValueError):
                strength = 1.0
        else:
            continue
        stem = _lora_stem(name.strip())
        if not stem:
            continue
        if digest:
            hashes.append(f"{stem}: {digest}")
        weights.append(f"{stem}: {strength:g}")
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
    return parameters_text(data)


def _json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None
