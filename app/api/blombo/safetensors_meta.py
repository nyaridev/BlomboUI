from __future__ import annotations

import json
from pathlib import Path

MAX_HEADER = 32 * 1024 * 1024


def read(path: Path) -> dict:
    with path.open("rb") as f:
        size_buf = f.read(8)
        if len(size_buf) < 8:
            raise ValueError("Not a valid safetensors file")
        lo = int.from_bytes(size_buf[:4], "little")
        hi = int.from_bytes(size_buf[4:], "little")
        if hi or not lo or lo > MAX_HEADER:
            raise ValueError("Safetensors header is missing or too large")
        raw = f.read(lo)
    try:
        header = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Could not parse safetensors header") from exc
    if not isinstance(header, dict):
        return {}
    meta = header.get("__metadata__")
    if not isinstance(meta, dict):
        return {}
    out: dict = {}
    for key, value in meta.items():
        if isinstance(value, str):
            try:
                out[str(key)] = json.loads(value)
            except json.JSONDecodeError:
                out[str(key)] = value
        else:
            out[str(key)] = value
    return out
