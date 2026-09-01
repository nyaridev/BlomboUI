from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from infrastructure.comfy.client import workflow_file
from features.generate.scripts.workflow import rembg
from features.generate.scripts.workflow import upscale as image_upscale
from features.generate.scripts.workflow import caption
from features.generate.scripts.workflow.attention import clean_attention
from infrastructure.storage.repositories import templates as templates_repo

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
    "vae": str,
    "textEncoder": str,
    "clipType": str,
    "clipDevice": str,
    "width": int,
    "height": int,
    "steps": int,
    "clipSkip": int,
    "cfg": float,
    "seed": int,
    "seedAfter": str,
    "outputImagePath": str,
    "outputGridPath": str,
    "outputImageName": str,
    "outputGridName": str,
    "outputHiresPath": str,
    "outputHiresName": str,
    "outputPathEnabled": bool,
    "batchSize": int,
    "batchCount": int,
    "sampler": str,
    "scheduler": str,
    "resMode": str,
    "aspect": str,
    "megapixels": float,
}

_REMBG_APPLY = (
    "rembgEngine",
    "rembgModel",
    "rembgSensitivity",
    "rembgProcessRes",
    "rembgMaskBlur",
    "rembgMaskOffset",
    "rembgBackground",
    "rembgInvert",
    "rembgRefine",
    "rembgPreserve",
)
_UPSCALE_APPLY = (
    "upscaleEngine",
    "upscaleModel",
    "upscaleDitModel",
    "upscaleVaeModel",
    "upscaleSize",
    "upscaleMethod",
    "upscaleCrop",
    "upscaleResolution",
    "upscaleMaxResolution",
    "upscaleColor",
    "upscaleInputNoise",
    "upscaleLatentNoise",
    "upscaleSeed",
    "upscaleAdvanced",
)
_CAPTION_APPLY = (
    "captionEngine",
    "captionModel",
    "captionQuantization",
    "captionMegapixels",
    "captionBatch",
    "captionGuidance",
    "captionPrefix",
    "captionSuffix",
    "captionSaveImage",
    "captionOverride",
    "captionThreshold",
    "captionCharacterThreshold",
    "captionReplaceUnderscore",
    "captionTrailingComma",
    "captionExcludeTags",
    "captionMaxTokens",
    "captionKeepModelLoaded",
    "captionSeed",
)
_APPLY = (
    "prompt",
    "negativePrompt",
    "checkpoint",
    "vae",
    "textEncoder",
    "clipType",
    "clipDevice",
    "loras",
    "sampler",
    "scheduler",
    "steps",
    "clipSkip",
    "cfg",
    "seed",
    "outputPath",
    "resolution",
    "batchCount",
    "batchSize",
    "controlnet",
    "hires",
    "adetailer",
    "scripts",
    *_REMBG_APPLY,
    *_UPSCALE_APPLY,
    *_CAPTION_APPLY,
    "attention",
)

_SCRIPTS = ("", "xy-plot", "prompt-matrix")
_BLOBS = ("controlnet", "hires", "adetailer")


_CONTENT_APPLY = ("prompt", "negativePrompt", "checkpoint", "vae", "textEncoder", "loras")
_UTILITY_APPLY = _REMBG_APPLY + _UPSCALE_APPLY + _CAPTION_APPLY


def _all_apply() -> list[str]:
    return list(_APPLY)


def _plain_apply() -> list[str]:
    return [item for item in _APPLY if item not in _CONTENT_APPLY and item not in _UTILITY_APPLY]


def _clean_apply(raw: Any, fallback: list[str] | None = None) -> list[str]:
    if not isinstance(raw, list):
        return list(fallback) if fallback is not None else _all_apply()
    seen: list[str] = []
    for item in raw:
        ident = str(item)
        if ident in _APPLY and ident not in seen:
            seen.append(ident)
    return seen


