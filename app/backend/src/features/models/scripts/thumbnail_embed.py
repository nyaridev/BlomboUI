from __future__ import annotations

import json
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from shared import pnginfo
from features.models.scripts.thumbnail_scopes import parse_tags

KEY = "blombo"
_IMAGE_DESC = 270
_USER_COMMENT = 0x9286


def extract_source(data: bytes) -> dict[str, Any]:
    info = pnginfo.read(data)
    raw = info.get("raw") if isinstance(info.get("raw"), dict) else {}
    text = str(info.get("text") or "")
    if text.startswith("Could not read") or text.startswith("No generation"):
        text = ""
    prompt = ""
    if isinstance(raw, dict):
        prompt = str(raw.get("parameters") or raw.get("prompt") or "")
    if not prompt:
        prompt = text.split("\nNegative prompt:", 1)[0].strip()
    tags = parse_tags(prompt)
    payload = read_bytes(data)
    if payload.get("tags"):
        tags = [str(item) for item in payload["tags"] if str(item).strip()]
    return {
        "tags": tags,
        "prompt": prompt,
        "parameters": text,
        "raw": raw,
        "captured_at": int(payload.get("captured_at") or time.time()),
        "origin": str(payload.get("origin") or ""),
        "civitai": payload.get("civitai") if isinstance(payload.get("civitai"), dict) else {},
        "context": str(payload.get("context") or ""),
    }


def pack(context: str, source: dict[str, Any] | None = None) -> dict[str, Any]:
    row = source or {}
    tags = row.get("tags")
    if not isinstance(tags, list):
        tags = parse_tags(str(row.get("prompt") or ""))
    clean = [str(item).strip() for item in tags if str(item).strip()]
    return {
        "v": 1,
        "context": context,
        "tags": clean,
        "prompt": str(row.get("prompt") or ""),
        "parameters": str(row.get("parameters") or ""),
        "raw": row.get("raw") if isinstance(row.get("raw"), dict) else {},
        "origin": str(row.get("origin") or ""),
        "civitai": row.get("civitai") if isinstance(row.get("civitai"), dict) else {},
        "captured_at": int(row.get("captured_at") or time.time()),
    }


def write_image(image: Any, fmt: str, payload: dict[str, Any], dest: Path) -> None:
    fmt = (fmt or "").upper()
    blob = json.dumps(payload, separators=(",", ":"))
    params = str(payload.get("parameters") or "")
    out = BytesIO()
    if fmt == "PNG":
        from PIL.PngImagePlugin import PngInfo

        info = PngInfo()
        texts = getattr(image, "text", None) or {}
        if isinstance(texts, dict):
            for key, value in texts.items():
                if isinstance(key, str) and isinstance(value, str) and key not in {KEY, "parameters"}:
                    info.add_text(key, value, zip=True)
        info.add_text(KEY, blob, zip=True)
        if params:
            info.add_text("parameters", params, zip=True)
        image.save(out, format="PNG", pnginfo=info)
    else:
        if fmt == "JPEG" and image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        exif = _exif(blob, params)
        opts: dict[str, Any] = {}
        if fmt == "JPEG":
            opts["quality"] = 85
        if exif is not None:
            opts["exif"] = exif
        image.save(out, format=fmt, **opts)
    dest.write_bytes(out.getvalue())


def read_file(path: Path) -> dict[str, Any]:
    try:
        return read_bytes(path.read_bytes())
    except OSError:
        return {}


def read_bytes(data: bytes) -> dict[str, Any]:
    from PIL import Image

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        return {}
    texts = getattr(image, "text", None) or {}
    if isinstance(texts, dict) and isinstance(texts.get(KEY), str):
        row = _json(texts[KEY])
        if row:
            return row
    try:
        exif = image.getexif()
    except Exception:
        exif = None
    if exif:
        for key in (_IMAGE_DESC, _USER_COMMENT):
            row = _from_exif(exif.get(key))
            if row:
                return row
    return {}


def _exif(blob: str, params: str) -> Any:
    from PIL import Image

    exif = Image.Exif()
    try:
        exif[_IMAGE_DESC] = blob[:4096]
    except Exception:
        pass
    comment = params.strip() or blob
    if comment:
        payload = b"UNICODE\x00" + comment.encode("utf-16")
        if len(payload) > 60000:
            payload = payload[:60000]
        try:
            exif[_USER_COMMENT] = payload
        except Exception:
            pass
    return exif


def _from_exif(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        return _json(raw)
    if not isinstance(raw, (bytes, bytearray)):
        return _json(str(raw))
    data = bytes(raw)
    text = ""
    if data.startswith(b"UNICODE\x00"):
        text = data[8:].decode("utf-16", "replace").strip("\x00")
    elif data.startswith(b"ASCII\x00\x00\x00"):
        text = data[8:].decode("ascii", "replace").strip("\x00")
    else:
        try:
            text = data.decode("utf-8").strip("\x00")
        except UnicodeDecodeError:
            text = data.decode("latin-1", "replace").strip("\x00")
    return _json(text)


def _json(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) and data.get("v") == 1 else {}
