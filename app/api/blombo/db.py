from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from blombo.paths import USER_DATA

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    comfy_prompt_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    root TEXT NOT NULL,
    asset_kind TEXT NOT NULL DEFAULT 'image',
    size INTEGER NOT NULL DEFAULT 0,
    mtime_ns INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    seed INTEGER,
    checkpoint_name TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    params_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS gallery_items_created
    ON gallery_items (created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_items_kind_created
    ON gallery_items (asset_kind, created_at DESC);

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
"""

def db_path() -> Path:
    USER_DATA.mkdir(parents=True, exist_ok=True)
    return USER_DATA / "blombo.sqlite"


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
