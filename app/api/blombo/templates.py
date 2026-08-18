from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from blombo.paths import USER

DEFAULT_ID = "default"
_SAFE_WORKFLOW = re.compile(r"^[A-Za-z0-9._-]+$")
_BAD_NAME = re.compile(r'[/\\:*?"<>|\0]')

_KEYS = {
    "prompt": str,
    "negativePrompt": str,
    "checkpoint": str,
    "width": int,
    "height": int,
    "steps": int,
    "cfg": float,
    "seed": int,
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
    "resolution",
    "batchCount",
    "batchSize",
)
_APPLY_OFF = {"prompt", "resolution", "batchCount", "batchSize"}


def default_apply() -> list[str]:
    return [key for key in _APPLY if key not in _APPLY_OFF]


def _clean_apply(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return default_apply()
    seen: list[str] = []
    for item in raw:
        ident = str(item)
        if ident in _APPLY and ident not in seen:
            seen.append(ident)
    return seen


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
    return out


def _load(workflow: str) -> tuple[list[dict[str, Any]], list[str]]:
    path = _file(workflow)
    if not path.is_file():
        return [], default_apply()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [], default_apply()
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
                migrated = _clean_apply(item.get("apply"))
            items.append({"id": ident, "name": name or ident, "params": _clean_params(item.get("params"))})
    if isinstance(data, dict) and "apply" in data:
        apply = _clean_apply(data.get("apply"))
    else:
        apply = migrated if migrated is not None else default_apply()
    return items, apply


def _save(workflow: str, items: list[dict[str, Any]], apply: list[str]) -> None:
    path = _file(workflow)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    payload = {"apply": apply, "templates": items}
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
    items = [{"id": DEFAULT_ID, "name": "Default", "builtin": True}]
    for item in stored:
        items.append({**item, "builtin": False})
    return items, apply


def set_apply(workflow: str, apply: Any) -> list[str]:
    items, _ = _load(workflow)
    next_apply = _clean_apply(apply)
    _save(workflow, items, next_apply)
    return next_apply


def create_template(workflow: str, name: str, params: Any) -> dict[str, Any]:
    ident = _name(name)
    items, apply = _load(workflow)
    if _taken(items, ident):
        raise TemplateError("exists", f'A template named "{ident}" already exists', status=409)
    item = {"id": ident, "name": ident, "params": _clean_params(params)}
    items.append(item)
    _save(workflow, items, apply)
    return {**item, "builtin": False}


def update_template(workflow: str, template_id: str, params: Any, name: str | None = None) -> dict[str, Any]:
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
        items[index] = next_item
        _save(workflow, items, apply)
        return {**next_item, "builtin": False}
    raise TemplateError("not_found", "template not found", status=404)
