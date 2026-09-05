from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from features.models.scripts import catalog
from features.models.scripts import hashes
from features.models.scripts import models
from features.wildcards.scripts import wildcards
from infrastructure.storage import cache as cache_db
from infrastructure.storage.repositories import hashes as hashes_repo


class CatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        catalog.clear()
        self.persist = patch("features.models.scripts.catalog.lists_repo.replace_kind")
        self.persist.start()

    def tearDown(self) -> None:
        self.persist.stop()
        catalog.clear()

    def test_relocate_rewrites_file_and_wildcard_tiles(self) -> None:
        catalog.set_kind(
            "wildcards",
            [
                {"path": "people/foo.yaml#a", "source": "people/foo.yaml"},
                {"path": "other.txt", "source": "other.txt"},
            ],
        )
        catalog.relocate("wildcards", "people/foo.yaml", "archive/foo.yaml")
        rows = catalog.peek("wildcards")
        self.assertEqual(rows[0]["path"], "archive/foo.yaml#a")
        self.assertEqual(rows[0]["source"], "archive/foo.yaml")
        self.assertEqual(rows[1]["path"], "other.txt")

    def test_peek_misses_when_dirty(self) -> None:
        catalog.set_kind("loras", [{"path": "a.safetensors"}])
        catalog.invalidate("loras")
        self.assertIsNone(catalog.peek("loras"))


class ListKindTests(unittest.TestCase):
    def setUp(self) -> None:
        catalog.clear()
        self.tmp = TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "loras").mkdir()
        (root / "loras" / "one.safetensors").write_bytes(b"x")
        (root / "loras" / "one_data").mkdir()
        (root / "loras" / "one_data" / "junk.bin").write_bytes(b"y")
        self.patches = [
            patch.object(models, "models_root", return_value=root),
            patch.object(models.dirs, "extra_named", return_value={}),
            patch("features.models.scripts.catalog.lists_repo.replace_kind"),
            patch("features.models.scripts.catalog.lists_repo.load_all", return_value={}),
            patch("features.models.scripts.model_thumb_storage.load_index", return_value={}),
            patch.object(models.model_meta, "reconcile"),
            patch.object(models.model_meta, "user_stamps", return_value={}),
            patch.object(models.model_meta, "all_info", return_value={}),
            patch.object(models.hashes, "load_all", return_value={}),
            patch.object(models.hashes, "entry", return_value={}),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in self.patches:
            item.stop()
        catalog.clear()
        self.tmp.cleanup()

    def test_second_list_uses_catalog(self) -> None:
        first = models.list_kind("loras", force=True)
        self.assertEqual([item["path"] for item in first], ["one.safetensors"])
        with patch.object(models, "_scan_folder", side_effect=AssertionError("rescanned")):
            second = models.list_kind("loras")
        self.assertEqual([item["path"] for item in second], ["one.safetensors"])

    def test_scan_skips_sidecar_data_dirs(self) -> None:
        items, files = models._scan_folder("loras", Path(self.tmp.name) / "loras", models.KINDS["loras"], "")
        self.assertEqual(files, ["one.safetensors"])
        self.assertEqual(len(items), 1)

    def test_thumb_index_loaded_once(self) -> None:
        (Path(self.tmp.name) / "loras" / "two.safetensors").write_bytes(b"z")
        catalog.clear()
        with (
            patch("features.models.scripts.model_thumb_storage.load_index", return_value={}) as loaded,
            patch.object(models.model_thumbs, "ident_index", side_effect=AssertionError("per-file index")),
        ):
            items = models.list_kind("loras", force=True)
        loaded.assert_called_once()
        self.assertEqual(sorted(item["path"] for item in items), ["one.safetensors", "two.safetensors"])


class YamlCacheTests(unittest.TestCase):
    def test_yaml_tree_reuses_mtime_cache(self) -> None:
        with TemporaryDirectory() as temp:
            path = Path(temp) / "tags.yaml"
            path.write_text("colors:\n  - red\n", encoding="utf-8")
            data, err = wildcards.load_yaml(path)
            if err:
                self.skipTest(err)
            wildcards.drop_yaml_cache()
            first = wildcards._yaml_tree(path)
            self.assertEqual(list(first), ["colors"])
            with patch.object(wildcards, "load_yaml", side_effect=AssertionError("parsed again")):
                second = wildcards._yaml_tree(path)
            self.assertEqual(first, second)


class HashRemapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
        ]
        for item in self.patches:
            item.start()
        cache_db.connect()

    def tearDown(self) -> None:
        if cache_db._CONN is not None:
            cache_db._CONN.close()
            cache_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_remap_moved_updates_hash_path(self) -> None:
        src = self.tmp / "old.safetensors"
        dest = self.tmp / "new.safetensors"
        src.write_bytes(b"x")
        old_key = str(src.resolve())
        hashes_repo.replace_all(
            {
                old_key: {
                    "mtime": 1,
                    "size": 1,
                    "sha256": "ab" * 32,
                    "autov1": "v1",
                    "autov2": "v2",
                    "autov3": "v3",
                }
            }
        )
        pairs = hashes.move_pairs(src, dest)
        src.rename(dest)
        hashes.remap_moved(src, dest, pairs)
        self.assertIsNone(hashes_repo.get_by_path(old_key))
        row = hashes_repo.get_by_path(str(dest.resolve()))
        self.assertIsNotNone(row)
        self.assertEqual(row["sha256"], "ab" * 32)
        self.assertEqual(row["autov2"], "v2")
