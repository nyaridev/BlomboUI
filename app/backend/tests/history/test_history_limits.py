from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infrastructure.storage import user as db
from features.downloads.scripts import history as download_history
from features.history import service as browse_history


class HistoryLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch("features.history.service.prefetch"),
            patch("features.history.service.delete_thumbs"),
            patch("features.history.service.clear_thumbs"),
            patch("features.downloads.scripts.thumbs.delete_thumbs"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_browse_upsert_and_trim(self) -> None:
        with patch("features.settings.service.load", return_value={"browseHistoryLimit": 2}):
            first = browse_history.record({"modelId": 1, "name": "One", "imageUrl": "http://a"})
            second = browse_history.record({"modelId": 2, "name": "Two"})
            again = browse_history.record({"modelId": 1, "name": "One again"})
            third = browse_history.record({"modelId": 3, "name": "Three"})
        items = browse_history.list_items()
        ids = [item["modelId"] for item in items]
        self.assertEqual(ids, [3, 1])
        self.assertEqual(again["id"], first["id"])
        self.assertNotIn(second["id"], [item["id"] for item in items])
        self.assertEqual(items[0]["id"], third["id"])

    def test_browse_unlimited(self) -> None:
        with patch("features.settings.service.load", return_value={"browseHistoryLimit": -1}):
            for ident in range(1, 6):
                browse_history.record({"modelId": ident, "name": str(ident)})
        self.assertEqual(len(browse_history.list_items()), 5)

    def test_download_trim_skips_in_progress(self) -> None:
        with patch("features.settings.service.load", return_value={"downloadHistoryLimit": 1}):
            live = download_history.record(
                source="civitai",
                model_id=1,
                version_id=1,
                file_id=None,
                name="Live",
                version_name="",
                kind="loras",
                creator="",
                file_name="a.safetensors",
                size_bytes=1,
                paths=[],
                image_url="",
                site="civitai",
                status="downloading",
            )
            done_a = download_history.record(
                source="civitai",
                model_id=2,
                version_id=1,
                file_id=None,
                name="Done A",
                version_name="",
                kind="loras",
                creator="",
                file_name="b.safetensors",
                size_bytes=1,
                paths=[],
                image_url="",
                site="civitai",
                status="done",
            )
            done_b = download_history.record(
                source="civitai",
                model_id=3,
                version_id=1,
                file_id=None,
                name="Done B",
                version_name="",
                kind="loras",
                creator="",
                file_name="c.safetensors",
                size_bytes=1,
                paths=[],
                image_url="",
                site="civitai",
                status="done",
            )
        items = download_history.list_items()
        ids = [item["id"] for item in items]
        self.assertIn(done_b, ids)
        self.assertNotIn(done_a, ids)
        self.assertIsNotNone(download_history.get(live))
