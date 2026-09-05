from __future__ import annotations

import json
from typing import Any

from infrastructure.storage import cache


def load_all() -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    try:
        rows = cache.query("SELECT kind, data_json FROM model_lists")
    except Exception:
        return out
    for row in rows:
        try:
            data = json.loads(row["data_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(data, list):
            out[str(row["kind"])] = [item for item in data if isinstance(item, dict)]
    return out


def replace_kind(kind: str, items: list[dict[str, Any]]) -> None:
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":"))

    def write(conn) -> None:
        conn.execute(
            """
            INSERT INTO model_lists (kind, data_json) VALUES (?, ?)
            ON CONFLICT(kind) DO UPDATE SET data_json = excluded.data_json
            """,
            (kind, payload),
        )

    try:
        cache.transaction(write)
    except Exception:
        pass
