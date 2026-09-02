from __future__ import annotations

import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import cache_gallery as gallery_db
from infrastructure.storage import user as user_db
from features.gallery.scripts import cache as gallery_cache
from features.gallery.scripts import removed, search
from shared import pnginfo


def _png(size: tuple[int, int] = (16, 16)) -> bytes:
    image = Image.new("RGB", size, (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _write(path: Path, prompt: str = "cat") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "version": 2,
        "asset_kind": "image",
        "created_at": "2026-01-01T00:00:00.000Z",
        "params": {
            "prompt": prompt,
            "negative_prompt": "",
            "prompt_raw": prompt,
            "negative_prompt_raw": "",
            "steps": None,
            "cfg": None,
            "seed": None,
            "sampler": "",
            "scheduler": "",
            "width": 16,
            "height": 16,
            "models": [],
        },
    }
    path.write_bytes(pnginfo.embed(_png(), meta["params"], metadata=meta))
    return path


class GalleryRemovedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.root = (self.tmp / "gallery").resolve()
        self.root.mkdir()
        self.trash = self.tmp / "removed"
        self.patches = [
            patch.object(gallery_db, "_CONN", None),
            patch.object(gallery_db, "db_path", return_value=self.tmp / "cache_gallery.sqlite"),
            patch.object(user_db, "_CONN", None),
            patch.object(user_db, "db_path", return_value=self.tmp / "user.sqlite"),
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[self.root]),
            patch.object(removed, "REMOVED", self.trash),
            patch("features.settings.service.load", return_value={"galleryHideInterrupted": True}),
        ]
        for item in self.patches:
            item.start()
        gallery_db.connect()
        user_db.connect()

    def tearDown(self) -> None:
        if gallery_db._CONN is not None:
            gallery_db._CONN.close()
            gallery_db._CONN = None
        if user_db._CONN is not None:
            user_db._CONN.close()
            user_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_remove_and_restore_keeps_favorite(self) -> None:
        from features.gallery.scripts import gallery as gallery_items

        path = _write(self.root / "star.png")
        row = gallery_cache.ingest(path)
        assert row is not None
        gallery_items.set_favorite(row["id"], True)
        ident = row["id"]
        trash = removed.remove_gallery_item(ident)
        self.assertEqual(trash["count"], 1)
        self.assertFalse(path.is_file())
        self.assertEqual(search.search()["items"], [])
        listed = removed.list_items()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["kind"], "gallery")
        self.assertTrue(listed[0]["thumb"])
        restored = removed.restore(listed[0]["id"])
        self.assertEqual(restored["kind"], "gallery")
        self.assertTrue(path.is_file())
        found = search.search()["items"]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["id"], ident)
        self.assertTrue(found[0]["favorite"])

    def test_purge_all_kind_splits_gallery_from_models(self) -> None:
        path = _write(self.root / "gone.png")
        row = gallery_cache.ingest(path)
        assert row is not None
        removed.remove_gallery_item(row["id"])
        other = self.trash / "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        other.mkdir(parents=True)
        (other / "manifest.json").write_text(
            '{"kind": "loras", "ident": "x", "name": "x.safetensors", "removed_at": 1, "size": 1}\n',
            encoding="utf-8",
        )
        self.assertEqual(removed.purge_all("gallery"), 1)
        leftover = removed.list_items()
        self.assertEqual(len(leftover), 1)
        self.assertEqual(leftover[0]["kind"], "loras")
        self.assertEqual(removed.purge_all("models"), 1)
        self.assertEqual(removed.list_items(), [])


if __name__ == "__main__":
    unittest.main()
