from __future__ import annotations

import re
from typing import Any

TAG = re.compile(r"<lora:([^:>]+)(?::(-?\d+(?:\.\d+)?))?>", re.I)
TAG_AND_AFTER = re.compile(r"<lora:[^>]+>[,\s]*", re.I)


def strip_tags(text: str) -> str:
    cleaned = TAG_AND_AFTER.sub("", text)
    cleaned = re.sub(r",\s*,+", ",", cleaned)
    return cleaned.strip(" \t,")


def apply(values: dict[str, Any]) -> None:
    prompt = str(values.get("prompt") or "")
    files = _lora_files()
    found: list[dict[str, Any]] = []
    missing: list[str] = []
    seen: set[str] = set()
    for match in TAG.finditer(prompt):
        name = match.group(1).strip()
        strength = float(match.group(2)) if match.group(2) else 1.0
        path = resolve(name, files)
        if not path:
            if name not in missing:
                missing.append(name)
            continue
        key = path.replace("\\", "/").lower()
        if key in seen:
            continue
        seen.add(key)
        found.append({"lora": path, "strength": strength})
    values["loras"] = found
    values["lora_missing"] = missing


def resolve(name: str, files: list[str]) -> str | None:
    want = _norm(name)
    if not want:
        return None
    want_stem = _stem(want)
    stem_hit: str | None = None
    for path in files:
        n = _norm(path)
        file_name = n.rsplit("/", 1)[-1]
        no_ext = n[: -len(file_name)] + _stem(file_name) if file_name else n
        if n == want or file_name == want or no_ext == want:
            return path
        if stem_hit is None and _stem(file_name) == want_stem:
            stem_hit = path
    return stem_hit


def _lora_files() -> list[str]:
    from blombo import models

    return [str(item["path"]) for item in models.list_kind("loras")]


def _norm(value: str) -> str:
    return value.replace("\\", "/").strip().lower()


def _stem(path: str) -> str:
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name
