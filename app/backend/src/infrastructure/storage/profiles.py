from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from config import (
    DEFAULT_PROFILE_ID,
    DEFAULT_PROFILE_NAME,
    ensure_profile_dirs,
    profile_db_path,
    set_active_profile_id,
    valid_profile_id,
)

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS removed_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    removed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_id TEXT NOT NULL REFERENCES profiles(id)
);
"""


def db_path() -> Path:
    return profile_db_path()


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
            _seed(_CONN)
            active = _read_active(_CONN)
            set_active_profile_id(active)
            ensure_profile_dirs(active)
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


def _seed(conn: sqlite3.Connection) -> None:
    import time

    row = conn.execute("SELECT id FROM profiles WHERE id = ?", (DEFAULT_PROFILE_ID,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO profiles (id, display_name, created_at) VALUES (?, ?, ?)",
            (DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, int(time.time())),
        )
    state = conn.execute("SELECT active_id FROM profile_state WHERE id = 1").fetchone()
    if state is None:
        conn.execute(
            "INSERT INTO profile_state (id, active_id) VALUES (1, ?)",
            (DEFAULT_PROFILE_ID,),
        )
    conn.commit()


def _read_active(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT active_id FROM profile_state WHERE id = 1").fetchone()
    ident = str(row["active_id"] if row else DEFAULT_PROFILE_ID).strip().lower()
    if not valid_profile_id(ident):
        return DEFAULT_PROFILE_ID
    exists = conn.execute("SELECT id FROM profiles WHERE id = ?", (ident,)).fetchone()
    return ident if exists is not None else DEFAULT_PROFILE_ID
