from __future__ import annotations

import json
import math
import random
from typing import Any

from features.settings import service as settings
from features.models.scripts import hashes
from features.models.scripts import loras as lora_tags

DEFAULTS = {
    "checkpoint": "",
    "width": 832,
    "height": 1216,
    "steps": 20,
    "cfg": 4.0,
    "seed": -1,
    "batch_size": 1,
    "batch_count": 1,
    "sampler": "euler",
    "scheduler": "sgm_uniform",
    "workflow": "sd15",
    "template": "default",
}

PREVIEW_EVERY = 4
PREVIEW_AFTER = 8
MAX_STORED_JOBS = 500
_SEED_AFTER = {"randomize", "fixed", "increment", "decrement"}


def _seed_after(values: dict[str, Any]) -> str:
    mode = str(values.get("seed_after") or "")
    return mode if mode in _SEED_AFTER else "increment"


def _batch_plan(values: dict[str, Any]) -> tuple[int, int]:
    count = max(1, int(values.get("batch_count") or 1))
    size = max(1, int(values.get("batch_size") or 1))
    if _seed_after(values) in {"randomize", "fixed"}:
        return count * size, 1
    return count, size


def _prompt_matrix_lines(raw: Any) -> list[str]:
    if isinstance(raw, str):
        values = raw.splitlines()
    elif isinstance(raw, list):
        values = raw
    else:
        return []
    lines: list[str] = []
    for value in values:
        line = str(value).strip().rstrip(",").strip()
        if line:
            lines.append(line)
    return lines


def _prompt_matrix_config(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    lines = _prompt_matrix_lines(raw.get("lines"))
    if not lines:
        return None
    mode = str(raw.get("mode") or "end").strip()
    if mode not in {"start", "end", "prompt_sr"}:
        mode = "end"
    target = str(raw.get("target") or "prompt").strip()
    if target not in {"prompt", "negative"}:
        target = "prompt"
    return {
        "lines": lines,
        "save_grid": bool(raw.get("save_grid", True)),
        "use_batch": bool(raw.get("use_batch", True)),
        "mode": mode,
        "target": target,
        "search": str(raw.get("search") or "").strip(),
    }


def _prompt_matrix_prompt(base: str, addition: str) -> str:
    base = base.strip().rstrip(",").strip()
    addition = addition.strip().rstrip(",").strip()
    if not base:
        return addition
    if not addition:
        return base
    return f"{base}, {addition}"


def _prompt_matrix_apply(values: dict[str, Any], line: str, matrix: dict[str, Any]) -> tuple[str, str]:
    prompt = str(values.get("prompt") or "")
    negative = str(values.get("negative_prompt") or "")
    mode = str(matrix.get("mode") or "end")
    if mode == "prompt_sr":
        search = str(matrix.get("search") or "")
        if search:
            if search in prompt:
                prompt = prompt.replace(search, line)
            if search in negative:
                negative = negative.replace(search, line)
        return prompt, negative
    target = str(matrix.get("target") or "prompt")
    field = prompt if target == "prompt" else negative
    next_text = _prompt_matrix_prompt(line, field) if mode == "start" else _prompt_matrix_prompt(field, line)
    if target == "negative":
        return prompt, next_text
    return next_text, negative


def _generation_plan(values: dict[str, Any]) -> tuple[list[str], int, int]:
    matrix = values.get("prompt_matrix")
    lines = _prompt_matrix_lines(matrix.get("lines")) if isinstance(matrix, dict) else []
    if lines:
        if bool(matrix.get("use_batch", True)):
            count, size = _batch_plan(values)
        else:
            count, size = 1, 1
        return lines, count, size
    count, size = _batch_plan(values)
    return [""], count, size


def _run_seed(mode: str, base: int, index: int) -> int:
    if mode == "randomize":
        return base if index == 0 else random.randint(0, 2**53 - 1)
    if mode == "fixed":
        return base
    if mode == "decrement":
        return base - index
    return base + index

def _attach_lora_hashes(values: dict[str, Any]) -> None:
    from features.models.scripts import models

    rows = values.get("loras")
    if not isinstance(rows, list):
        return
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("lora") or item.get("path") or "")
        path = models.model_file("loras", name)
        row = hashes.entry(path) if path else None
        item["hash"] = (row or {}).get("autov2") or ""


