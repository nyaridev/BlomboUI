from __future__ import annotations

from pathlib import Path
from typing import Any

from features.settings.scripts.values import (
    _GENERATE_TABS,
    _GALLERY_DIRS,
    _GALLERY_SORTS,
    _HIDEABLE_MAIN_TABS,
    _IMAGE_FORMATS,
    _KEYS,
    _ORDERABLE_MAIN_TABS,
    GRID_NAME_DEFAULT,
    GRID_PATH_DEFAULT,
    HIRES_NAME_DEFAULT,
    HIRES_PATH_DEFAULT,
    IMAGE_NAME_DEFAULT,
    IMAGE_PATH_DEFAULT,
    INTERRUPTED_PATH_DEFAULT,
)
from features.settings.scripts.validators import (
    _autocomplete_lists,
    _civitai_browse,
    _civitai_download,
    _civitai_marks,
    _civitai_tab_id,
    _civitai_tabs,
    _dir_list,
    _gallery_fallback,
    _gallery_local_scopes,
    _gallery_map,
    _gallery_pin_selected,
    _gallery_auto_types,
    _gallery_query,
    _gallery_browse_dir,
    _gallery_browse_sort,
    _gallery_types,
    _lookup_kinds,
    _lookup_models,
    _lookup_scope_ids,
    _name_template,
    _order_list,
    _path_template,
    _set_resolutions,
    _unique_names,
    _unique_allowed,
    _lora_bound,
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
            name = str(item)
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
        ordered = _order_list(raw["generateTabOrder"], _GENERATE_TABS)
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
    if "modelInfoLayout" in raw:
        layout = str(raw["modelInfoLayout"]).lower()
        if layout in ("horizontal", "vertical"):
            out["modelInfoLayout"] = layout
    if "hiddenSamplers" in raw and isinstance(raw["hiddenSamplers"], list):
        out["hiddenSamplers"] = _unique_names(raw["hiddenSamplers"])
    if "hiddenSchedulers" in raw and isinstance(raw["hiddenSchedulers"], list):
        out["hiddenSchedulers"] = _unique_names(raw["hiddenSchedulers"])
    if "theme" in raw:
        name = str(raw["theme"])
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
    hires_path = _path_template(raw.get("hiresPath"), HIRES_PATH_DEFAULT) if "hiresPath" in raw else None
    if hires_path:
        out["hiresPath"] = hires_path
    hires_name = _name_template(raw.get("hiresName"), HIRES_NAME_DEFAULT) if "hiresName" in raw else None
    if hires_name:
        out["hiresName"] = hires_name
    if "hiresTempAfterDays" in raw:
        try:
            out["hiresTempAfterDays"] = max(1, min(365, int(raw["hiresTempAfterDays"])))
        except (TypeError, ValueError):
            pass
    if "imageFormat" in raw:
        name = str(raw["imageFormat"]).lower()
        if name in _IMAGE_FORMATS:
            out["imageFormat"] = name
    if "gridFormat" in raw:
        name = str(raw["gridFormat"]).lower()
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
    if "thumbMegapixels" in raw:
        try:
            value = float(raw["thumbMegapixels"])
        except (TypeError, ValueError):
            pass
        else:
            if value == value and value not in (float("inf"), float("-inf")):
                out["thumbMegapixels"] = round(min(2.0, max(0.05, value)) * 20) / 20
    if "thumbFormat" in raw:
        name = str(raw["thumbFormat"]).lower()
        if name in _IMAGE_FORMATS:
            out["thumbFormat"] = name
    if "thumbQuality" in raw:
        try:
            out["thumbQuality"] = max(1, min(100, int(raw["thumbQuality"])))
        except (TypeError, ValueError):
            pass
    if "saveRawThumbs" in raw:
        out["saveRawThumbs"] = bool(raw["saveRawThumbs"])
    if "saveAnimatedThumbs" in raw:
        out["saveAnimatedThumbs"] = bool(raw["saveAnimatedThumbs"])
    if "animatedThumbFormat" in raw:
        name = str(raw["animatedThumbFormat"]).lower()
        if name in ("gif", "webp", "video"):
            out["animatedThumbFormat"] = name
    if "downloadThumbMegapixels" in raw:
        try:
            value = float(raw["downloadThumbMegapixels"])
        except (TypeError, ValueError):
            pass
        else:
            if value == value and value not in (float("inf"), float("-inf")):
                out["downloadThumbMegapixels"] = round(min(2.0, max(0.05, value)) * 20) / 20
    if "downloadThumbImageFormat" in raw:
        name = str(raw["downloadThumbImageFormat"]).lower()
        if name in _IMAGE_FORMATS:
            out["downloadThumbImageFormat"] = name
    if "downloadThumbVideoFormat" in raw:
        name = str(raw["downloadThumbVideoFormat"]).lower()
        if name in ("gif", "webp", "video"):
            out["downloadThumbVideoFormat"] = name
    if "downloadThumbQuality" in raw:
        try:
            out["downloadThumbQuality"] = max(1, min(100, int(raw["downloadThumbQuality"])))
        except (TypeError, ValueError):
            pass
    if "galleryItemThumbMegapixels" in raw:
        try:
            value = float(raw["galleryItemThumbMegapixels"])
        except (TypeError, ValueError):
            pass
        else:
            if value == value and value not in (float("inf"), float("-inf")):
                out["galleryItemThumbMegapixels"] = round(min(2.0, max(0.05, value)) * 20) / 20
    if "galleryItemThumbFormat" in raw:
        name = str(raw["galleryItemThumbFormat"]).lower()
        if name in _IMAGE_FORMATS:
            out["galleryItemThumbFormat"] = name
    if "galleryItemThumbVideoFormat" in raw:
        name = str(raw["galleryItemThumbVideoFormat"]).lower()
        if name in ("gif", "webp", "video"):
            out["galleryItemThumbVideoFormat"] = name
    if "galleryItemThumbQuality" in raw:
        try:
            out["galleryItemThumbQuality"] = max(1, min(100, int(raw["galleryItemThumbQuality"])))
        except (TypeError, ValueError):
            pass
    if "galleryPageSize" in raw:
        try:
            value = int(raw["galleryPageSize"])
        except (TypeError, ValueError):
            pass
        else:
            out["galleryPageSize"] = max(20, min(500, value))
    if "galleryCardPageSize" in raw:
        try:
            value = int(raw["galleryCardPageSize"])
        except (TypeError, ValueError):
            pass
        else:
            out["galleryCardPageSize"] = max(20, min(500, value))
    if "downloadHistoryLimit" in raw:
        try:
            value = int(raw["downloadHistoryLimit"])
        except (TypeError, ValueError):
            pass
        else:
            if value >= -1:
                out["downloadHistoryLimit"] = value
    if "browseHistoryLimit" in raw:
        try:
            value = int(raw["browseHistoryLimit"])
        except (TypeError, ValueError):
            pass
        else:
            if value >= -1:
                out["browseHistoryLimit"] = value
    if "gallerySortKey" in raw:
        mapped = _gallery_map(raw["gallerySortKey"], _GALLERY_SORTS, "added")
        if mapped:
            out["gallerySortKey"] = mapped
    if "gallerySortDir" in raw:
        mapped = _gallery_map(raw["gallerySortDir"], _GALLERY_DIRS, "desc")
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
    if "outputRoot" in raw:
        text = str(raw.get("outputRoot") or "").strip()
        if text:
            path = Path(text)
            if path.is_absolute():
                out["outputRoot"] = str(path)
    if "civitaiDownload" in raw and isinstance(raw["civitaiDownload"], dict):
        out["civitaiDownload"] = _civitai_download(raw["civitaiDownload"])
    if "downloadQueue" in raw:
        out["downloadQueue"] = bool(raw["downloadQueue"])
    if "downloadQueueParallel" in raw:
        try:
            out["downloadQueueParallel"] = max(1, min(20, int(raw["downloadQueueParallel"])))
        except (TypeError, ValueError):
            pass
    if "managerQueueParallel" in raw:
        try:
            out["managerQueueParallel"] = max(1, min(20, int(raw["managerQueueParallel"])))
        except (TypeError, ValueError):
            pass
    if "managerDownloadDirId" in raw:
        ident = str(raw["managerDownloadDirId"] or "").strip()
        if ident and ident != "comfyui":
            out["managerDownloadDirId"] = ident
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
        from features.models.scripts.thumbnail_scopes import ordered_ids

        out["thumbScopeIds"] = ordered_ids(raw["thumbScopeIds"])
    if "thumbScopeOptionalIds" in raw and isinstance(raw["thumbScopeOptionalIds"], list):
        from features.models.scripts.thumbnail_scopes import ordered_ids

        out["thumbScopeOptionalIds"] = ordered_ids(raw["thumbScopeOptionalIds"])
    if "thumbScopeAuto" in raw:
        out["thumbScopeAuto"] = bool(raw["thumbScopeAuto"])
    if "trashThumbFallback" in raw:
        out["trashThumbFallback"] = bool(raw["trashThumbFallback"])
    if "scopeGroups" in raw and isinstance(raw["scopeGroups"], list):
        out["scopeGroups"] = _unique_names(raw["scopeGroups"])
    if "scopeOrder" in raw and isinstance(raw["scopeOrder"], list):
        from features.models.scripts.thumbnail_scopes import ordered_ids

        out["scopeOrder"] = ordered_ids(raw["scopeOrder"])
    if "lookupScopeIds" in raw and isinstance(raw["lookupScopeIds"], list):
        out["lookupScopeIds"] = _lookup_scope_ids(raw["lookupScopeIds"])
    if "lookupScopeOptionalIds" in raw and isinstance(raw["lookupScopeOptionalIds"], list):
        from features.models.scripts.thumbnail_scopes import ordered_ids

        out["lookupScopeOptionalIds"] = ordered_ids(raw["lookupScopeOptionalIds"])
    if "lookupKinds" in raw and isinstance(raw["lookupKinds"], list):
        out["lookupKinds"] = _lookup_kinds(raw["lookupKinds"])
    if "lookupModels" in raw and isinstance(raw["lookupModels"], list):
        out["lookupModels"] = _lookup_models(raw["lookupModels"])
    if "scopeSearch" in raw and isinstance(raw["scopeSearch"], str):
        out["scopeSearch"] = raw["scopeSearch"][:200]
    if "modelsTab" in raw and raw["modelsTab"] in ("Local", "CivitAI", "Manager"):
        out["modelsTab"] = raw["modelsTab"]
    if "modelsKind" in raw and raw["modelsKind"] in ("all", "checkpoints", "loras", "wildcards", "other"):
        out["modelsKind"] = raw["modelsKind"]
    if "civitaiBrowse" in raw and isinstance(raw["civitaiBrowse"], dict):
        out["civitaiBrowse"] = _civitai_browse(raw["civitaiBrowse"])
    if "civitaiMarks" in raw:
        out["civitaiMarks"] = _civitai_marks(raw["civitaiMarks"])
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
    if "galleryAutoTypes" in raw and isinstance(raw["galleryAutoTypes"], dict):
        out["galleryAutoTypes"] = _gallery_auto_types(raw["galleryAutoTypes"])
    if "galleryPinSelected" in raw and isinstance(raw["galleryPinSelected"], dict):
        out["galleryPinSelected"] = _gallery_pin_selected(raw["galleryPinSelected"])
    if "galleryBrowseSort" in raw and isinstance(raw["galleryBrowseSort"], dict):
        out["galleryBrowseSort"] = _gallery_browse_sort(raw["galleryBrowseSort"])
    if "galleryBrowseDir" in raw and isinstance(raw["galleryBrowseDir"], dict):
        out["galleryBrowseDir"] = _gallery_browse_dir(raw["galleryBrowseDir"])
    if "galleryBrowseShare" in raw:
        out["galleryBrowseShare"] = bool(raw["galleryBrowseShare"])
    ids = out.get("lookupScopeIds")
    optional = out.get("lookupScopeOptionalIds")
    if isinstance(ids, list) and isinstance(optional, list):
        out["lookupScopeOptionalIds"] = [item for item in optional if item in ids]
    return {key: out[key] for key in _KEYS if key in out}