def default_apply(workflow: str = "") -> list[str]:
    stem = Path(workflow).stem
    if not stem or not _SAFE_WORKFLOW.fullmatch(stem):
        return _plain_apply()
    path = workflow_file(stem)
    if path is None:
        return _plain_apply()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _plain_apply()
    if not isinstance(data, dict):
        return _plain_apply()
    return _clean_apply(data.get("apply"), _plain_apply())


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
            elif conv is bool:
                if not isinstance(value, bool):
                    continue
                out[key] = value
            elif conv is int:
                out[key] = int(value)
            else:
                out[key] = float(value)
        except (TypeError, ValueError):
            continue
    if out.get("resMode") not in (None, "raw", "scaler", "set"):
        out.pop("resMode", None)
    if out.get("seedAfter") not in (None, "randomize", "fixed", "increment", "decrement"):
        out.pop("seedAfter", None)
    script = raw.get("script")
    if script in _SCRIPTS:
        out["script"] = script
    for key in _BLOBS:
        blob = raw.get(key)
        if isinstance(blob, dict):
            packed = dict(blob)
            packed["enabled"] = bool(blob.get("enabled"))
            out[key] = packed
    for key in ("promptMatrix", "xyPlot"):
        blob = raw.get(key)
        if isinstance(blob, dict):
            out[key] = dict(blob)
    rembg_blob = raw.get("rembg")
    if isinstance(rembg_blob, dict):
        out["rembg"] = rembg.clean_rembg(rembg_blob)
    upscale_blob = raw.get("upscale") or raw.get("imageUpscale")
    if isinstance(upscale_blob, dict):
        cleaned = image_upscale.clean_upscale(upscale_blob)
        out["upscale"] = cleaned
        out["imageUpscale"] = cleaned
    caption_blob = raw.get("caption")
    if isinstance(caption_blob, dict):
        out["caption"] = caption.clean_caption(caption_blob)
    attention_blob = raw.get("attention")
    if isinstance(attention_blob, dict):
        packed = clean_attention(attention_blob)
        out["attention"] = {
            "enabled": packed["enabled"],
            "engine": packed["engine"],
            "sageAttention": packed["sageAttention"],
            "allowCompile": packed["allowCompile"],
        }
    order = raw.get("activeLoraOrder")
    if isinstance(order, list):
        seen: list[str] = []
        for item in order:
            ident = str(item or "").strip()
            if ident and ident not in seen:
                seen.append(ident)
        out["activeLoraOrder"] = seen
    strengths = raw.get("activeLoraStrengths")
    if isinstance(strengths, dict):
        packed: dict[str, float] = {}
        for name, value in strengths.items():
            key = str(name or "").strip()
            if not key:
                continue
            try:
                packed[key] = float(value)
            except (TypeError, ValueError):
                continue
        out["activeLoraStrengths"] = packed
    for skip_key in ("skippedLoras", "skippedWildcards"):
        skip = raw.get(skip_key)
        if isinstance(skip, list):
            seen_skip: list[str] = []
            for item in skip:
                ident = str(item or "").strip()
                if ident and ident not in seen_skip:
                    seen_skip.append(ident)
            out[skip_key] = seen_skip
    return out


def _parse_json(raw: Any, fallback: Any) -> Any:
    if raw is None or raw == "":
        return fallback
    if not isinstance(raw, str):
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _load(workflow: str) -> tuple[list[dict[str, Any]], list[str]]:
    ident = _workflow_id(workflow)
    _ensure_db()
    raw_state = templates_repo.get_apply_json(ident)
    apply = default_apply(ident)
    if raw_state is not None:
        apply = _clean_apply(_parse_json(raw_state, None), apply)

    items: list[dict[str, Any]] = []
    for row in templates_repo.list_rows(ident):
        item_id = str(row["id"])
        entry = {
            "id": item_id,
            "name": str(row["name"] or item_id),
            "params": _clean_params(_parse_json(row["params_json"], {})),
            "apply": _clean_apply(_parse_json(row["apply_json"], None), apply),
            "enabled": int(row["enabled"] or 0) != 0,
        }
        cleaned_icon = _clean_icon(_parse_json(row["icon_json"], None))
        if cleaned_icon:
            entry["icon"] = cleaned_icon
        items.append(entry)
    return items, apply