def _resolve_auto_loras(raw: Any) -> tuple[list[dict[str, Any]], list[str]]:
    from features.models.scripts import model_meta
    from features.models.scripts import models

    files = [str(item["path"]) for item in models.list_kind("loras")]
    config = settings.load()
    default_apply_at = str(config.get("loraApplyAt") or "start")
    if default_apply_at not in {"start", "end"}:
        default_apply_at = "start"
    if not isinstance(raw, list):
        return [], []
    found: list[dict[str, Any]] = []
    missing: list[str] = []
    seen: set[str] = set()
    for value in raw:
        requested_strength: float | None = None
        if isinstance(value, dict):
            name = str(value.get("path") or value.get("lora") or "").strip()
            try:
                strength = float(value.get("strength"))
                if math.isfinite(strength):
                    requested_strength = strength
            except (TypeError, ValueError):
                pass
        else:
            name = str(value or "").strip()
        if not name:
            continue
        path = lora_tags.resolve(name, files)
        if not path:
            if name not in missing:
                missing.append(name)
            continue
        key = path.replace("\\", "/").lower()
        if key in seen:
            continue
        seen.add(key)
        info = model_meta.get_info("loras", path)
        if requested_strength is None:
            raw_strength = info.get("strength", 1)
            try:
                strength = float(raw_strength if raw_strength is not None else 1)
            except (TypeError, ValueError):
                strength = 1.0
        else:
            strength = requested_strength
        found.append(
            {
                "lora": path,
                "strength": strength,
                "prompt": str(info.get("prompt") or ""),
                "negative_prompt": str(info.get("negative_prompt") or ""),
                "apply_at": info.get("apply_at")
                if info.get("apply_at") in {"start", "end"}
                else default_apply_at,
            }
        )
    return found, missing


def _apply_auto_loras(
    values: dict[str, Any], automatic: list[dict[str, Any]], missing: list[str] | None = None
) -> None:
    values["auto_loras_resolved"] = automatic
    values["auto_lora_missing"] = list(missing or [])
    values["prompt"] = lora_tags.inject_triggers(str(values.get("prompt") or ""), automatic, "prompt")
    values["negative_prompt"] = lora_tags.inject_triggers(
        str(values.get("negative_prompt") or ""), automatic, "negative_prompt"
    )
    lora_tags.apply(values, automatic)
    values["lora_missing"] = list(values.get("lora_missing") or [])
    for name in missing or []:
        if name not in values["lora_missing"]:
            values["lora_missing"].append(name)


def _normalize_auto_loras(raw: Any) -> list[str | dict[str, Any]]:
    auto_loras: list[str | dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, dict):
            name = str(item.get("path") or item.get("lora") or "").strip()
            if not name:
                continue
            key = name.replace("\\", "/").lower()
            if key in seen:
                continue
            seen.add(key)
            entry = dict(item)
            entry["path"] = name
            auto_loras.append(entry)
            continue
        name = str(item).strip()
        key = name.replace("\\", "/").lower()
        if name and key not in seen:
            seen.add(key)
            auto_loras.append(name)
    return auto_loras


def _public_loras(raw: Any) -> list[dict[str, Any]]:
    from features.models.scripts import models

    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, str):
            name, strength = item, 1.0
            digest = ""
        elif isinstance(item, dict):
            name = str(item.get("lora") or item.get("path") or "")
            try:
                raw_strength = item.get("strength", 1)
                strength = float(raw_strength if raw_strength is not None else 1)
            except (TypeError, ValueError):
                strength = 1.0
            digest = str(item.get("hash") or "")
        else:
            continue
        name = name.strip()
        if not name:
            continue
        if not digest:
            path = models.model_file("loras", name)
            row = hashes.entry(path) if path else None
            digest = (row or {}).get("autov2") or ""
        out.append({"path": name, "strength": strength, "hash": digest})
    return out
