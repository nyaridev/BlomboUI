from __future__ import annotations

import json
from typing import Any

from infrastructure.storage.repositories import settings as settings_repo
from features.settings.scripts.clean import _clean
from features.settings.scripts.values import (
    GRID_NAME_DEFAULT,
    GRID_PATH_DEFAULT,
    HIRES_NAME_DEFAULT,
    HIRES_PATH_DEFAULT,
    IMAGE_NAME_DEFAULT,
    IMAGE_PATH_DEFAULT,
    INTERRUPTED_PATH_DEFAULT,
)


def load() -> dict[str, Any]:
    raw = settings_repo.get_json()
    if raw is None:
        _write({})
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        _write({})
        return {}
    if not isinstance(data, dict):
        _write({})
        return {}
    return _clean(data)


def save(raw: Any) -> dict[str, Any]:
    previous = load()
    data = _clean(raw)
    if "outputRoot" not in data:
        kept = previous.get("outputRoot")
        if isinstance(kept, str) and kept.strip():
            data["outputRoot"] = kept.strip()
    _write(data)
    from features.downloads.scripts import history as download_history
    from features.history import service as browse_history

    download_history.trim_to_limit()
    browse_history.trim_to_limit()
    if previous.get("galleryDirs") != data.get("galleryDirs") or previous.get("outputRoot") != data.get("outputRoot"):
        from features.gallery.scripts.cache import start_sync

        start_sync()
    return data


def save_output_root(path: str | None) -> dict[str, Any]:
    data = load()
    previous = data.get("outputRoot")
    text = str(path or "").strip()
    if text:
        data["outputRoot"] = text
    else:
        data.pop("outputRoot", None)
    _write(data)
    if previous != data.get("outputRoot"):
        from features.gallery.scripts.cache import start_sync

        start_sync()
    return data


def _write(data: dict[str, Any]) -> None:
    settings_repo.put_json(json.dumps(data, indent=2) + "\n")
