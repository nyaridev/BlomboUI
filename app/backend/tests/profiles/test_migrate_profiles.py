from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


def _load_migrate():
    path = Path(__file__).resolve().parents[2] / "scripts" / "migrate_profiles.py"
    spec = importlib.util.spec_from_file_location("migrate_profiles", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MigrateProfilesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.mod = _load_migrate()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_moves_sqlite_thumbs_and_output(self) -> None:
        user = self.tmp / "user"
        runtime = self.tmp / "runtime"
        sqlite = user / "data" / "sqlite"
        sqlite.mkdir(parents=True)
        (sqlite / "blombo.sqlite").write_text("user-db", encoding="utf-8")
        cache = runtime / "data" / "sqlite"
        cache.mkdir(parents=True)
        (cache / "cache.sqlite").write_text("cache-db", encoding="utf-8")
        (cache / "cache_gallery.sqlite").write_text("gallery-db", encoding="utf-8")
        thumbs = user / "gallery_thumbs"
        thumbs.mkdir(parents=True)
        (thumbs / "a.jpg").write_bytes(b"jpg")
        history = user / "data" / "history" / "download"
        history.mkdir(parents=True)
        (history / "h.jpg").write_bytes(b"jpg")
        out = user / "output"
        out.mkdir(parents=True)
        (out / "pic.png").write_bytes(b"png")

        result = self.mod.migrate(self.tmp)
        self.assertEqual(result, "ok")
        self.assertTrue((sqlite / "profile.sqlite").is_file())
        self.assertEqual((sqlite / "default" / "blombo.sqlite").read_text(encoding="utf-8"), "user-db")
        self.assertFalse((sqlite / "blombo.sqlite").exists())
        self.assertEqual((cache / "default" / "cache.sqlite").read_text(encoding="utf-8"), "cache-db")
        self.assertTrue((runtime / "data" / "gallery_thumbs" / "default" / "a.jpg").is_file())
        self.assertFalse(thumbs.exists())
        self.assertTrue((user / "data" / "history_thumbs" / "default" / "download" / "h.jpg").is_file())
        self.assertFalse((user / "data" / "history").exists())
        self.assertTrue((out / "default" / "pic.png").is_file())
        self.assertEqual(self.mod.migrate(self.tmp), "skip: profile.sqlite already exists")

    def test_rewrites_gallery_item_paths(self) -> None:
        import sqlite3

        user = self.tmp / "user"
        runtime = self.tmp / "runtime"
        out = user / "output"
        out.mkdir(parents=True)
        (out / "pic.png").write_bytes(b"png")
        cache = runtime / "data" / "sqlite"
        cache.mkdir(parents=True)
        db = cache / "cache_gallery.sqlite"
        old_root = str(out)
        old_path = str(out / "pic.png")
        conn = sqlite3.connect(db)
        conn.executescript(
            """
            CREATE TABLE gallery_items (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                root TEXT NOT NULL,
                asset_kind TEXT NOT NULL DEFAULT 'image',
                media_kind TEXT NOT NULL DEFAULT 'image',
                size INTEGER NOT NULL DEFAULT 0,
                mtime_ns INTEGER NOT NULL DEFAULT 0,
                prompt TEXT,
                negative_prompt TEXT,
                params_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE gallery_seen (
                path TEXT PRIMARY KEY,
                size INTEGER NOT NULL DEFAULT 0,
                mtime_ns INTEGER NOT NULL DEFAULT 0,
                ok INTEGER NOT NULL DEFAULT 0
            );
            """
        )
        conn.execute(
            "INSERT INTO gallery_items (id, path, root, prompt, negative_prompt, created_at) VALUES (?, ?, ?, '', '', '2026-01-01T00:00:00Z')",
            ("gallery:1", old_path, old_root),
        )
        conn.execute("INSERT INTO gallery_seen (path, size, mtime_ns, ok) VALUES (?, 1, 1, 1)", (old_path,))
        conn.commit()
        conn.close()

        self.assertEqual(self.mod.migrate(self.tmp), "ok")
        moved = sqlite3.connect(cache / "default" / "cache_gallery.sqlite")
        row = moved.execute("SELECT path, root FROM gallery_items WHERE id = 'gallery:1'").fetchone()
        seen = moved.execute("SELECT path FROM gallery_seen").fetchone()
        moved.close()
        new_root = out / "default"
        self.assertEqual(Path(row[0]), new_root / "pic.png")
        self.assertEqual(Path(row[1]), new_root)
        self.assertEqual(Path(seen[0]), new_root / "pic.png")
        self.assertTrue((new_root / "pic.png").is_file())

    def test_keeps_custom_output_root(self) -> None:
        user = self.tmp / "user"
        runtime = self.tmp / "runtime"
        sqlite = user / "data" / "sqlite"
        sqlite.mkdir(parents=True)
        db = sqlite / "blombo.sqlite"
        import sqlite3

        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE app_settings (id INTEGER PRIMARY KEY, data_json TEXT NOT NULL)")
        conn.execute("INSERT INTO app_settings (id, data_json) VALUES (1, '{}')")
        conn.commit()
        conn.close()
        custom = self.tmp / "elsewhere"
        custom.mkdir()
        env = runtime / "data"
        env.mkdir(parents=True)
        (env / "launcher-env.json").write_text(
            json.dumps({"outputs.root": str(custom)}),
            encoding="utf-8",
        )
        self.mod.migrate(self.tmp)
        conn = sqlite3.connect(sqlite / "default" / "blombo.sqlite")
        raw = conn.execute("SELECT data_json FROM app_settings WHERE id = 1").fetchone()[0]
        conn.close()
        data = json.loads(raw)
        self.assertEqual(data["outputRoot"], str(custom))
        self.assertTrue(custom.is_dir())


if __name__ == "__main__":
    unittest.main()
