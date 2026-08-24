from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from blombo import cache_db
from blombo.gallery import cache as gallery_cache, gallery
from blombo.generate import jobs, pnginfo


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class GalleryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if cache_db._CONN is not None:
            cache_db._CONN.close()
            cache_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_retention_keeps_active_and_500_terminal_jobs(self) -> None:
        cache_db.connect()
        for index in range(505):
            cache_db.execute(
                """
                INSERT INTO jobs (id, status, mode, payload_json, created_at, finished_at)
                VALUES (?, 'completed', 'txt2img', '{}', ?, ?)
                """,
                (
                    f"job-{index}",
                    f"2026-01-01T00:{index // 60:02d}:{index % 60:02d}Z",
                    f"2026-01-01T00:{index // 60:02d}:{index % 60:02d}Z",
                ),
            )
        cache_db.execute(
            """
            INSERT INTO jobs (id, status, mode, payload_json, created_at)
            VALUES ('active', 'running', 'txt2img', '{}', '2026-01-02T00:00:00Z')
            """
        )
        jobs._prune_jobs()
        self.assertEqual(cache_db.query_one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'completed'")["n"], 500)
        self.assertIsNotNone(cache_db.query_one("SELECT id FROM jobs WHERE id = 'active'"))

    def test_gallery_scan_rebuilds_and_excludes_grids_from_listing(self) -> None:
        root = self.tmp / "gallery"
        (root / "grids").mkdir(parents=True)
        image_path = root / "image.png"
        grid_path = root / "grids" / "grid.png"
        image_path.write_bytes(_png())
        grid_path.write_bytes(_png())
        with (
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]),
            patch.object(gallery_cache, "outputs_root", return_value=root),
        ):
            gallery_cache.sync()
            rows = gallery_cache.list_rows(hide_interrupted=False)
        self.assertEqual([row["path"] for row in rows], [str(image_path.resolve())])
        all_rows = cache_db.query("SELECT path, asset_kind FROM gallery_items ORDER BY path")
        self.assertEqual([(row["path"], row["asset_kind"]) for row in all_rows], [
            (str(grid_path.resolve()), "grid"),
            (str(image_path.resolve()), "image"),
        ])

    def test_gallery_cache_rebuilds_after_table_loss_and_file_removal(self) -> None:
        root = self.tmp / "gallery"
        root.mkdir()
        image_path = root / "image.png"
        image_path.write_bytes(_png())
        with patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]):
            gallery_cache.sync()
            self.assertEqual(len(gallery_cache.list_rows()), 1)
            cache_db.execute("DROP TABLE gallery_items")
            cache_db._CONN.close()
            cache_db._CONN = None
            cache_db.connect()
            self.assertEqual(len(gallery_cache.list_rows()), 1)
            image_path.unlink()
            gallery_cache.sync()
            self.assertEqual(len(gallery_cache.list_rows()), 0)

    def test_metadata_round_trip_for_supported_formats(self) -> None:
        values = {"prompt": "portrait", "negative_prompt": "blurry", "seed": 42, "workflow": "txt2img"}
        metadata = {
            "version": 1,
            "workflow_id": "txt2img",
            "template_id": "portrait",
            "template_params": {"steps": 24},
            "params": values,
        }
        for fmt in ("png", "jpg", "webp"):
            with self.subTest(fmt=fmt):
                packed = pnginfo.embed(_png(), values, fmt=fmt, metadata=metadata)
                read = pnginfo.read(packed)
                self.assertEqual(read["metadata"]["template_id"], "portrait")
                self.assertEqual(read["metadata"]["params"]["seed"], 42)

    def test_job_restores_gallery_item_from_output_path_and_metadata(self) -> None:
        path = self.tmp / "generated.png"
        values = {
            "prompt": "portrait",
            "negative_prompt": "blurry",
            "seed": 42,
            "width": 16,
            "height": 16,
            "checkpoint": "model.safetensors",
            "workflow_id": "txt2img",
            "template_id": "portrait",
            "template_name": "Portrait",
            "template_params": {"steps": 24},
        }
        path.write_bytes(
            pnginfo.embed(
                _png(),
                values,
                metadata={
                    "version": 1,
                    "asset_kind": "image",
                    "workflow_id": "txt2img",
                    "template_id": "portrait",
                    "template_name": "Portrait",
                    "template_params": {"steps": 24},
                    "params": values,
                },
            )
        )
        ident = gallery_cache.item_id(path)
        cache_db.execute(
            """
            INSERT INTO jobs (id, status, mode, payload_json, created_at)
            VALUES (?, 'completed', 'txt2img', ?, '2026-01-01T00:00:00Z')
            """,
            ("job-1", json.dumps({"outputs": [{"id": ident, "path": str(path)}]})),
        )
        restored = jobs.get_job("job-1")
        self.assertIsNotNone(restored)
        self.assertEqual(restored["gallery_ids"], [ident])
        self.assertEqual(restored["gallery"][0]["template_id"], "portrait")

    def test_thumbnail_cache_sanitizes_path_unsafe_item_ids(self) -> None:
        source = self.tmp / "source.png"
        source.write_bytes(_png())
        with patch.object(gallery, "THUMBS", self.tmp / "thumbs"):
            thumb = gallery._thumb(source, "gallery:abc")
        self.assertEqual(thumb, self.tmp / "thumbs" / "gallery_abc.jpg")
        self.assertTrue(thumb.is_file())


if __name__ == "__main__":
    unittest.main()
