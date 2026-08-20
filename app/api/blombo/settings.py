from __future__ import annotations

import json
import re
from typing import Any

from blombo.paths import USER, USER_DATA

FILE = USER_DATA / "user_settings.json"
LEGACY = USER / "user_settings.json"
IMAGE_PATH_DEFAULT = "[workflow]/images/[date]"
GRID_PATH_DEFAULT = "[workflow]/grids/[date]"
INTERRUPTED_PATH_DEFAULT = "[workflow]/interrupted/[date]"
IMAGE_NAME_DEFAULT = "blombo_[number]"
GRID_NAME_DEFAULT = "blombo_[number]"
_SAFE_PATH = re.compile(r"^[A-Za-z0-9._\[\]/-]+$")
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._\[\]-]+$")
_CSV_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$")
_SIZE = re.compile(r"^(\d+)[x×*](\d+)$", re.I)
_GALLERY_SORTS = ("name", "added", "edited", "path")
_GALLERY_DIRS = ("asc", "desc")
_GALLERY_VIEWS = ("checkpoints", "loras", "wildcards")
_ORDERABLE_MAIN_TABS = ("Generate", "File Info", "Gallery", "Models", "Wildcard Manager", "Scopes")
_HIDEABLE_MAIN_TABS = ("Generate", "File Info", "Gallery", "Models", "Wildcard Manager", "Scopes", "Errors")
_GENERATE_TABS = ("Generation", "Base Model", "Lora", "Wildcards")
_IMAGE_FORMATS = ("png", "jpg", "webp")
_KEYS = (
    "batchGrid",
    "batchGridMax",
    "batchGridQuality",
    "batchGridRows",
    "batchGridFill",
    "batchGridOnCancel",
    "saveInterrupted",
    "interruptedInGrid",
    "galleryHideInterrupted",
    "hiddenGenerateTabs",
    "hiddenMainTabs",
    "mainTabOrder",
    "generateTabOrder",
    "mainTabKeysFollowLayout",
    "generateTabKeysFollowLayout",
    "hiddenModelTypes",
    "hiddenSamplers",
    "hiddenSchedulers",
    "theme",
    "civitaiSite",
    "timeDisplay",
    "setResolutions",
    "imagePath",
    "imageName",
    "gridPath",
    "gridName",
    "interruptedPath",
    "imageFormat",
    "imageQuality",
    "saveLargeAsJpeg",
    "largeJpegMaxKb",
    "gallerySortKey",
    "gallerySortDir",
    "galleryTileScale",
    "galleryParentOnUnselect",
    "promptWeightStep",
    "loraStrengthMin",
    "loraStrengthMax",
    "loraSliderMin",
    "loraSliderMax",
    "modelDirs",
    "wildcardDirs",
    "galleryDirs",
    "forceDownloadModelsLocal",
    "forceDownloadWildcardsLocal",
    "removedAfterHours",
    "removedMaxGb",
    "autocompleteEnabled",
    "autocompleteMode",
    "autocompleteTypes",
    "wildcardCompleteEnabled",
    "loraCompleteEnabled",
    "loraTriggerCompleteEnabled",
    "wildcardCompleteThumbs",
    "loraCompleteThumbs",
    "autocompleteThumbScale",
    "frequentTagsEnabled",
    "autocompleteLists",
    "galleryThumbFallback",
    "thumbSaveTo",
    "thumbDisplayMode",
    "thumbScopeIds",
    "thumbScopeAuto",
    "trashThumbFallback",
)


