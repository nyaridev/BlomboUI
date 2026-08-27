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
    data = _clean(raw)
    _write(data)
    from features.downloads.scripts import history as download_history
    from features.history import service as browse_history

    download_history.trim_to_limit()
    browse_history.trim_to_limit()
    return data


def _write(data: dict[str, Any]) -> None:
    settings_repo.put_json(json.dumps(data, indent=2) + "\n")
