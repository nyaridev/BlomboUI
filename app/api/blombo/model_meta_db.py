from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Callable, TypeVar

from blombo.paths import USER_DATA

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

SCHEMA = """
CREATE TABLE IF NOT EXISTS model_info (
    kind TEXT NOT NULL,
    ident TEXT NOT NULL,
    types_json TEXT NOT NULL DEFAULT '[]',
    modified INTEGER NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    strength REAL NOT NULL DEFAULT 1.0,
    slider INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, ident)
);
CREATE TABLE IF NOT EXISTS thumbnail_index (
    kind TEXT NOT NULL,
    ident TEXT NOT NULL,
    context TEXT NOT NULL,
    mtime INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (kind, ident, context)
);
CREATE TABLE IF NOT EXISTS meta_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def db_path() -> Path:
    USER_DATA.mkdir(parents=True, exist_ok=True)
    return USER_DATA / "model_meta.sqlite"


def connect() -> sqlite3.Connection:
    global _CONN
    with _LOCK:
        if _CONN is None:
            _CONN = sqlite3.connect(db_path(), check_same_thread=False)
            _CONN.row_factory = sqlite3.Row
            _CONN.execute("PRAGMA foreign_keys = ON")
            _CONN.execute("PRAGMA journal_mode=WAL")
            _CONN.executescript(SCHEMA)
            _CONN.commit()
        return _CONN


def execute(sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
    with _LOCK:
        cursor = connect().execute(sql, params)
        connect().commit()
        return cursor


def query(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    with _LOCK:
        return connect().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    with _LOCK:
        return connect().execute(sql, params).fetchone()


def transaction(callback: Callable[[sqlite3.Connection], T]) -> T:
    with _LOCK:
        conn = connect()
        try:
            result = callback(conn)
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise


def state(key: str) -> str | None:
    row = query_one("SELECT value FROM meta_state WHERE key = ?", (key,))
    return str(row["value"]) if row else None


def set_state(key: str, value: str = "1") -> None:
    execute(
        "INSERT INTO meta_state (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def load_info(kind: str) -> dict[str, dict[str, Any]]:
    rows = query(
        """
        SELECT ident, types_json, modified, prompt, negative_prompt,
               notes, strength, slider
        FROM model_info WHERE kind = ? ORDER BY rowid
        """,
        (kind,),
    )
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        try:
            types = json.loads(row["types_json"])
        except (TypeError, json.JSONDecodeError):
            types = []
        out[str(row["ident"])] = {
            "types": types if isinstance(types, list) else [],
            "modified": int(row["modified"] or 0),
            "prompt": str(row["prompt"] or ""),
            "negative_prompt": str(row["negative_prompt"] or ""),
            "notes": str(row["notes"] or ""),
            "strength": float(row["strength"] if row["strength"] is not None else 1.0),
            "slider": bool(row["slider"]),
        }
    return out


def replace_info(kind: str, data: dict[str, dict[str, Any]]) -> None:
    def write(conn: sqlite3.Connection) -> None:
        conn.execute("DELETE FROM model_info WHERE kind = ?", (kind,))
        for ident, row in data.items():
            conn.execute(
                """
                INSERT INTO model_info (
                    kind, ident, types_json, modified, prompt,
                    negative_prompt, notes, strength, slider
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    kind,
                    str(ident),
                    json.dumps(row.get("types") if isinstance(row.get("types"), list) else []),
                    int(row.get("modified") or 0),
                    str(row.get("prompt") or ""),
                    str(row.get("negative_prompt") or ""),
                    str(row.get("notes") or ""),
                    float(row.get("strength") if row.get("strength") is not None else 1.0),
                    int(bool(row.get("slider"))),
                ),
            )

    transaction(write)


def load_thumb_index() -> dict[str, dict[str, dict[str, dict[str, Any]]]]:
    out: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    for row in query(
        "SELECT kind, ident, context, mtime, tags_json FROM thumbnail_index ORDER BY rowid"
    ):
        try:
            tags = json.loads(row["tags_json"])
        except (TypeError, json.JSONDecodeError):
            tags = []
        out.setdefault(str(row["kind"]), {}).setdefault(str(row["ident"]), {})[
            str(row["context"])
        ] = {
            "mtime": int(row["mtime"] or 0),
            "tags": tags if isinstance(tags, list) else [],
        }
    return out


def replace_thumb_index(data: dict[str, Any]) -> None:
    def write(conn: sqlite3.Connection) -> None:
        conn.execute("DELETE FROM thumbnail_index")
        for kind, idents in data.items():
            if not isinstance(idents, dict):
                continue
            for ident, contexts in idents.items():
                if not isinstance(contexts, dict):
                    continue
                for context, row in contexts.items():
                    if not isinstance(row, dict):
                        continue
                    tags = row.get("tags") if isinstance(row.get("tags"), list) else []
                    conn.execute(
                        """
                        INSERT INTO thumbnail_index (kind, ident, context, mtime, tags_json)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            str(kind),
                            str(ident),
                            str(context),
                            int(row.get("mtime") or 0),
                            json.dumps(tags),
                        ),
                    )

    transaction(write)
