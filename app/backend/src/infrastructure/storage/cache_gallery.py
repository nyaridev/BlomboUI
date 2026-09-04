from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from config import cache_gallery_db_path

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

SCHEMA = """
CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    root TEXT NOT NULL,
    asset_kind TEXT NOT NULL DEFAULT 'image',
    media_kind TEXT NOT NULL DEFAULT 'image',
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
CREATE INDEX IF NOT EXISTS gallery_items_media_created
    ON gallery_items (media_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_items_checkpoint
    ON gallery_items (checkpoint_name, created_at DESC);

CREATE TABLE IF NOT EXISTS gallery_item_tags (
    item_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (item_id, tag),
    FOREIGN KEY (item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gallery_item_tags_tag
    ON gallery_item_tags (tag);

CREATE TABLE IF NOT EXISTS gallery_item_loras (
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (item_id, name),
    FOREIGN KEY (item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gallery_item_loras_name
    ON gallery_item_loras (name);

CREATE TABLE IF NOT EXISTS gallery_item_wildcards (
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (item_id, name),
    FOREIGN KEY (item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gallery_item_wildcards_name
    ON gallery_item_wildcards (name);

CREATE TABLE IF NOT EXISTS gallery_seen (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL DEFAULT 0,
    mtime_ns INTEGER NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 0
);
"""

_FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS gallery_fts USING fts5(
    item_id UNINDEXED,
    text,
    tokenize = 'unicode61'
);
"""


def db_path() -> Path:
    return cache_gallery_db_path()


def _ensure_fts(conn: sqlite3.Connection) -> None:
    try:
        conn.executescript(_FTS)
    except sqlite3.OperationalError:
        return
    try:
        fts_n = int(conn.execute("SELECT COUNT(*) AS n FROM gallery_fts").fetchone()["n"])
        item_n = int(conn.execute("SELECT COUNT(*) AS n FROM gallery_items").fetchone()["n"])
    except (sqlite3.OperationalError, TypeError, ValueError, KeyError):
        return
    if fts_n == item_n:
        return
    from infrastructure.storage.repositories import gallery as gallery_repo

    gallery_repo.rebuild_search(conn)


def connect() -> sqlite3.Connection:
    global _CONN
    with _LOCK:
        if _CONN is None:
            _CONN = sqlite3.connect(db_path(), check_same_thread=False)
            _CONN.row_factory = sqlite3.Row
            _CONN.execute("PRAGMA foreign_keys = ON")
            _CONN.execute("PRAGMA journal_mode=WAL")
            _CONN.executescript(SCHEMA)
            _ensure_fts(_CONN)
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
