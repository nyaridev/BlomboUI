from __future__ import annotations

import json
from typing import Any

from .settings_clean import _clean
from .settings_values import (
    FILE,
    GRID_NAME_DEFAULT,
    GRID_PATH_DEFAULT,
    IMAGE_NAME_DEFAULT,
    IMAGE_PATH_DEFAULT,
    INTERRUPTED_PATH_DEFAULT,
)


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
