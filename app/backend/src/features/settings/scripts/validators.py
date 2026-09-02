from __future__ import annotations

import re
from typing import Any

from features.settings.scripts.values import _CSV_NAME, _SAFE_NAME, _SAFE_PATH, _SIZE

def _lookup_scope_ids(raw: Any) -> list[str]:
    from features.models.scripts.thumbnail_scopes import GLOBAL_ID, ordered_ids

    if any(str(item).strip().lower() == GLOBAL_ID for item in raw):
        return [GLOBAL_ID]
    return ordered_ids(raw)


_LOOKUP_GROUPS = ("checkpoints", "loras", "wildcards", "other")
_LOOKUP_KIND_GROUPS = {
    "checkpoints": "checkpoints",
    "diffusion_models": "checkpoints",
    "loras": "loras",
    "wildcards": "wildcards",
    "vae": "other",
    "text_encoders": "other",
    "upscale_models": "other",
    "sams": "other",
    "ultralytics": "other",
    "controlnet": "other",
    "embeddings": "other",
    "other": "other",
}


def _lookup_kinds(raw: Any) -> list[str]:
    out: list[str] = []
    for item in raw:
        name = _LOOKUP_KIND_GROUPS.get(str(item))
        if name in _LOOKUP_GROUPS and name not in out:
            out.append(name)
    return out


def _lookup_models(raw: Any) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = str(item).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


_CIVITAI_SORTS = (
    "Highest Rated",
    "Most Downloaded",
    "Most Liked",
    "Most Discussed",
    "Most Collected",
    "Most Images",
    "Newest",
    "Oldest",
)
_CIVITAI_PERIODS = ("Day", "Week", "Month", "Year", "AllTime")
_CIVITAI_TAGS = ("", "character", "style", "concept", "clothing", "poses")
_CIVITAI_TYPES = (
    "Checkpoint",
    "TextualInversion",
    "Hypernetwork",
    "AestheticGradient",
    "LORA",
    "LoCon",
    "DoRA",
    "Controlnet",
    "Upscaler",
    "MotionModule",
    "VAE",
    "Poses",
    "Wildcards",
    "Workflows",
    "Other",
)
_CIVITAI_TRI = ("off", "include", "exclude")


def _civitai_names(raw: Any, allowed: tuple[str, ...] | None = None) -> list[str]:
    if not isinstance(raw, list):
        return []
    known = set(allowed) if allowed is not None else None
    out: list[str] = []
    for item in raw:
        name = str(item).strip()[:80]
        if not name or name in out:
            continue
        if known is not None and name not in known:
            continue
        out.append(name)
        if len(out) >= 40:
            break
    return out


