from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from config import user_db_path

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
CREATE TABLE IF NOT EXISTS download_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    model_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,
    file_id INTEGER,
    name TEXT NOT NULL DEFAULT '',
    version_name TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    creator TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    base_model TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    trained_words_json TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    paths_json TEXT NOT NULL DEFAULT '[]',
    image_url TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'done',
    error TEXT NOT NULL DEFAULT '',
    request_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS download_history_created
    ON download_history (created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS browse_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    creator TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    viewed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS browse_history_viewed
    ON browse_history (viewed_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    paths_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS error_log_created
    ON error_log (created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS user_galleries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    query TEXT NOT NULL DEFAULT '',
    scopes_json TEXT NOT NULL DEFAULT '[]',
    models_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_galleries_created
    ON user_galleries (created_at ASC, id ASC);
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
            _migrate(_CONN)
            _CONN.commit()
        return _CONN


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(download_history)")}
    if "file_name" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN file_name TEXT NOT NULL DEFAULT ''")
    if "size_bytes" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0")
    if "base_model" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN base_model TEXT NOT NULL DEFAULT ''")
    if "tags_json" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'")
    if "trained_words_json" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN trained_words_json TEXT NOT NULL DEFAULT '[]'")
    if "description" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN description TEXT NOT NULL DEFAULT ''")
    if "search_text" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN search_text TEXT NOT NULL DEFAULT ''")
    if "status" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN status TEXT NOT NULL DEFAULT 'done'")
    if "error" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN error TEXT NOT NULL DEFAULT ''")
    if "request_json" not in cols:
        conn.execute("ALTER TABLE download_history ADD COLUMN request_json TEXT NOT NULL DEFAULT '{}'")


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
