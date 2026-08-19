from __future__ import annotations

import json
from typing import Any

from blombo.paths import USER

FILE = USER / "user_settings.json"
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
    return {key: out[key] for key in _KEYS if key in out}


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
