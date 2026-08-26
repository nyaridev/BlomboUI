from __future__ import annotations

from pathlib import Path
from typing import Any

from features.generate.scripts import save_meta
from features.models.scripts import thumbnail_scopes
from features.wildcards.scripts import wildcards as wildcard_tags

VIDEO_EXTS = {".mp4", ".webm"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS


def media_kind(path: Path) -> str:
    return "video" if path.suffix.lower() in VIDEO_EXTS else "image"


def _names(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        name = str(raw or "").replace("\\", "/").strip().strip("/")
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def checkpoint_name(params: dict[str, Any]) -> str:
    for item in params.get("models") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "")
        if kind not in {"checkpoints", "diffusion_models", "checkpoint"}:
            continue
        lookup = "diffusion_models" if kind == "diffusion_models" else "checkpoints"
        return save_meta.rel_for_hashes(lookup, item.get("hashes"))
    return ""


def lora_names(params: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for item in params.get("models") or []:
        if not isinstance(item, dict) or item.get("kind") != "loras":
            continue
        found.append(save_meta.rel_for_hashes("loras", item.get("hashes")))
    return _names(found)


def wildcard_names(params: dict[str, Any], prompt: str) -> list[str]:
    found: list[str] = []
    for blob in (str(params.get("prompt_raw") or ""), str(params.get("negative_prompt_raw") or "")):
        for match in wildcard_tags.TAG.finditer(blob):
            found.append(match.group(1).replace("\\", "/").strip("/"))
    return _names(found)


def links(params: dict[str, Any], prompt: str) -> dict[str, list[str]]:
    return {
        "tags": thumbnail_scopes.parse_tags(prompt),
        "loras": lora_names(params),
        "wildcards": wildcard_names(params, prompt),
    }
