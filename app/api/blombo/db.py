from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from blombo.paths import user_db_path

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

SCHEMA = """
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings (id, data_json) VALUES (1, '{}');

CREATE TABLE IF NOT EXISTS prompt_tags (
    tag TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    last_used TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_tag_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    prompt TEXT NOT NULL,
    negative TEXT NOT NULL
);
INSERT OR IGNORE INTO prompt_tag_state (id, prompt, negative) VALUES (1, '', '');

CREATE TABLE IF NOT EXISTS workflow_template_state (
    workflow TEXT PRIMARY KEY,
    apply_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_templates (
    workflow TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    params_json TEXT NOT NULL,
    icon_json TEXT,
    PRIMARY KEY (workflow, id),
    UNIQUE (workflow, position)
);
CREATE INDEX IF NOT EXISTS workflow_templates_order
    ON workflow_templates (workflow, position);

CREATE TABLE IF NOT EXISTS thumb_scopes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '',
    required_json TEXT NOT NULL,
    optional_json TEXT NOT NULL,
    any_groups_json TEXT NOT NULL,
    exclude_json TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0
);

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
    auto_apply INTEGER,
    apply_at TEXT,
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
"""


def db_path() -> Path:
    return user_db_path()


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
        cur = connect().execute(sql, params)
        connect().commit()
        return cur


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


def query(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    with _LOCK:
        return connect().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    with _LOCK:
        return connect().execute(sql, params).fetchone()
