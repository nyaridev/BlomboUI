from __future__ import annotations

import sqlite3
import shutil
import tempfile
import unittest
from pathlib import Path

from infrastructure.storage import cache_gallery as gallery_db
from config import ROOT

GALLERY_TABLES = (
    "gallery_items",
    "gallery_item_tags",
    "gallery_item_loras",
    "gallery_item_wildcards",
    "gallery_seen",
)
DROP_TABLES = (
    "gallery_item_tags",
    "gallery_item_loras",
    "gallery_item_wildcards",
    "gallery_items",
    "gallery_seen",
)


def migrate(root: Path) -> None:
    cache_path = root / "runtime" / "data" / "sqlite" / "cache.sqlite"
    gallery_path = root / "runtime" / "data" / "sqlite" / "cache_gallery.sqlite"
    if not cache_path.is_file():
        return
    gallery_path.parent.mkdir(parents=True, exist_ok=True)
    _checkpoint(cache_path)
    _init_schema(gallery_path, gallery_db.SCHEMA)
    _copy_tables(cache_path, gallery_path, GALLERY_TABLES)
    _drop_tables(cache_path, DROP_TABLES)


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


def _drop_tables(path: Path, tables: tuple[str, ...]) -> None:
    conn = sqlite3.connect(path)
    for name in tables:
        conn.execute(f"DROP TABLE IF EXISTS {name}")
    conn.commit()
    conn.close()


class MigrateGalleryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_copies_gallery_tables_and_drops_from_cache(self) -> None:
        cache_path = self.tmp / "runtime" / "data" / "sqlite" / "cache.sqlite"
        cache_path.parent.mkdir(parents=True)
        src = sqlite3.connect(cache_path)
        src.executescript(
            """
            CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, mode TEXT, payload_json TEXT, created_at TEXT);
            CREATE TABLE gallery_items (
                id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, root TEXT NOT NULL,
                asset_kind TEXT NOT NULL DEFAULT 'image', media_kind TEXT NOT NULL DEFAULT 'image',
                size INTEGER NOT NULL DEFAULT 0, mtime_ns INTEGER NOT NULL DEFAULT 0,
                prompt TEXT, negative_prompt TEXT, params_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE gallery_item_tags (
                item_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (item_id, tag)
            );
            CREATE TABLE gallery_item_loras (
                item_id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (item_id, name)
            );
            CREATE TABLE gallery_item_wildcards (
                item_id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (item_id, name)
            );
            CREATE TABLE gallery_seen (
                path TEXT PRIMARY KEY, size INTEGER NOT NULL DEFAULT 0,
                mtime_ns INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO jobs VALUES ('j1', 'completed', 'txt2img', '{}', 't');
            INSERT INTO gallery_items (
                id, path, root, asset_kind, media_kind, size, mtime_ns, prompt, negative_prompt, params_json, created_at
            ) VALUES ('g1', '/a.png', '/out', 'image', 'image', 1, 1, 'cat', '', '{}', 't');
            INSERT INTO gallery_item_tags VALUES ('g1', '1girl');
            INSERT INTO gallery_item_loras VALUES ('g1', 'style.safetensors');
            INSERT INTO gallery_item_wildcards VALUES ('g1', 'outfit');
            INSERT INTO gallery_seen VALUES ('/a.png', 1, 1, 1);
            """
        )
        src.close()

        migrate(self.tmp)

        cache = sqlite3.connect(cache_path)
        tables = {row[0] for row in cache.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertEqual(cache.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 1)
        self.assertNotIn("gallery_items", tables)
        self.assertNotIn("gallery_seen", tables)
        cache.close()

        dest = sqlite3.connect(self.tmp / "runtime" / "data" / "sqlite" / "cache_gallery.sqlite")
        self.assertEqual(dest.execute("SELECT COUNT(*) FROM gallery_items").fetchone()[0], 1)
        self.assertEqual(dest.execute("SELECT prompt FROM gallery_items WHERE id = 'g1'").fetchone()[0], "cat")
        self.assertEqual(dest.execute("SELECT tag FROM gallery_item_tags").fetchone()[0], "1girl")
        self.assertEqual(dest.execute("SELECT name FROM gallery_item_loras").fetchone()[0], "style.safetensors")
        self.assertEqual(dest.execute("SELECT name FROM gallery_item_wildcards").fetchone()[0], "outfit")
        self.assertEqual(dest.execute("SELECT ok FROM gallery_seen").fetchone()[0], 1)
        dest.close()

    def test_copies_items_without_media_kind(self) -> None:
        cache_path = self.tmp / "runtime" / "data" / "sqlite" / "cache.sqlite"
        cache_path.parent.mkdir(parents=True)
        src = sqlite3.connect(cache_path)
        src.executescript(
            """
            CREATE TABLE gallery_items (
                id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, root TEXT NOT NULL,
                asset_kind TEXT NOT NULL DEFAULT 'image', size INTEGER NOT NULL DEFAULT 0,
                mtime_ns INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO gallery_items VALUES ('g1', '/a.png', '/out', 'image', 1, 1, 't', 0);
            """
        )
        src.close()

        migrate(self.tmp)

        dest = sqlite3.connect(self.tmp / "runtime" / "data" / "sqlite" / "cache_gallery.sqlite")
        cols = {row[1] for row in dest.execute("PRAGMA table_info(gallery_items)")}
        self.assertIn("media_kind", cols)
        row = dest.execute("SELECT media_kind FROM gallery_items WHERE id = 'g1'").fetchone()
        self.assertEqual(row[0], "image")
        dest.close()

    def test_noop_when_already_split(self) -> None:
        folder = self.tmp / "runtime" / "data" / "sqlite"
        folder.mkdir(parents=True)
        cache_path = folder / "cache.sqlite"
        src = sqlite3.connect(cache_path)
        src.executescript(
            "CREATE TABLE jobs (id TEXT PRIMARY KEY); INSERT INTO jobs VALUES ('j1');"
        )
        src.close()
        dest_path = folder / "cache_gallery.sqlite"
        dest = sqlite3.connect(dest_path)
        dest.executescript(gallery_db.SCHEMA)
        dest.execute(
            """
            INSERT INTO gallery_items (
                id, path, root, asset_kind, media_kind, size, mtime_ns, params_json, created_at
            ) VALUES ('g1', '/a.png', '/out', 'image', 'image', 1, 1, '{}', 't')
            """
        )
        dest.commit()
        dest.close()

        migrate(self.tmp)

        cache = sqlite3.connect(cache_path)
        self.assertEqual(cache.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 1)
        cache.close()
        dest = sqlite3.connect(dest_path)
        self.assertEqual(dest.execute("SELECT COUNT(*) FROM gallery_items").fetchone()[0], 1)
        dest.close()


if __name__ == "__main__":
    migrate(ROOT)
    print(f"migrated {ROOT}")
