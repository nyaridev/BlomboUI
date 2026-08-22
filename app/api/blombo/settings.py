from __future__ import annotations

import json
import re
from typing import Any

from blombo.paths import USER_DATA

FILE = USER_DATA / "user_settings.json"
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
_GENERATE_TABS = ("Generation", "Base Model", "LoRa", "Wildcards")
_IMAGE_FORMATS = ("png", "jpg", "webp")
_KEYS = (
    "batchGrid",
    "batchGridMax",
    "batchGridQuality",
    "batchGridRows",
    "batchGridFill",
    "batchGridOnCancel",
    "saveInterrupted",
    "genPreview",
    "genPreviewEvery",
    "genPreviewAfter",
    "genPreviewAfterFirst",
    "genPreviewLast",
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
    "civitaiApiKey",
    "civitaiAutoRetry",
    "civitaiAutoRetryCount",
    "timeDisplay",
    "setResolutions",
    "imagePath",
    "imageName",
    "gridPath",
    "gridName",
    "interruptedPath",
    "imageFormat",
    "gridFormat",
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
    "loraAutoApply",
    "loraApplyAt",
    "modelDirs",
    "wildcardDirs",
    "galleryDirs",
    "civitaiDownload",
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
    "thumbScopeOptionalIds",
    "thumbScopeAuto",
    "trashThumbFallback",
    "scopeGroups",
    "scopeOrder",
    "lookupScopeIds",
    "lookupScopeOptionalIds",
    "lookupKinds",
    "lookupModels",
    "scopeSearch",
    "modelsTab",
    "modelsKind",
    "civitaiBrowse",
    "civitaiTabs",
    "civitaiTabId",
    "galleryTypes",
    "galleryQuery",
    "galleryLocalScopes",
    "galleryScopeMode",
    "galleryFilterMode",
    "galleryFilterShareModels",
    "galleryPinSelected",
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
    if "genPreview" in raw:
        out["genPreview"] = bool(raw["genPreview"])
    if "genPreviewEvery" in raw:
        try:
            out["genPreviewEvery"] = max(1, min(150, int(raw["genPreviewEvery"])))
        except (TypeError, ValueError):
            pass
    if "genPreviewAfter" in raw:
        try:
            out["genPreviewAfter"] = max(1, min(150, int(raw["genPreviewAfter"])))
        except (TypeError, ValueError):
            pass
    if "genPreviewAfterFirst" in raw:
        out["genPreviewAfterFirst"] = bool(raw["genPreviewAfterFirst"])
    if "genPreviewLast" in raw:
        out["genPreviewLast"] = bool(raw["genPreviewLast"])
    if "interruptedInGrid" in raw:
        out["interruptedInGrid"] = bool(raw["interruptedInGrid"])
    if "galleryHideInterrupted" in raw:
        out["galleryHideInterrupted"] = bool(raw["galleryHideInterrupted"])
    if "hiddenGenerateTabs" in raw and isinstance(raw["hiddenGenerateTabs"], list):
        tabs: list[str] = []
        for item in raw["hiddenGenerateTabs"]:
            name = "Base Model" if item == "Checkpoints" else "LoRa" if item == "Lora" else str(item)
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
        ordered = _order_list(raw["generateTabOrder"], _GENERATE_TABS, rename={"Checkpoints": "Base Model", "Lora": "LoRa"})
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
    if "civitaiApiKey" in raw and isinstance(raw["civitaiApiKey"], str):
        out["civitaiApiKey"] = raw["civitaiApiKey"].strip()
    if "civitaiAutoRetry" in raw and isinstance(raw["civitaiAutoRetry"], bool):
        out["civitaiAutoRetry"] = raw["civitaiAutoRetry"]
    if "civitaiAutoRetryCount" in raw:
        try:
            out["civitaiAutoRetryCount"] = max(1, min(100, int(raw["civitaiAutoRetryCount"])))
        except (TypeError, ValueError):
            pass
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
    if "gridFormat" in raw:
        name = str(raw["gridFormat"]).lower()
        if name == "jpeg":
            name = "jpg"
        if name in _IMAGE_FORMATS:
            out["gridFormat"] = name
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
    if "loraAutoApply" in raw and isinstance(raw["loraAutoApply"], bool):
        out["loraAutoApply"] = raw["loraAutoApply"]
    if "loraApplyAt" in raw:
        value = str(raw["loraApplyAt"]).lower()
        if value in {"start", "end"}:
            out["loraApplyAt"] = value
    for key in ("modelDirs", "wildcardDirs", "galleryDirs"):
        if key in raw:
            rows = _dir_list(raw[key])
            if rows is not None:
                out[key] = rows
    if "civitaiDownload" in raw and isinstance(raw["civitaiDownload"], dict):
        out["civitaiDownload"] = _civitai_download(raw["civitaiDownload"])
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
        out["galleryThumbFallback"] = _gallery_fallback(raw["galleryThumbFallback"])
    if "thumbSaveTo" in raw:
        name = str(raw["thumbSaveTo"])
        out["thumbSaveTo"] = name if name in ("active", "global") else "global"
    if "thumbDisplayMode" in raw:
        name = str(raw["thumbDisplayMode"])
        out["thumbDisplayMode"] = name if name in ("likely", "exact") else "likely"
    if "thumbScopeIds" in raw and isinstance(raw["thumbScopeIds"], list):
        from blombo.thumbnail_scopes import ordered_ids

        out["thumbScopeIds"] = ordered_ids(raw["thumbScopeIds"])
    if "thumbScopeOptionalIds" in raw and isinstance(raw["thumbScopeOptionalIds"], list):
        from blombo.thumbnail_scopes import ordered_ids

        out["thumbScopeOptionalIds"] = ordered_ids(raw["thumbScopeOptionalIds"])
    if "thumbScopeAuto" in raw:
        out["thumbScopeAuto"] = bool(raw["thumbScopeAuto"])
    if "trashThumbFallback" in raw:
        out["trashThumbFallback"] = bool(raw["trashThumbFallback"])
    if "scopeGroups" in raw and isinstance(raw["scopeGroups"], list):
        out["scopeGroups"] = _unique_names(raw["scopeGroups"])
    if "scopeOrder" in raw and isinstance(raw["scopeOrder"], list):
        from blombo.thumbnail_scopes import ordered_ids

        out["scopeOrder"] = ordered_ids(raw["scopeOrder"])
    if "lookupScopeIds" in raw and isinstance(raw["lookupScopeIds"], list):
        out["lookupScopeIds"] = _lookup_scope_ids(raw["lookupScopeIds"])
    if "lookupScopeOptionalIds" in raw and isinstance(raw["lookupScopeOptionalIds"], list):
        from blombo.thumbnail_scopes import ordered_ids

        out["lookupScopeOptionalIds"] = ordered_ids(raw["lookupScopeOptionalIds"])
    if "lookupKinds" in raw and isinstance(raw["lookupKinds"], list):
        out["lookupKinds"] = _lookup_kinds(raw["lookupKinds"])
    if "lookupModels" in raw and isinstance(raw["lookupModels"], list):
        out["lookupModels"] = _lookup_models(raw["lookupModels"])
    if "scopeSearch" in raw and isinstance(raw["scopeSearch"], str):
        out["scopeSearch"] = raw["scopeSearch"][:200]
    if "modelsTab" in raw and raw["modelsTab"] in ("Local", "Download", "CivitAI"):
        out["modelsTab"] = raw["modelsTab"]
    if "modelsKind" in raw and raw["modelsKind"] in ("all", "checkpoints", "loras", "wildcards"):
        out["modelsKind"] = raw["modelsKind"]
    if "civitaiBrowse" in raw and isinstance(raw["civitaiBrowse"], dict):
        out["civitaiBrowse"] = _civitai_browse(raw["civitaiBrowse"])
    if "civitaiTabs" in raw:
        out["civitaiTabs"] = _civitai_tabs(raw["civitaiTabs"])
    if "civitaiTabId" in raw:
        out["civitaiTabId"] = _civitai_tab_id(raw["civitaiTabId"], out.get("civitaiTabs"))
    if "galleryTypes" in raw and isinstance(raw["galleryTypes"], dict):
        out["galleryTypes"] = _gallery_types(raw["galleryTypes"])
    if "galleryQuery" in raw and isinstance(raw["galleryQuery"], dict):
        out["galleryQuery"] = _gallery_query(raw["galleryQuery"])
    if "galleryLocalScopes" in raw and isinstance(raw["galleryLocalScopes"], dict):
        out["galleryLocalScopes"] = _gallery_local_scopes(raw["galleryLocalScopes"])
    if "galleryScopeMode" in raw and isinstance(raw["galleryScopeMode"], dict):
        out["galleryScopeMode"] = _gallery_mode_map(raw["galleryScopeMode"])
    if "galleryFilterMode" in raw and isinstance(raw["galleryFilterMode"], dict):
        out["galleryFilterMode"] = _gallery_mode_map(raw["galleryFilterMode"])
    if "galleryFilterShareModels" in raw:
        out["galleryFilterShareModels"] = bool(raw["galleryFilterShareModels"])
    if "galleryPinSelected" in raw and isinstance(raw["galleryPinSelected"], dict):
        out["galleryPinSelected"] = _gallery_pin_selected(raw["galleryPinSelected"])
    ids = out.get("lookupScopeIds")
    optional = out.get("lookupScopeOptionalIds")
    if isinstance(ids, list) and isinstance(optional, list):
        out["lookupScopeOptionalIds"] = [item for item in optional if item in ids]
    return {key: out[key] for key in _KEYS if key in out}


def _lookup_scope_ids(raw: Any) -> list[str]:
    from blombo.thumbnail_scopes import GLOBAL_ID, ordered_ids

    if any(str(item).strip().lower() == GLOBAL_ID for item in raw):
        return [GLOBAL_ID]
    return ordered_ids(raw)


_LOOKUP_KINDS = ("checkpoints", "loras", "wildcards")


def _lookup_kinds(raw: Any) -> list[str]:
    out: list[str] = []
    for item in raw:
        name = str(item)
        if name in _LOOKUP_KINDS and name not in out:
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


_GALLERY_MODE_KEYS = ("checkpoints", "loras", "wildcards", "models")
_GALLERY_MODE_DEFAULTS = {
    "checkpoints": "global",
    "loras": "global",
    "wildcards": "global",
    "models": "local",
}
_GALLERY_LOCAL_KEYS = (
    "checkpoints",
    "loras",
    "wildcards",
    "models",
    "models-all",
    "models-checkpoints",
    "models-loras",
    "models-wildcards",
)


def _gallery_mode_map(raw: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        name = str(key).strip()
        if name not in _GALLERY_MODE_KEYS or value not in ("global", "local"):
            continue
        if value != _GALLERY_MODE_DEFAULTS[name]:
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


def _gallery_local_scopes(raw: Any) -> dict[str, dict[str, Any]]:
    from blombo.thumbnail_scopes import ordered_ids

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
            "fallback": bool(item.get("fallback")),
        }
        if pack["ids"] or pack["optionalIds"] or pack["auto"] or pack["mode"] != "likely" or pack["fallback"]:
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
        if value == default:
            return {}
        return {kind: value for kind in _GALLERY_VIEWS}
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
    if isinstance(raw, bool):
        return raw
    mapped = _bool_gallery_map(raw, False)
    if not mapped:
        return False
    return any(mapped.values())


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


def _write(data: dict[str, Any]) -> None:
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
