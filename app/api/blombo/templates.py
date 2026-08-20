from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from blombo.paths import USER, WORKFLOWS

DEFAULT_ID = "default"
_SAFE_WORKFLOW = re.compile(r"^[A-Za-z0-9._-]+$")
_BAD_NAME = re.compile(r'[/\\:*?"<>|\0]')
_ICON_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ICON_COLORS = (
    "ink",
    "muted",
    "accent",
    "red",
    "orange",
    "yellow",
    "green",
    "cyan",
    "blue",
    "purple",
    "pink",
)
BUILTIN_ICON = {"kind": "icon", "id": "layout-template", "color": "accent"}
CUSTOM_ICON = {"kind": "icon", "id": "bookmark", "color": "ink"}

_KEYS = {
    "prompt": str,
    "negativePrompt": str,
    "checkpoint": str,
    "width": int,
    "height": int,
    "steps": int,
    "cfg": float,
    "seed": int,
    "seedAfter": str,
    "outputImagePath": str,
    "outputGridPath": str,
    "outputImageName": str,
    "outputGridName": str,
    "batchSize": int,
    "batchCount": int,
    "sampler": str,
    "scheduler": str,
    "resMode": str,
    "aspect": str,
    "megapixels": float,
}

_APPLY = (
    "prompt",
    "negativePrompt",
    "checkpoint",
    "sampler",
    "scheduler",
    "steps",
    "cfg",
    "seed",
    "outputPath",
    "resolution",
    "batchCount",
    "batchSize",
)
_APPLY_OFF = {"prompt", "resolution", "batchCount", "batchSize"}


def _fallback_apply() -> list[str]:
    return [key for key in _APPLY if key not in _APPLY_OFF]


def _clean_apply(raw: Any, fallback: list[str] | None = None) -> list[str]:
    if not isinstance(raw, list):
        return list(fallback) if fallback is not None else _fallback_apply()
    seen: list[str] = []
    for item in raw:
        ident = str(item)
        if ident in _APPLY and ident not in seen:
            seen.append(ident)
    return seen


def default_apply(workflow: str) -> list[str]:
    path = WORKFLOWS / f"{_workflow_id(workflow)}.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        if isinstance(data, dict) and "apply" in data:
            return _clean_apply(data.get("apply"), _fallback_apply())
    return _fallback_apply()


class TemplateError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def _workflow_id(name: str) -> str:
    stem = Path(name).stem
    if not stem or not _SAFE_WORKFLOW.fullmatch(stem):
        raise TemplateError("bad_workflow", "invalid workflow id", status=400)
    return stem


def _file(workflow: str) -> Path:
    return USER / "workflow_templates" / f"{_workflow_id(workflow)}.json"


def _clean_icon(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "").strip()
    ident = str(raw.get("id") or "").strip()
    if kind == "emoji":
        if not ident or len(ident) > 32:
            return None
        return {"kind": "emoji", "id": ident}
    if kind == "icon" and _ICON_ID.fullmatch(ident):
        color = str(raw.get("color") or "ink")
        if color not in _ICON_COLORS:
            color = "ink"
        return {"kind": "icon", "id": ident, "color": color}
    return None


def _icon_of(item: dict[str, Any], *, builtin: bool = False) -> dict[str, Any]:
    if builtin:
        return dict(BUILTIN_ICON)
    return _clean_icon(item.get("icon")) or dict(CUSTOM_ICON)


