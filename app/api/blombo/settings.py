from __future__ import annotations

import json
from typing import Any

from blombo import db
from .settings_clean import _clean
from .settings_values import (
    GRID_NAME_DEFAULT,
    GRID_PATH_DEFAULT,
    IMAGE_NAME_DEFAULT,
    IMAGE_PATH_DEFAULT,
    INTERRUPTED_PATH_DEFAULT,
)


def load() -> dict[str, Any]:
    row = db.query_one("SELECT data_json FROM app_settings WHERE id = 1")
    if not row:
        _write({})
        return {}
    try:
        data = json.loads(row["data_json"])
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
    return data


def _write(data: dict[str, Any]) -> None:
    db.execute(
        """
        INSERT INTO app_settings (id, data_json) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json
        """,
        (json.dumps(data, indent=2) + "\n",),
    )
