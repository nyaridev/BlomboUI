from __future__ import annotations

import json
from typing import Any

from infrastructure.storage import user as db

_KEEP = 100


def list_rows() -> list[Any]:
    return db.query("SELECT * FROM error_log ORDER BY created_at DESC, id DESC")


def insert(values: dict[str, Any]) -> int:
    cur = db.execute(
        """
        INSERT INTO error_log (kind, code, name, message, paths_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            str(values.get("kind") or ""),
            str(values.get("code") or ""),
            str(values.get("name") or ""),
            str(values.get("message") or ""),
            json.dumps(values.get("paths") if isinstance(values.get("paths"), list) else []),
            int(values["created_at"]),
        ),
    )
    _trim()
    return int(cur.lastrowid)


def delete(ident: int) -> bool:
    cur = db.execute("DELETE FROM error_log WHERE id = ?", (ident,))
    return bool(cur.rowcount)


def delete_all() -> int:
    cur = db.execute("DELETE FROM error_log")
    return int(cur.rowcount or 0)


def _trim() -> None:
    rows = db.query("SELECT id FROM error_log ORDER BY created_at DESC, id DESC")
    extra = [int(row["id"]) for row in rows[_KEEP:]]
    for ident in extra:
        db.execute("DELETE FROM error_log WHERE id = ?", (ident,))
