from __future__ import annotations

import json
import re
from typing import Any

from blombo.paths import USER

FILE = USER / "user_settings.json"
IMAGE_PATH_DEFAULT = "[workflow]/images/[date]"
GRID_PATH_DEFAULT = "[workflow]/grids/[date]"
_SAFE_PATH = re.compile(r"^[A-Za-z0-9._\[\]/-]+$")
_GALLERY_SORTS = ("name", "added", "edited", "path")
_GALLERY_DIRS = ("asc", "desc")
_GALLERY_VIEWS = ("checkpoints", "loras", "wildcards")
_KEYS = (
    "batchGrid",
    "batchGridMax",
    "batchGridQuality",
    "batchGridRows",
    "batchGridFill",
    "hiddenGenerateTabs",
    "hiddenModelTypes",
    "theme",
    "civitaiSite",
    "wildcardYamlByFilename",
    "imagePath",
    "gridPath",
    "gallerySortKey",
    "gallerySortDir",
    "galleryTileScale",
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
    if "hiddenGenerateTabs" in raw and isinstance(raw["hiddenGenerateTabs"], list):
        tabs: list[str] = []
        for item in raw["hiddenGenerateTabs"]:
            name = "Base Model" if item == "Checkpoints" else str(item)
            if name and name != "Generation" and name not in tabs:
                tabs.append(name)
        out["hiddenGenerateTabs"] = tabs
    if "hiddenModelTypes" in raw and isinstance(raw["hiddenModelTypes"], list):
        types: list[str] = []
        for item in raw["hiddenModelTypes"]:
            name = str(item)
            if name and name not in types:
                types.append(name)
        out["hiddenModelTypes"] = types
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
    if "wildcardYamlByFilename" in raw:
        out["wildcardYamlByFilename"] = bool(raw["wildcardYamlByFilename"])
    image_path = _path_template(raw.get("imagePath"), IMAGE_PATH_DEFAULT) if "imagePath" in raw else None
    if image_path:
        out["imagePath"] = image_path
    grid_path = _path_template(raw.get("gridPath"), GRID_PATH_DEFAULT) if "gridPath" in raw else None
    if grid_path:
        out["gridPath"] = grid_path
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
    return {key: out[key] for key in _KEYS if key in out}


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


def load() -> dict[str, Any]:
    if not FILE.is_file():
        return {}
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return _clean(data)


def save(raw: Any) -> dict[str, Any]:
    data = _clean(raw)
    if not data:
        FILE.unlink(missing_ok=True)
        return {}
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data