def _clean_params(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, conv in _KEYS.items():
        if key not in raw:
            continue
        try:
            value = raw[key]
            if conv is str:
                out[key] = str(value)
            elif conv is int:
                out[key] = int(value)
            else:
                out[key] = float(value)
        except (TypeError, ValueError):
            continue
    if out.get("resMode") not in (None, "raw", "scaler"):
        out.pop("resMode", None)
    if out.get("seedAfter") not in (None, "randomize", "fixed", "increment", "decrement"):
        out.pop("seedAfter", None)
    return out


def _load(workflow: str) -> tuple[list[dict[str, Any]], list[str]]:
    defaults = default_apply(workflow)
    path = _file(workflow)
    if not path.is_file():
        return [], defaults
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], defaults
    raw_items = data.get("templates") if isinstance(data, dict) else None
    items: list[dict[str, Any]] = []
    migrated: list[str] | None = None
    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            ident = str(item.get("id") or "").strip()
            name = str(item.get("name") or ident).strip()
            if not ident or ident.lower() == DEFAULT_ID:
                continue
            if migrated is None and "apply" in item:
                migrated = _clean_apply(item.get("apply"), defaults)
            entry = {"id": ident, "name": name or ident, "params": _clean_params(item.get("params"))}
            icon = _clean_icon(item.get("icon"))
            if icon:
                entry["icon"] = icon
            items.append(entry)
    if isinstance(data, dict) and "apply" in data:
        apply = _clean_apply(data.get("apply"), defaults)
    else:
        apply = migrated if migrated is not None else defaults
    return items, apply


def _save(workflow: str, items: list[dict[str, Any]], apply: list[str]) -> None:
    path = _file(workflow)
    payload: dict[str, Any] = {}
    if apply != default_apply(workflow):
        payload["apply"] = apply
    if items:
        payload["templates"] = items
    if not payload:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _name(raw: str) -> str:
    name = raw.strip()
    if not name or len(name) > 80:
        raise TemplateError("bad_name", "enter a template name")
    if _BAD_NAME.search(name) or name in {".", ".."}:
        raise TemplateError("bad_name", "that name is not allowed")
    if name.lower() == DEFAULT_ID:
        raise TemplateError("bad_name", "Default is reserved")
    return name


def _taken(items: list[dict[str, Any]], name: str, skip: str | None = None) -> bool:
    needle = name.lower()
    for item in items:
        if skip and item["id"].lower() == skip.lower():
            continue
        if item["id"].lower() == needle or item["name"].lower() == needle:
            return True
    return False


def list_templates(workflow: str) -> tuple[list[dict[str, Any]], list[str]]:
    stored, apply = _load(workflow)
    items = [{"id": DEFAULT_ID, "name": "Default", "builtin": True, "icon": dict(BUILTIN_ICON)}]
    for item in stored:
        items.append({**item, "builtin": False, "icon": _icon_of(item)})
    return items, apply


def set_apply(workflow: str, apply: Any) -> list[str]:
    items, _ = _load(workflow)
    next_apply = _clean_apply(apply, default_apply(workflow))
    _save(workflow, items, next_apply)
    return next_apply


def create_template(workflow: str, name: str, params: Any) -> dict[str, Any]:
    ident = _name(name)
    items, apply = _load(workflow)
    if _taken(items, ident):
        raise TemplateError("exists", f'A template named "{ident}" already exists', status=409)
    item = {"id": ident, "name": ident, "params": _clean_params(params), "icon": dict(CUSTOM_ICON)}
    items.append(item)
    _save(workflow, items, apply)
    return {**item, "builtin": False}


def update_template(
    workflow: str,
    template_id: str,
    params: Any,
    name: str | None = None,
    icon: Any = None,
) -> dict[str, Any]:
    ident = template_id.strip()
    if ident.lower() == DEFAULT_ID:
        raise TemplateError("builtin", "Default is built-in. Save a new template instead.")
    items, apply = _load(workflow)
    for index, item in enumerate(items):
        if item["id"].lower() != ident.lower():
            continue
        next_item = {**item}
        if params is not None:
            next_item["params"] = _clean_params(params)
        if name is not None:
            label = _name(name)
            if _taken(items, label, skip=item["id"]):
                raise TemplateError("exists", f'A template named "{label}" already exists', status=409)
            next_item["name"] = label
        if icon is not None:
            cleaned = _clean_icon(icon)
            if cleaned:
                next_item["icon"] = cleaned
        items[index] = next_item
        _save(workflow, items, apply)
        return {**next_item, "builtin": False, "icon": _icon_of(next_item)}
    raise TemplateError("not_found", "template not found", status=404)
