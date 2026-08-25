from __future__ import annotations

import math
import random
import re
from pathlib import Path
from typing import Any

SHARED_TYPES = {"lora", "prompt_sr"}
DISABLED_TYPES = {"batch_count", "batch_size"}
TYPE_LABELS = {
    "checkpoint": "Checkpoint",
    "vae": "VAE",
    "text_encoder": "Text encoder",
    "lora": "LoRA",
    "sampler": "Sampler",
    "scheduler": "Scheduler",
    "resolution": "Resolution",
    "steps": "Steps",
    "cfg": "CFG",
    "seed": "Seed",
    "prompt_sr": "Prompt S/R",
}

_SIZE = re.compile(r"^(\d+)\s*[x×*]\s*(\d+)$", re.I)


def _clean_values(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        value = str(item).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _axis(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"type": "none", "values": []}
    kind = str(raw.get("type") or "none").strip() or "none"
    if kind in DISABLED_TYPES:
        kind = "none"
    values = _clean_values(raw.get("values"))
    if kind == "none":
        values = []
    return {"type": kind, "values": values}


def xy_config(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    x = _axis(raw.get("x"))
    y = _axis(raw.get("y"))
    if not x["values"] and not y["values"]:
        return None
    if x["type"] == y["type"] and x["type"] not in SHARED_TYPES and x["type"] != "none":
        return None
    try:
        margin = max(0, min(256, int(raw.get("grid_margin", 0))))
    except (TypeError, ValueError):
        margin = 0
    return {
        "x": x,
        "y": y,
        "draw_legend": bool(raw.get("draw_legend", True)),
        "draw_type": bool(raw.get("draw_type", False)),
        "keep_minus_one": bool(raw.get("keep_minus_one", False)),
        "include_sub_images": bool(raw.get("include_sub_images", True)),
        "respect_instant_lora": bool(raw.get("respect_instant_lora", False)),
        "grid_margin": margin,
    }


def xy_axis_values(axis: dict[str, Any] | None) -> list[str]:
    if not axis or axis.get("type") in {None, "none", *DISABLED_TYPES}:
        return []
    values = axis.get("values")
    return list(values) if isinstance(values, list) else []


def xy_cell_count(config: dict[str, Any] | None) -> int:
    if not config:
        return 0
    x = xy_axis_values(config.get("x") if isinstance(config.get("x"), dict) else None)
    y = xy_axis_values(config.get("y") if isinstance(config.get("y"), dict) else None)
    if not x and not y:
        return 0
    return max(1, len(x)) * max(1, len(y))


def xy_shape(config: dict[str, Any]) -> tuple[int, int]:
    x = xy_axis_values(config.get("x") if isinstance(config.get("x"), dict) else None)
    y = xy_axis_values(config.get("y") if isinstance(config.get("y"), dict) else None)
    return max(1, len(x)), max(1, len(y))


def _legend_value(kind: str, raw: str) -> str:
    if kind in {"checkpoint", "vae", "text_encoder", "lora"}:
        return Path(raw).stem
    return raw


def xy_labels(config: dict[str, Any]) -> tuple[list[str], list[str]]:
    x = config.get("x") if isinstance(config.get("x"), dict) else {"type": "none", "values": []}
    y = config.get("y") if isinstance(config.get("y"), dict) else {"type": "none", "values": []}
    include_type = bool(config.get("draw_type", False))
    x_type = str(x.get("type") or "none")
    y_type = str(y.get("type") or "none")
    x_values = xy_axis_values(x)
    y_values = xy_axis_values(y)
    x_name = TYPE_LABELS.get(x_type, "")
    y_name = TYPE_LABELS.get(y_type, "")

    def label(kind: str, name: str, raw: str) -> str:
        value = _legend_value(kind, raw) if raw else raw
        if include_type and name and value:
            return f"{name}: {value}"
        return value

    return [label(x_type, x_name, item) for item in x_values], [label(y_type, y_name, item) for item in y_values]


def _snap(value: int) -> int:
    snapped = int(round(value / 8) * 8)
    return max(64, min(4096, snapped))


def _parse_size(raw: str) -> tuple[int, int] | None:
    match = _SIZE.match(raw.strip())
    if not match:
        return None
    return _snap(int(match.group(1))), _snap(int(match.group(2)))


def _parse_int(raw: str, lo: int, hi: int) -> int | None:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if value < lo or value > hi:
        return None
    return value


def _parse_float(raw: str, lo: float, hi: float) -> float | None:
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if not (lo <= value <= hi):
        return None
    return value


def _apply_sr(prompt: str, negative: str, chips: list[str], index: int) -> tuple[str, str]:
    if not chips:
        return prompt, negative
    search = chips[0]
    if search not in prompt and search not in negative:
        return prompt, negative
    replacement = chips[index] if 0 <= index < len(chips) else search
    return prompt.replace(search, replacement), negative.replace(search, replacement)


def _strength_text(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


def _append_chunk(text: str, chunk: str) -> str:
    extra = chunk.strip()
    if not extra:
        return text
    trimmed = text.rstrip(" \t,")
    if not trimmed:
        return extra
    if trimmed.endswith(","):
        return f"{trimmed} {extra}"
    return f"{trimmed}, {extra}"


def _lora_meta(path: str) -> dict[str, Any]:
    from features.models.scripts import model_meta
    from features.settings import service as settings

    info = model_meta.get_info("loras", path)
    auto = info.get("auto_apply")
    if not isinstance(auto, bool):
        auto = bool(settings.load().get("loraAutoApply", True))
    try:
        strength = float(info.get("strength") if info.get("strength") is not None else 1)
    except (TypeError, ValueError):
        strength = 1.0
    if not math.isfinite(strength):
        strength = 1.0
    return {
        "instant": auto,
        "strength": strength,
        "prompt": str(info.get("prompt") or ""),
        "negative_prompt": str(info.get("negative_prompt") or ""),
    }


def _append_lora(values: dict[str, Any], path: str, strength: float | None = 1.0) -> None:
    name = path.strip()
    if not name:
        return
    rows = values.get("auto_loras")
    if not isinstance(rows, list):
        rows = []
        values["auto_loras"] = rows
    key = name.replace("\\", "/").lower()
    for item in rows:
        if isinstance(item, dict):
            current = str(item.get("path") or item.get("lora") or "")
        else:
            current = str(item or "")
        if current.replace("\\", "/").lower() == key:
            return
    entry: dict[str, Any] = {"path": name}
    if strength is not None:
        entry["strength"] = strength
    rows.append(entry)


def _inject_lora_tag(values: dict[str, Any], path: str, meta: dict[str, Any]) -> None:
    stem = Path(path).stem
    if not stem:
        return
    strength = float(meta.get("strength") or 1)
    tag = f"<lora:{stem}:{_strength_text(strength)}>"
    prompt = str(values.get("prompt") or "")
    if not re.search(rf"<lora:{re.escape(stem)}(?::[^>]+)?>", prompt, re.I):
        prompt = _append_chunk(prompt, tag)
    prompt = _append_chunk(prompt, str(meta.get("prompt") or ""))
    values["prompt"] = prompt
    values["negative_prompt"] = _append_chunk(str(values.get("negative_prompt") or ""), str(meta.get("negative_prompt") or ""))


def _apply_lora(values: dict[str, Any], path: str, respect_instant: bool) -> None:
    if not respect_instant:
        _append_lora(values, path)
        return
    meta = _lora_meta(path)
    if meta["instant"]:
        _append_lora(values, path, None)
        return
    _inject_lora_tag(values, path, meta)


def _apply_axis(values: dict[str, Any], axis: dict[str, Any], index: int, respect_instant_lora: bool = False) -> None:
    kind = str(axis.get("type") or "none")
    chips = xy_axis_values(axis)
    if kind == "none" or not chips:
        return
    raw = chips[index] if 0 <= index < len(chips) else chips[0]
    if kind == "checkpoint":
        values["checkpoint"] = raw
        return
    if kind == "vae":
        values["vae"] = raw
        return
    if kind == "text_encoder":
        values["text_encoder"] = raw
        return
    if kind == "lora":
        _apply_lora(values, raw, respect_instant_lora)
        return
    if kind == "sampler":
        values["sampler"] = raw
        return
    if kind == "scheduler":
        values["scheduler"] = raw
        return
    if kind == "resolution":
        size = _parse_size(raw)
        if size:
            values["width"], values["height"] = size
        return
    if kind == "steps":
        steps = _parse_int(raw, 1, 150)
        if steps is not None:
            values["steps"] = steps
        return
    if kind == "cfg":
        cfg = _parse_float(raw, 1, 30)
        if cfg is not None:
            values["cfg"] = cfg
        return
    if kind == "seed":
        try:
            values["seed"] = int(str(raw).strip())
        except (TypeError, ValueError):
            pass
        return
    if kind == "prompt_sr":
        prompt, negative = _apply_sr(
            str(values.get("prompt") or ""),
            str(values.get("negative_prompt") or ""),
            chips,
            index,
        )
        values["prompt"] = prompt
        values["negative_prompt"] = negative


def xy_cells(config: dict[str, Any]) -> list[dict[str, int]]:
    x = xy_axis_values(config.get("x") if isinstance(config.get("x"), dict) else None)
    y = xy_axis_values(config.get("y") if isinstance(config.get("y"), dict) else None)
    xs = range(len(x)) if x else range(1)
    ys = range(len(y)) if y else range(1)
    return [{"x": x_i, "y": y_i} for y_i in ys for x_i in xs]


def xy_run_values(values: dict[str, Any], config: dict[str, Any], cell: dict[str, int]) -> dict[str, Any]:
    auto = values.get("auto_loras")
    run_values = {
        **values,
        "auto_loras": list(auto) if isinstance(auto, list) else [],
        "batch_size": 1,
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
    }
    y_axis = config.get("y") if isinstance(config.get("y"), dict) else {"type": "none", "values": []}
    x_axis = config.get("x") if isinstance(config.get("x"), dict) else {"type": "none", "values": []}
    respect_instant = bool(config.get("respect_instant_lora", False))
    _apply_axis(run_values, y_axis, cell["y"], respect_instant)
    _apply_axis(run_values, x_axis, cell["x"], respect_instant)
    try:
        seed = int(run_values.get("seed") or 0)
    except (TypeError, ValueError):
        seed = -1
    if seed < 0:
        run_values["seed"] = random.randint(0, 2**53 - 1)
    else:
        run_values["seed"] = seed
    return run_values
