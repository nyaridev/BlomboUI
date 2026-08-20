from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Callable, TypeVar

from blombo.paths import RUNTIME, USER_DATA

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None
T = TypeVar("T")

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
    (
        3,
        """
CREATE TABLE IF NOT EXISTS scopes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scope_tags (
    scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('required', 'optional', 'exclude')),
    position INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (scope_id, kind, position),
    UNIQUE (scope_id, kind, tag)
);
CREATE TABLE IF NOT EXISTS scope_any_tags (
    scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    group_index INTEGER NOT NULL,
    position INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (scope_id, group_index, position),
    UNIQUE (scope_id, group_index, tag)
);
CREATE INDEX IF NOT EXISTS scope_tags_lookup ON scope_tags (kind, tag);
CREATE INDEX IF NOT EXISTS scope_any_tags_lookup ON scope_any_tags (tag);
""",
    ),
    (
        4,
        """
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
""",
    ),
    (
        5,
        """
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
""",
    ),
    (
        6,
        """
CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    legacy_id TEXT UNIQUE,
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
""",
    ),
    (
        7,
        """
SELECT 1;
""",
    ),
]


def db_path() -> Path:
    USER_DATA.mkdir(parents=True, exist_ok=True)
    return USER_DATA / "blombo.sqlite"


def _migrate_legacy_db(dest: Path) -> None:
    legacy = RUNTIME / "data" / "blombo.sqlite"
    if dest.exists() or not legacy.is_file():
        return
    temp = dest.with_name(f".{dest.name}.migrating")
    temp.unlink(missing_ok=True)
    source_conn = sqlite3.connect(legacy)
    target_conn = sqlite3.connect(temp)
    try:
        source_conn.backup(target_conn)
        target_conn.commit()
    except Exception:
        temp.unlink(missing_ok=True)
        raise
    finally:
        target_conn.close()
        source_conn.close()
    temp.replace(dest)