def _clean(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    if "batchGrid" in raw:
        out["batchGrid"] = bool(raw["batchGrid"])
    if "batchGridMax" in raw:
        try:
            out["batchGridMax"] = max(2, min(100, int(raw["batchGridMax"])))
        except (TypeError, ValueError):
            pass
    if "batchGridQuality" in raw:
        try:
            out["batchGridQuality"] = max(40, min(95, int(raw["batchGridQuality"])))
        except (TypeError, ValueError):
            pass
    if "batchGridRows" in raw:
        try:
            out["batchGridRows"] = max(0, min(25, int(raw["batchGridRows"])))
        except (TypeError, ValueError):
            pass
    if "batchGridFill" in raw:
        out["batchGridFill"] = bool(raw["batchGridFill"])
    if "batchGridOnCancel" in raw:
        out["batchGridOnCancel"] = bool(raw["batchGridOnCancel"])
    if "saveInterrupted" in raw:
        out["saveInterrupted"] = bool(raw["saveInterrupted"])
    if "interruptedInGrid" in raw:
        out["interruptedInGrid"] = bool(raw["interruptedInGrid"])
    if "galleryHideInterrupted" in raw:
        out["galleryHideInterrupted"] = bool(raw["galleryHideInterrupted"])
    if "hiddenGenerateTabs" in raw and isinstance(raw["hiddenGenerateTabs"], list):
        tabs: list[str] = []
        for item in raw["hiddenGenerateTabs"]:
            name = "Base Model" if item == "Checkpoints" else str(item)
            if name and name != "Generation" and name not in tabs:
                tabs.append(name)
        out["hiddenGenerateTabs"] = tabs
    if "hiddenMainTabs" in raw and isinstance(raw["hiddenMainTabs"], list):
        out["hiddenMainTabs"] = _unique_allowed(raw["hiddenMainTabs"], _HIDEABLE_MAIN_TABS)
    if "mainTabOrder" in raw:
        ordered = _order_list(raw["mainTabOrder"], _ORDERABLE_MAIN_TABS)
        if ordered:
            out["mainTabOrder"] = ordered
    if "generateTabOrder" in raw:
        ordered = _order_list(raw["generateTabOrder"], _GENERATE_TABS, rename={"Checkpoints": "Base Model"})
        if ordered:
            out["generateTabOrder"] = ordered
    if "mainTabKeysFollowLayout" in raw:
        out["mainTabKeysFollowLayout"] = bool(raw["mainTabKeysFollowLayout"])
    if "generateTabKeysFollowLayout" in raw:
        out["generateTabKeysFollowLayout"] = bool(raw["generateTabKeysFollowLayout"])
    if "hiddenModelTypes" in raw and isinstance(raw["hiddenModelTypes"], list):
        types: list[str] = []
        for item in raw["hiddenModelTypes"]:
            name = str(item)
            if name and name not in types:
                types.append(name)
        out["hiddenModelTypes"] = types
    if "hiddenSamplers" in raw and isinstance(raw["hiddenSamplers"], list):
        out["hiddenSamplers"] = _unique_names(raw["hiddenSamplers"])
    if "hiddenSchedulers" in raw and isinstance(raw["hiddenSchedulers"], list):
        out["hiddenSchedulers"] = _unique_names(raw["hiddenSchedulers"])
    if "theme" in raw:
        name = str(raw["theme"])
        if name == "default":
            name = "slate"
        if name in ("darker", "slate", "midnight", "ember", "moss", "light"):
            out["theme"] = name
    if "civitaiSite" in raw:
        name = str(raw["civitaiSite"])
        if name in ("red", "civitai"):
            out["civitaiSite"] = name
    if "timeDisplay" in raw:
        name = str(raw["timeDisplay"])
        if name in ("full", "ampm"):
            out["timeDisplay"] = name
    if "setResolutions" in raw and isinstance(raw["setResolutions"], list):
        sizes = _set_resolutions(raw["setResolutions"])
        if sizes is not None:
            out["setResolutions"] = sizes
    image_path = _path_template(raw.get("imagePath"), IMAGE_PATH_DEFAULT) if "imagePath" in raw else None
    if image_path:
        out["imagePath"] = image_path
    image_name = _name_template(raw.get("imageName"), IMAGE_NAME_DEFAULT) if "imageName" in raw else None
    if image_name:
        out["imageName"] = image_name
    grid_path = _path_template(raw.get("gridPath"), GRID_PATH_DEFAULT) if "gridPath" in raw else None
    if grid_path:
        out["gridPath"] = grid_path
    grid_name = _name_template(raw.get("gridName"), GRID_NAME_DEFAULT) if "gridName" in raw else None
    if grid_name:
        out["gridName"] = grid_name
    interrupted_path = (
        _path_template(raw.get("interruptedPath"), INTERRUPTED_PATH_DEFAULT) if "interruptedPath" in raw else None
    )
    if interrupted_path:
        out["interruptedPath"] = interrupted_path
    if "imageFormat" in raw:
        name = str(raw["imageFormat"]).lower()
        if name == "jpeg":
            name = "jpg"
        if name in _IMAGE_FORMATS:
            out["imageFormat"] = name
    if "imageQuality" in raw:
        try:
            out["imageQuality"] = max(1, min(100, int(raw["imageQuality"])))
        except (TypeError, ValueError):
            pass
    if "saveLargeAsJpeg" in raw:
        out["saveLargeAsJpeg"] = bool(raw["saveLargeAsJpeg"])
    if "largeJpegMaxKb" in raw:
        try:
            out["largeJpegMaxKb"] = max(256, min(65536, int(raw["largeJpegMaxKb"])))
        except (TypeError, ValueError):
            pass
    if "gallerySortKey" in raw:
        mapped = _gallery_map(raw["gallerySortKey"], _GALLERY_SORTS, "name")
        if mapped:
            out["gallerySortKey"] = mapped
    if "gallerySortDir" in raw:
        mapped = _gallery_map(raw["gallerySortDir"], _GALLERY_DIRS, "asc")
        if mapped:
            out["gallerySortDir"] = mapped
    if "galleryTileScale" in raw:
        try:
            out["galleryTileScale"] = round(min(2.0, max(0.5, float(raw["galleryTileScale"]))), 1)
        except (TypeError, ValueError):
            pass
    if "galleryParentOnUnselect" in raw:
        out["galleryParentOnUnselect"] = bool(raw["galleryParentOnUnselect"])
    if "promptWeightStep" in raw:
        try:
            step = float(raw["promptWeightStep"])
        except (TypeError, ValueError):
            pass
        else:
            if step == step and step not in (float("inf"), float("-inf")):
                out["promptWeightStep"] = round(min(1.0, max(0.01, step)), 2)
    for key in ("loraStrengthMin", "loraStrengthMax", "loraSliderMin", "loraSliderMax"):
        if key not in raw:
            continue
        bound = _lora_bound(raw[key])
        if bound is not None:
            out[key] = bound
    for key in ("modelDirs", "wildcardDirs", "galleryDirs"):
        if key in raw:
            rows = _dir_list(raw[key])
            if rows is not None:
                out[key] = rows
    if "forceDownloadModelsLocal" in raw:
        out["forceDownloadModelsLocal"] = bool(raw["forceDownloadModelsLocal"])
    if "forceDownloadWildcardsLocal" in raw:
        out["forceDownloadWildcardsLocal"] = bool(raw["forceDownloadWildcardsLocal"])
    if "removedAfterHours" in raw:
        try:
            out["removedAfterHours"] = max(1, min(8760, int(raw["removedAfterHours"])))
        except (TypeError, ValueError):
            pass
    if "removedMaxGb" in raw:
        try:
            out["removedMaxGb"] = max(1, min(10000, int(raw["removedMaxGb"])))
        except (TypeError, ValueError):
            pass
    if "autocompleteEnabled" in raw:
        out["autocompleteEnabled"] = bool(raw["autocompleteEnabled"])
    if "autocompleteMode" in raw:
        mode = str(raw["autocompleteMode"])
        out["autocompleteMode"] = mode if mode in ("exclude", "include") else "exclude"
    if "autocompleteTypes" in raw and isinstance(raw["autocompleteTypes"], list):
        out["autocompleteTypes"] = _unique_names(raw["autocompleteTypes"])
    if "wildcardCompleteEnabled" in raw:
        out["wildcardCompleteEnabled"] = bool(raw["wildcardCompleteEnabled"])
    if "loraCompleteEnabled" in raw:
        out["loraCompleteEnabled"] = bool(raw["loraCompleteEnabled"])
    if "loraTriggerCompleteEnabled" in raw:
        out["loraTriggerCompleteEnabled"] = bool(raw["loraTriggerCompleteEnabled"])
    if "wildcardCompleteThumbs" in raw:
        out["wildcardCompleteThumbs"] = bool(raw["wildcardCompleteThumbs"])
    if "loraCompleteThumbs" in raw:
        out["loraCompleteThumbs"] = bool(raw["loraCompleteThumbs"])
    if "autocompleteThumbScale" in raw:
        try:
            out["autocompleteThumbScale"] = round(min(2.0, max(0.5, float(raw["autocompleteThumbScale"]))), 1)
        except (TypeError, ValueError):
            pass
    if "frequentTagsEnabled" in raw:
        out["frequentTagsEnabled"] = bool(raw["frequentTagsEnabled"])
    if "autocompleteLists" in raw:
        lists = _autocomplete_lists(raw["autocompleteLists"])
        if lists is not None:
            out["autocompleteLists"] = lists
    if "galleryThumbFallback" in raw:
        mapped = _bool_gallery_map(raw["galleryThumbFallback"], False)
        if mapped:
            out["galleryThumbFallback"] = mapped
    if "thumbSaveTo" in raw:
        name = str(raw["thumbSaveTo"])
        out["thumbSaveTo"] = name if name in ("active", "global") else "global"
    if "thumbDisplayMode" in raw:
        name = str(raw["thumbDisplayMode"])
        out["thumbDisplayMode"] = name if name in ("likely", "exact") else "likely"
    if "thumbScopeIds" in raw and isinstance(raw["thumbScopeIds"], list):
        from blombo.thumbnail_scopes import context_key, parse_context

        out["thumbScopeIds"] = [item for item in parse_context(context_key(raw["thumbScopeIds"])) if item != "global"]
    if "thumbScopeAuto" in raw:
        out["thumbScopeAuto"] = bool(raw["thumbScopeAuto"])
    if "trashThumbFallback" in raw:
        out["trashThumbFallback"] = bool(raw["trashThumbFallback"])
    return {key: out[key] for key in _KEYS if key in out}


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


def _order_list(raw: Any, allowed: tuple[str, ...], rename: dict[str, str] | None = None) -> list[str] | None:
    if not isinstance(raw, list):
        return None
    aliases = rename or {}
    known = set(allowed)
    seen: list[str] = []
    for item in raw:
        name = aliases.get(str(item), str(item))
        if name in known and name not in seen:
            seen.append(name)
    for name in allowed:
        if name not in seen:
            seen.append(name)
    return seen


def _gallery_map(raw: Any, allowed: tuple[str, ...], default: str) -> dict[str, str] | None:
    if isinstance(raw, str):
        value = raw if raw in allowed else default
        return {kind: value for kind in _GALLERY_VIEWS}
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for kind in _GALLERY_VIEWS:
        name = str(raw[kind]) if kind in raw else default
        out[kind] = name if name in allowed else default
    return out


def _bool_gallery_map(raw: Any, default: bool) -> dict[str, bool] | None:
    if isinstance(raw, bool):
        return {kind: raw for kind in _GALLERY_VIEWS}
    if not isinstance(raw, dict):
        return None
    return {kind: bool(raw[kind]) if kind in raw else default for kind in _GALLERY_VIEWS}


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


def load() -> dict[str, Any]:
    _migrate()
    if not FILE.is_file():
        _write({})
        return {}
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        _write({})
        return {}
    return _clean(data)


def save(raw: Any) -> dict[str, Any]:
    data = _clean(raw)
    _write(data)
    return data


def _migrate() -> None:
    if FILE.is_file() or FILE != USER_DATA / "user_settings.json" or not LEGACY.is_file():
        return
    USER_DATA.mkdir(parents=True, exist_ok=True)
    LEGACY.replace(FILE)


def _write(data: dict[str, Any]) -> None:
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