def _civitai_browse(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(raw.get("query"), str):
        out["query"] = raw["query"][:200]
    if raw.get("sort") in _CIVITAI_SORTS:
        out["sort"] = raw["sort"]
    if raw.get("period") in _CIVITAI_PERIODS:
        out["period"] = raw["period"]
    if "types" in raw:
        out["types"] = _civitai_names(raw["types"], _CIVITAI_TYPES)
    if "baseModels" in raw:
        out["baseModels"] = _civitai_names(raw["baseModels"])
    if raw.get("tag") in _CIVITAI_TAGS:
        out["tag"] = raw["tag"]
    if isinstance(raw.get("nsfw"), bool):
        out["nsfw"] = raw["nsfw"]
    for key in ("earlyAccess", "supportsGeneration", "fromPlatform"):
        if raw.get(key) in _CIVITAI_TRI:
            out[key] = raw[key]
    try:
        out["limit"] = max(1, min(100, int(raw["limit"])))
    except (KeyError, TypeError, ValueError):
        pass
    return out


def _civitai_download(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("modelDirId", "wildcardDirId"):
        value = str(raw.get(key) or "").strip()[:80]
        if value and "/" not in value and "\\" not in value:
            out[key] = value
    for key in (
        "modelIntelligent",
        "modelSortBaseModel",
        "modelSortCategory",
        "modelSortCreator",
        "wildcardIntelligent",
        "wildcardUnpack",
        "updateModelInfo",
        "refreshModelsAfterDownload",
    ):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    if raw.get("modelNaming") in ("normal", "custom"):
        out["modelNaming"] = raw["modelNaming"]
    aliases = raw.get("authorAliases")
    if isinstance(aliases, dict):
        clean: dict[str, str] = {}
        used: set[str] = set()
        for raw_author, raw_alias in aliases.items():
            author = str(raw_author).strip()[:200]
            alias = str(raw_alias or "").strip()[:80]
            alias_key = alias.lower()
            if not author or not _SAFE_NAME.fullmatch(alias) or alias_key in used:
                continue
            used.add(alias_key)
            clean[author] = alias
        out["authorAliases"] = clean
    return out


_ICON_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _civitai_marks(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for name, item in raw.items():
        key = str(name).strip()[:80]
        if not key or not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()[:12]
        entry: dict[str, Any] = {"text": text}
        icon = item.get("icon")
        if isinstance(icon, dict):
            kind = icon.get("kind")
            ident = str(icon.get("id") or "").strip()
            if kind == "emoji" and ident and len(ident) <= 32:
                entry["icon"] = {"kind": "emoji", "id": ident}
            elif kind == "icon" and _ICON_ID.fullmatch(ident):
                entry["icon"] = {"kind": "icon", "id": ident, "color": "ink"}
        out[key] = entry
    return out


def _civitai_tabs(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            model_id = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        if model_id <= 0 or model_id in seen:
            continue
        seen.add(model_id)
        name = str(item.get("name") or "").strip()[:200] or f"Model {model_id}"
        tab = {"id": model_id, "name": name}
        for source, target in (("initialVersionId", "initialVersionId"), ("versionId", "versionId")):
            try:
                version_id = int(item.get(source))
            except (TypeError, ValueError):
                continue
            if version_id > 0:
                tab[target] = version_id
        out.append(tab)
    return out


def _civitai_tab_id(raw: Any, tabs: object) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        tab_id = int(raw)
    except (TypeError, ValueError):
        return None
    if isinstance(tabs, list):
        ids = {item.get("id") for item in tabs if isinstance(item, dict)}
        return tab_id if tab_id in ids else None
    return tab_id


def _gallery_types(raw: Any) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()[:80]
        if not name or not isinstance(value, list):
            continue
        types: list[str] = []
        seen: set[str] = set()
        for item in value:
            label = str(item).strip()
            if not label or label in seen:
                continue
            seen.add(label)
            types.append(label)
        out[name] = types
    return out


_GALLERY_MODE_KEYS = (
    "checkpoints",
    "loras",
    "wildcards",
    "other",
    "generate-upscale",
    "generate-detector",
    "generate-sam",
    "models-all",
    "models-checkpoints",
    "models-loras",
    "models-wildcards",
    "models-other",
    "template-checkpoints",
    "template-text-encoders",
    "template-vae",
    "template-loras",
    "template-wildcards",
    "gallery-search-checkpoints",
    "gallery-search-loras",
    "gallery-search-wildcards",
    "gallery-create-checkpoints",
    "gallery-create-loras",
    "gallery-create-wildcards",
)
def _gallery_mode_default(name: str) -> str:
    return "global" if name.startswith("models") else "local"
_GALLERY_LOCAL_KEYS = (
    "checkpoints",
    "loras",
    "wildcards",
    "other",
    "generate-upscale",
    "generate-detector",
    "generate-sam",
    "models",
    "models-all",
    "models-checkpoints",
    "models-loras",
    "models-wildcards",
    "models-other",
    "template",
    "template-checkpoints",
    "template-text-encoders",
    "template-vae",
    "template-loras",
    "template-wildcards",
    "gallery-search",
    "gallery-search-checkpoints",
    "gallery-search-loras",
    "gallery-search-wildcards",
    "gallery-create",
    "gallery-create-checkpoints",
    "gallery-create-loras",
    "gallery-create-wildcards",
)


def _gallery_mode_map(raw: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        if name not in _GALLERY_MODE_KEYS or value not in ("global", "local"):
            continue
        if value != _gallery_mode_default(name):
            out[name] = value
    return out


def _gallery_query(raw: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()[:80]
        if not name or not isinstance(value, str):
            continue
        text = value[:200]
        if text:
            out[name] = text
    return out


_GALLERY_BROWSE_KEYS = ("checkpoints", "loras", "wildcards", "tags", "global")
_GALLERY_BROWSE_SORTS = ("recent", "works")


def _gallery_browse_sort(raw: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        sort = str(value or "").strip().lower()
        if name not in _GALLERY_BROWSE_KEYS or sort not in _GALLERY_BROWSE_SORTS:
            continue
        default = "works" if name == "tags" else "recent"
        if sort == default:
            continue
        out[name] = sort
    return out


def _gallery_browse_dir(raw: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        direction = str(value or "").strip().lower()
        if name not in _GALLERY_BROWSE_KEYS or direction not in ("asc", "desc") or direction == "desc":
            continue
        out[name] = direction
    return out


def _gallery_pin_selected(raw: Any) -> dict[str, bool]:
    out: dict[str, bool] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        if (name != "global" and name not in _GALLERY_LOCAL_KEYS) or value is not False:
            continue
        out[name] = False
    return out


def _gallery_auto_types(raw: Any) -> dict[str, bool]:
    out: dict[str, bool] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        if (name != "global" and name not in _GALLERY_LOCAL_KEYS) or value is not True:
            continue
        out[name] = True
    return out


def _gallery_local_scopes(raw: Any) -> dict[str, dict[str, Any]]:
    from features.models.scripts.thumbnail_scopes import ordered_ids

    out: dict[str, dict[str, Any]] = {}
    if not isinstance(raw, dict):
        return out
    for key, item in raw.items():
        name = str(key).strip()
        if name not in _GALLERY_LOCAL_KEYS or not isinstance(item, dict):
            continue
        ids = ordered_ids(item.get("ids") or [])
        optional = ordered_ids(item.get("optionalIds") or [])
        pack = {
            "ids": ids,
            "optionalIds": optional,
            "auto": bool(item.get("auto")),
            "mode": "exact" if item.get("mode") == "exact" else "likely",
            "fallback": bool(item.get("fallback", True)),
        }
        if pack["ids"] or pack["optionalIds"] or pack["auto"] or pack["mode"] != "likely" or not pack["fallback"]:
            out[name] = pack
    return out


def _dir_list(raw: Any) -> list[dict[str, str]] | None:
    if not isinstance(raw, list):
        return None
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = str(item.get("id") or "").strip()[:80]
        name = str(item.get("name") or "").strip()[:40]
        path = str(item.get("path") or "").strip()[:500]
        if not ident or not name or ident in seen:
            continue
        if any(ch in name for ch in '/\\'):
            continue
        seen.add(ident)
        out.append({"id": ident, "name": name, "path": path})
    return out


def _lora_bound(raw: Any) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return round(min(20.0, max(-20.0, value)), 2)


def _autocomplete_lists(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, Any] = {}
    for key, item in raw.items():
        name = str(key).replace("\\", "/").rsplit("/", 1)[-1]
        if not _CSV_NAME.fullmatch(name) or not isinstance(item, dict):
            continue
        mode = item.get("mode")
        if mode not in ("exclude", "include"):
            mode = "exclude"
        types: list[str] = []
        raw_types = item.get("types")
        if isinstance(raw_types, list):
            for entry in raw_types:
                text = str(entry).strip()
                if text and text not in types:
                    types.append(text)
        enabled = bool(item["enabled"]) if "enabled" in item else True
        out[name] = {"enabled": enabled, "mode": mode, "types": types}
    return out


def _unique_names(raw: list[Any]) -> list[str]:
    out: list[str] = []
    for item in raw:
        name = str(item).strip()
        if name and name not in out:
            out.append(name)
    return out


def _set_resolutions(raw: list[Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        match = _SIZE.match(str(item).replace(" ", ""))
        if not match:
            continue
        width = _snap_dim(int(match.group(1)))
        height = _snap_dim(int(match.group(2)))
        if width < height:
            width, height = height, width
        key = f"{width}x{height}"
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _snap_dim(value: int) -> int:
    snapped = int(round(value / 8) * 8)
    return max(64, min(4096, snapped))


def _unique_allowed(raw: list[Any], allowed: tuple[str, ...]) -> list[str]:
    known = set(allowed)
    out: list[str] = []
    for item in raw:
        name = str(item)
        if name in known and name not in out:
            out.append(name)
    return out


def _order_list(raw: Any, allowed: tuple[str, ...]) -> list[str] | None:
    if not isinstance(raw, list):
        return None
    known = set(allowed)
    seen: list[str] = []
    for item in raw:
        name = str(item)
        if name in known and name not in seen:
            seen.append(name)
    for name in allowed:
        if name not in seen:
            seen.append(name)
    return seen


def _gallery_map(raw: Any, allowed: tuple[str, ...], default: str) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for key, item in raw.items():
        name = str(key).strip()[:80]
        if not name:
            continue
        value = str(item) if item is not None else default
        picked = value if value in allowed else default
        if picked != default:
            out[name] = picked
    return out


def _gallery_fallback(raw: Any) -> bool:
    return bool(raw) if isinstance(raw, bool) else True


def _path_template(raw: Any, default: str) -> str | None:
    if not isinstance(raw, str):
        return None
    text = raw.strip().replace("\\", "/").strip("/")
    if not text or text == default:
        return None
    if len(text) > 120:
        return None
    if any(part in {".", "..", ""} for part in text.split("/")):
        return None
    if not _SAFE_PATH.fullmatch(text):
        return None
    return text


def _name_template(raw: Any, default: str) -> str | None:
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    lower = text.lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if lower.endswith(ext):
            text = text[: -len(ext)]
            lower = text.lower()
            break
    if not text or text == default:
        return None
    if len(text) > 80:
        return None
    if "/" in text or "\\" in text:
        return None
    if not _SAFE_NAME.fullmatch(text):
        return None
    return text
