from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from blombo.paths import RUNTIME

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    path TEXT NOT NULL,
    root TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    seed INTEGER,
    checkpoint_name TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    params_json TEXT,
    created_at TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0
);
"""

# (version, sql) applied in order when schema_version is behind.
STEPS: list[tuple[int, str]] = [
    (
        2,
        """
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
""",
    ),
]


def db_path() -> Path:
    RUNTIME.joinpath("data").mkdir(parents=True, exist_ok=True)
    return RUNTIME / "data" / "blombo.sqlite"


def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    row = conn.execute("SELECT version FROM schema_version LIMIT 1").fetchone()
    version = int(row["version"]) if row else 0
    if version == 0:
        conn.execute("INSERT INTO schema_version (version) VALUES (1)")
        version = 1
    for step_version, sql in STEPS:
        if version < step_version:
            conn.executescript(sql)
            conn.execute("UPDATE schema_version SET version = ?", (step_version,))
            version = step_version
    conn.commit()


def connect() -> sqlite3.Connection:
    global _CONN
    with _LOCK:
        if _CONN is None:
            _CONN = sqlite3.connect(db_path(), check_same_thread=False)
            _CONN.row_factory = sqlite3.Row
            _CONN.execute("PRAGMA journal_mode=WAL")
            migrate(_CONN)
        return _CONN


def execute(sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
    with _LOCK:
        cur = connect().execute(sql, params)
        connect().commit()
        return cur


def query(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    with _LOCK:
        return connect().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    with _LOCK:
        return connect().execute(sql, params).fetchone()