def _migrate_scope_tables(conn: sqlite3.Connection) -> None:
    old_tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND name IN ('scopes', 'scope_tags', 'scope_any_tags')"
    ).fetchall()
    if not old_tables:
        return
    old_scopes = conn.execute("SELECT id, name, group_name, priority FROM scopes ORDER BY rowid").fetchall()
    for scope in old_scopes:
        ident = str(scope["id"])
        tags = {"required": [], "optional": [], "exclude": []}
        for row in conn.execute(
            "SELECT kind, tag FROM scope_tags WHERE scope_id = ? ORDER BY kind, position",
            (ident,),
        ):
            kind = str(row["kind"])
            if kind in tags:
                tags[kind].append(str(row["tag"]))
        groups: dict[int, list[str]] = {}
        for row in conn.execute(
            "SELECT group_index, tag FROM scope_any_tags WHERE scope_id = ? "
            "ORDER BY group_index, position",
            (ident,),
        ):
            groups.setdefault(int(row["group_index"]), []).append(str(row["tag"]))
        conn.execute(
            """
            INSERT OR REPLACE INTO thumb_scopes (
                id, name, group_name, required_json, optional_json,
                any_groups_json, exclude_json, priority
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ident,
                str(scope["name"]),
                str(scope["group_name"]),
                json.dumps(tags["required"]),
                json.dumps(tags["optional"]),
                json.dumps([groups[index] for index in sorted(groups)]),
                json.dumps(tags["exclude"]),
                int(scope["priority"]),
            ),
        )
    conn.executescript(
        """
        DROP TABLE IF EXISTS scope_any_tags;
        DROP TABLE IF EXISTS scope_tags;
        DROP TABLE IF EXISTS scopes;
        """
    )


def _migrate_generations(conn: sqlite3.Connection) -> None:
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'generations'"
    ).fetchone()
    if not exists:
        return
    columns = {
        str(row["name"])
        for row in conn.execute("PRAGMA table_info(gallery_items)").fetchall()
    }
    if "legacy_id" not in columns:
        conn.execute("ALTER TABLE gallery_items ADD COLUMN legacy_id TEXT")
    rows = conn.execute("SELECT * FROM generations ORDER BY created_at, rowid").fetchall()
    job_outputs: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        path = str(row["path"])
        params_json = str(row["params_json"] or "{}")
        try:
            params = json.loads(params_json)
        except (TypeError, json.JSONDecodeError):
            params = {}
        if not isinstance(params, dict):
            params = {}
        kind = "interrupted" if params.get("interrupted") else "image"
        if kind == "image" and any(part.lower() == "interrupted" for part in Path(path).parts):
            kind = "interrupted"
        try:
            stat = Path(path).stat()
            size = int(stat.st_size)
            mtime_ns = int(stat.st_mtime_ns)
        except OSError:
            size = 0
            mtime_ns = 0
        legacy_id = str(row["id"])
        existing = conn.execute("SELECT id FROM gallery_items WHERE path = ?", (path,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE gallery_items SET legacy_id = COALESCE(legacy_id, ?) WHERE path = ?",
                (legacy_id, path),
            )
        else:
            conn.execute(
                """
                INSERT OR IGNORE INTO gallery_items (
                    id, legacy_id, path, root, asset_kind, size, mtime_ns,
                    width, height, seed, checkpoint_name, prompt,
                    negative_prompt, params_json, created_at, favorite
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    legacy_id,
                    legacy_id,
                    path,
                    str(row["root"] or ""),
                    kind,
                    size,
                    mtime_ns,
                    row["width"],
                    row["height"],
                    row["seed"],
                    row["checkpoint_name"],
                    row["prompt"],
                    row["negative_prompt"],
                    params_json,
                    str(row["created_at"]),
                    int(row["favorite"] or 0),
                ),
            )
        job_id = str(row["job_id"])
        job_outputs.setdefault(job_id, []).append(
            {
                "id": legacy_id,
                "path": path,
                "kind": kind,
                "created_at": str(row["created_at"]),
            }
        )
    for job_id, outputs in job_outputs.items():
        row = conn.execute("SELECT payload_json FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            continue
        try:
            payload = json.loads(row["payload_json"])
        except (TypeError, json.JSONDecodeError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        current = payload.get("outputs")
        if not isinstance(current, list):
            current = []
        known = {str(item.get("id")) for item in current if isinstance(item, dict) and item.get("id")}
        current.extend(item for item in outputs if item["id"] not in known)
        payload["outputs"] = current
        conn.execute(
            "UPDATE jobs SET payload_json = ? WHERE id = ?",
            (json.dumps(payload), job_id),
        )
    conn.execute("DROP TABLE generations")


def _drop_legacy_id(conn: sqlite3.Connection) -> None:
    columns = {
        str(row["name"])
        for row in conn.execute("PRAGMA table_info(gallery_items)").fetchall()
    }
    if "legacy_id" not in columns:
        return
    conn.executescript(
        """
        DROP TABLE IF EXISTS gallery_items_without_legacy;
        CREATE TABLE gallery_items_without_legacy (
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
        INSERT INTO gallery_items_without_legacy (
            id, path, root, asset_kind, size, mtime_ns, width, height,
            seed, checkpoint_name, prompt, negative_prompt, params_json,
            created_at, favorite
        )
        SELECT id, path, root, asset_kind, size, mtime_ns, width, height,
               seed, checkpoint_name, prompt, negative_prompt, params_json,
               created_at, favorite
        FROM gallery_items;
        DROP TABLE gallery_items;
        ALTER TABLE gallery_items_without_legacy RENAME TO gallery_items;
        CREATE INDEX gallery_items_created
            ON gallery_items (created_at DESC);
        CREATE INDEX gallery_items_kind_created
            ON gallery_items (asset_kind, created_at DESC);
        """
    )


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
            if step_version == 5:
                _migrate_scope_tables(conn)
            if step_version == 6:
                _migrate_generations(conn)
            if step_version == 7:
                _drop_legacy_id(conn)
            conn.execute("UPDATE schema_version SET version = ?", (step_version,))
            version = step_version
    if version >= 6:
        _migrate_generations(conn)
    if version >= 7:
        _drop_legacy_id(conn)
    conn.commit()


def connect() -> sqlite3.Connection:
    global _CONN
    with _LOCK:
        if _CONN is None:
            path = db_path()
            _migrate_legacy_db(path)
            _CONN = sqlite3.connect(path, check_same_thread=False)
            _CONN.row_factory = sqlite3.Row
            _CONN.execute("PRAGMA foreign_keys = ON")
            _CONN.execute("PRAGMA journal_mode=WAL")
            migrate(_CONN)
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