def _save(workflow: str, items: list[dict[str, Any]], apply: list[str]) -> None:
    ident = _workflow_id(workflow)
    _ensure_db()
    all_apply = _all_apply()
    apply_json = None if apply == default_apply(ident) else json.dumps(apply)
    packed = [
        (
            item["id"],
            item["name"],
            index,
            json.dumps(item["params"]),
            json.dumps(item["icon"]) if item.get("icon") else None,
            json.dumps(_clean_apply(item.get("apply"), all_apply)),
            1 if item.get("enabled", True) else 0,
        )
        for index, item in enumerate(items)
    ]
    templates_repo.replace_workflow(ident, packed, apply_json)


def _ensure_db() -> None:
    templates_repo.connect()


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


def _out(item: dict[str, Any], *, builtin: bool = False, apply: list[str] | None = None) -> dict[str, Any]:
    packed = {
        "id": item["id"],
        "name": item["name"],
        "builtin": builtin,
        "icon": _icon_of(item, builtin=builtin),
        "apply": list(apply if apply is not None else item.get("apply") or _all_apply()),
        "enabled": True if builtin else bool(item.get("enabled", True)),
    }
    if not builtin:
        packed["params"] = dict(item.get("params") or {})
    return packed


def list_templates(workflow: str) -> tuple[list[dict[str, Any]], list[str]]:
    stored, apply = _load(workflow)
    items = [_out({"id": DEFAULT_ID, "name": "Default"}, builtin=True, apply=apply)]
    for item in stored:
        items.append(_out(item))
    return items, apply


def set_apply(workflow: str, apply: Any) -> list[str]:
    items, _ = _load(workflow)
    next_apply = _clean_apply(apply, _all_apply())
    _save(workflow, items, next_apply)
    return next_apply


def create_template(workflow: str, name: str, params: Any) -> dict[str, Any]:
    ident = _name(name)
    items, apply = _load(workflow)
    if _taken(items, ident):
        raise TemplateError("exists", f'A template named "{ident}" already exists', status=409)
    item = {
        "id": ident,
        "name": ident,
        "params": _clean_params(params),
        "icon": dict(CUSTOM_ICON),
        "apply": default_apply(workflow),
        "enabled": True,
    }
    items.append(item)
    _save(workflow, items, apply)
    return _out(item)


def update_template(
    workflow: str,
    template_id: str,
    params: Any,
    name: str | None = None,
    icon: Any = None,
    apply: Any = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    ident = template_id.strip()
    if ident.lower() == DEFAULT_ID:
        raise TemplateError("builtin", "Default is built-in. Save a new template instead.")
    items, default_apply_list = _load(workflow)
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
        if apply is not None:
            next_item["apply"] = _clean_apply(apply, _all_apply())
        if enabled is not None:
            next_item["enabled"] = bool(enabled)
        items[index] = next_item
        _save(workflow, items, default_apply_list)
        return _out(next_item)
    raise TemplateError("not_found", "template not found", status=404)


def delete_template(workflow: str, template_id: str) -> None:
    ident = template_id.strip()
    if ident.lower() == DEFAULT_ID:
        raise TemplateError("builtin", "Default cannot be deleted")
    items, apply = _load(workflow)
    next_items = [item for item in items if item["id"].lower() != ident.lower()]
    if len(next_items) == len(items):
        raise TemplateError("not_found", "template not found", status=404)
    _save(workflow, next_items, apply)


def reorder_templates(workflow: str, ids: Any) -> tuple[list[dict[str, Any]], list[str]]:
    if not isinstance(ids, list):
        raise TemplateError("bad_order", "order must list every custom template")
    items, apply = _load(workflow)
    wanted = [str(item).strip() for item in ids]
    if any(not ident or ident.lower() == DEFAULT_ID for ident in wanted):
        raise TemplateError("bad_order", "order must list every custom template")
    if len(wanted) != len(items):
        raise TemplateError("bad_order", "order must list every custom template")
    by_id = {item["id"].lower(): item for item in items}
    if {ident.lower() for ident in wanted} != set(by_id):
        raise TemplateError("bad_order", "order must list every custom template")
    next_items = [by_id[ident.lower()] for ident in wanted]
    _save(workflow, next_items, apply)
    return list_templates(workflow)
