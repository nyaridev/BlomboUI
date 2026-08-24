from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from infrastructure.storage import cache as cache_db

from infrastructure.storage import user as db
from config import ROOT

USER_TABLES = (
    "prompt_tags",
    "prompt_tag_state",
    "workflow_template_state",
    "workflow_templates",
    "thumb_scopes",
)
META_TABLES = ("model_info", "thumbnail_index")
CACHE_TABLES = ("jobs", "gallery_items")


def migrate(root: Path) -> None:
    old_user = root / "user" / "user_data"
    old_runtime = root / "runtime" / "data"
    user_db = root / "user" / "data" / "sqlite" / "blombo.sqlite"
    cache_path = root / "runtime" / "data" / "sqlite" / "cache.sqlite"
    user_db.parent.mkdir(parents=True, exist_ok=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    _init_schema(user_db, db.SCHEMA)
    _init_schema(cache_path, cache_db.SCHEMA)

    old_app = old_user / "blombo.sqlite"
    if old_app.is_file():
        _checkpoint(old_app)
        _copy_tables(old_app, user_db, USER_TABLES)
        _copy_tables(old_app, cache_path, CACHE_TABLES)

    old_meta = old_user / "model_meta.sqlite"
    if old_meta.is_file():
        _checkpoint(old_meta)
        _copy_tables(old_meta, user_db, META_TABLES)

    settings = old_user / "user_settings.json"
    if settings.is_file():
        try:
            payload = json.loads(settings.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        conn = sqlite3.connect(user_db)
        conn.execute(
            """
            INSERT INTO app_settings (id, data_json) VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json
            """,
            (json.dumps(payload, indent=2) + "\n",),
        )
        conn.commit()
        conn.close()

    hashes = old_runtime / "model-hashes.json"
    if hashes.is_file():
        try:
            raw = json.loads(hashes.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}
        if isinstance(raw, dict):
            conn = sqlite3.connect(cache_path)
            conn.execute("DELETE FROM model_hashes")
            for key, row in raw.items():
                if not isinstance(row, dict):
                    continue
                conn.execute(
                    """
                    INSERT INTO model_hashes (path, mtime, size, sha256, autov1, autov2, autov3)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(key),
                        int(row.get("mtime") or 0),
                        int(row.get("size") or 0),
                        str(row.get("sha256") or ""),
                        str(row.get("autov1") or ""),
                        str(row.get("autov2") or ""),
                        str(row.get("autov3") or ""),
                    ),
                )
            conn.commit()
            conn.close()

    if old_user.is_dir():
        shutil.rmtree(old_user)
    for name in ("model-hashes.json", "blombo.sqlite", "blombo.sqlite-wal", "blombo.sqlite-shm"):
        path = old_runtime / name
        path.unlink(missing_ok=True)


def _init_schema(path: Path, schema: str) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    conn.commit()
    conn.close()


def _checkpoint(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()


def _copy_tables(src: Path, dest: Path, tables: tuple[str, ...]) -> None:
    conn = sqlite3.connect(dest)
    conn.execute("ATTACH DATABASE ? AS src", (str(src),))
    present = {
        str(row[0])
        for row in conn.execute("SELECT name FROM src.sqlite_master WHERE type = 'table'")
    }
    for name in tables:
        if name not in present:
            continue
        dest_cols = [str(row[1]) for row in conn.execute(f"PRAGMA table_info({name})")]
        src_cols = [str(row[1]) for row in conn.execute(f"PRAGMA src.table_info({name})")]
        cols = [col for col in dest_cols if col in src_cols]
        if not cols:
            continue
        listed = ", ".join(cols)
        conn.execute(f"DELETE FROM {name}")
        conn.execute(f"INSERT INTO {name} ({listed}) SELECT {listed} FROM src.{name}")
    conn.commit()
    conn.execute("DETACH DATABASE src")
    conn.close()


class MigrateUserDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_splits_authored_and_cache_tables(self) -> None:
        old_user = self.tmp / "user" / "user_data"
        old_user.mkdir(parents=True)
        runtime = self.tmp / "runtime" / "data"
        runtime.mkdir(parents=True)

        src = sqlite3.connect(old_user / "blombo.sqlite")
        src.executescript(
            """
            CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, mode TEXT, payload_json TEXT, created_at TEXT);
            CREATE TABLE gallery_items (id TEXT PRIMARY KEY, path TEXT, root TEXT, created_at TEXT);
            CREATE TABLE prompt_tags (tag TEXT PRIMARY KEY, count INTEGER, last_used TEXT);
            CREATE TABLE prompt_tag_state (id INTEGER PRIMARY KEY, prompt TEXT, negative TEXT);
            CREATE TABLE workflow_template_state (workflow TEXT PRIMARY KEY, apply_json TEXT);
            CREATE TABLE workflow_templates (
                workflow TEXT, id TEXT, name TEXT, position INTEGER, params_json TEXT, icon_json TEXT,
                PRIMARY KEY (workflow, id)
            );
            CREATE TABLE thumb_scopes (
                id TEXT PRIMARY KEY, name TEXT, group_name TEXT,
                required_json TEXT, optional_json TEXT, any_groups_json TEXT, exclude_json TEXT, priority INTEGER
            );
            CREATE TABLE schema_version (version INTEGER);
            INSERT INTO jobs VALUES ('j1', 'completed', 'txt2img', '{}', 't');
            INSERT INTO gallery_items VALUES ('g1', '/a.png', '/out', 't');
            INSERT INTO prompt_tags VALUES ('1girl', 3, 't');
            INSERT INTO prompt_tag_state VALUES (1, 'a', 'b');
            INSERT INTO workflow_template_state VALUES ('txt2img', '[]');
            INSERT INTO workflow_templates VALUES ('txt2img', 'p', 'Portrait', 0, '{}', NULL);
            INSERT INTO thumb_scopes VALUES ('s1', 'Fern', '', '[]', '[]', '[]', '[]', 0);
            INSERT INTO schema_version VALUES (7);
            """
        )
        src.close()

        meta = sqlite3.connect(old_user / "model_meta.sqlite")
        meta.executescript(
            """
            CREATE TABLE model_info (
                kind TEXT, ident TEXT, types_json TEXT, modified INTEGER,
                prompt TEXT, negative_prompt TEXT, notes TEXT, strength REAL, slider INTEGER,
                auto_apply INTEGER, apply_at TEXT, PRIMARY KEY (kind, ident)
            );
            CREATE TABLE thumbnail_index (
                kind TEXT, ident TEXT, context TEXT, mtime INTEGER, tags_json TEXT,
                PRIMARY KEY (kind, ident, context)
            );
            INSERT INTO model_info VALUES ('loras', 'a.safetensors', '[]', 1, '', '', 'note', 1.0, 0, NULL, NULL);
            INSERT INTO thumbnail_index VALUES ('loras', 'a.safetensors', 'global', 1, '["x"]');
            """
        )
        meta.close()

        (old_user / "user_settings.json").write_text(
            json.dumps({"theme": "dark", "modelDirs": []}), encoding="utf-8"
        )
        (runtime / "model-hashes.json").write_text(
            json.dumps(
                {
                    "C:/m.safetensors": {
                        "mtime": 1,
                        "size": 2,
                        "sha256": "abc",
                        "autov1": "",
                        "autov2": "abc",
                        "autov3": "",
                    }
                }
            ),
            encoding="utf-8",
        )
        (runtime / "blombo.sqlite").write_bytes(b"stale")
        (runtime / "extra_model_paths.yaml").write_text("keep: 1\n", encoding="utf-8")

        migrate(self.tmp)

        user_db = self.tmp / "user" / "data" / "sqlite" / "blombo.sqlite"
        cache_path = self.tmp / "runtime" / "data" / "sqlite" / "cache.sqlite"
        conn = sqlite3.connect(user_db)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM thumb_scopes").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM prompt_tags").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM model_info").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM thumbnail_index").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM workflow_templates").fetchone()[0], 1)
        settings = json.loads(conn.execute("SELECT data_json FROM app_settings WHERE id = 1").fetchone()[0])
        self.assertEqual(settings["theme"], "dark")
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertNotIn("jobs", tables)
        self.assertNotIn("schema_version", tables)
        conn.close()

        conn = sqlite3.connect(cache_path)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM gallery_items").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM model_hashes").fetchone()[0], 1)
        conn.close()

        self.assertFalse(old_user.exists())
        self.assertFalse((runtime / "model-hashes.json").exists())
        self.assertFalse((runtime / "blombo.sqlite").exists())
        self.assertTrue((runtime / "extra_model_paths.yaml").is_file())


if __name__ == "__main__":
    migrate(ROOT)
    print(f"migrated {ROOT}")
