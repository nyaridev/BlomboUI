from __future__ import annotations

import json
import shutil
import tempfile
import threading
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import cache as cache_db
from infrastructure.storage import cache_gallery as gallery_db
from features.gallery.scripts import cache as gallery_cache, gallery
from features.generate.scripts import jobs
from shared import pnginfo


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _v2(created_at: str = "2026-01-01T00:00:00.000Z", asset_kind: str = "image", **values) -> dict:
    params = {
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
        "prompt_raw": str(values["prompt_raw"] if "prompt_raw" in values else values.get("prompt") or ""),
        "negative_prompt_raw": str(
            values["negative_prompt_raw"] if "negative_prompt_raw" in values else values.get("negative_prompt") or ""
        ),
        "steps": values.get("steps"),
        "cfg": values.get("cfg"),
        "seed": values.get("seed"),
        "sampler": str(values.get("sampler") or ""),
        "scheduler": str(values.get("scheduler") or ""),
        "width": values.get("width"),
        "height": values.get("height"),
        "models": list(values.get("models") or []),
    }
    return {
        "version": 2,
        "asset_kind": asset_kind,
        "created_at": created_at,
        "job_id": str(values.get("job_id") or ""),
        "workflow_id": str(values.get("workflow_id") or values.get("workflow") or ""),
        "template_id": str(values.get("template_id") or ""),
        "template_name": str(values.get("template_name") or ""),
        "template_params": values.get("template_params") if isinstance(values.get("template_params"), dict) else {},
        "params": params,
    }


def _write_v2(path: Path, created_at: str = "2026-01-01T00:00:00.000Z", **values) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = _v2(created_at, **values)
    path.write_bytes(pnginfo.embed(_png(), meta["params"], metadata=meta))
    return path


class GalleryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
            patch.object(gallery_db, "_CONN", None),
            patch.object(gallery_db, "db_path", return_value=self.tmp / "cache_gallery.sqlite"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if cache_db._CONN is not None:
            cache_db._CONN.close()
            cache_db._CONN = None
        if gallery_db._CONN is not None:
            gallery_db._CONN.close()
            gallery_db._CONN = None
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
        image_path = _write_v2(root / "image.png", prompt="still")
        grid_path = _write_v2(root / "grids" / "grid.png", prompt="sheet", asset_kind="grid")
        with (
            patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]),
            patch.object(gallery_cache, "outputs_root", return_value=root),
        ):
            gallery_cache.sync()
            rows = gallery_cache.list_rows(hide_interrupted=False)
        self.assertEqual([row["path"] for row in rows], [str(image_path.resolve())])
        all_rows = gallery_db.query("SELECT path, asset_kind FROM gallery_items ORDER BY path")
        self.assertEqual([(row["path"], row["asset_kind"]) for row in all_rows], [
            (str(grid_path.resolve()), "grid"),
            (str(image_path.resolve()), "image"),
        ])

    def test_gallery_cache_rebuilds_after_table_loss_and_file_removal(self) -> None:
        root = self.tmp / "gallery"
        root.mkdir()
        image_path = _write_v2(root / "image.png", prompt="still")
        with patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]):
            gallery_cache.sync()
            self.assertEqual(len(gallery_cache.list_rows()), 1)
            gallery_db.execute("DROP TABLE gallery_items")
            gallery_db._CONN.close()
            gallery_db._CONN = None
            gallery_db.connect()
            gallery_cache.sync()
            self.assertEqual(len(gallery_cache.list_rows()), 1)
            image_path.unlink()
            gallery_cache.sync()
            self.assertEqual(len(gallery_cache.list_rows()), 0)

    def test_metadata_round_trip_for_supported_formats(self) -> None:
        metadata = _v2(
            prompt="portrait",
            negative_prompt="blurry",
            seed=42,
            workflow="txt2img",
            template_id="portrait",
            template_params={"steps": 24},
        )
        for fmt in ("png", "jpg", "webp"):
            with self.subTest(fmt=fmt):
                packed = pnginfo.embed(_png(), metadata["params"], fmt=fmt, metadata=metadata)
                read = pnginfo.read(packed)
                self.assertEqual(read["metadata"]["template_id"], "portrait")
                self.assertEqual(read["metadata"]["params"]["seed"], 42)
                self.assertEqual(read["metadata"]["version"], 2)

    def test_job_restores_gallery_item_from_output_path_and_metadata(self) -> None:
        path = self.tmp / "generated.png"
        _write_v2(
            path,
            prompt="portrait",
            negative_prompt="blurry",
            seed=42,
            width=16,
            height=16,
            workflow_id="txt2img",
            template_id="portrait",
            template_name="Portrait",
            template_params={"steps": 24},
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

    def test_ingest_skips_missing_and_old_blobs(self) -> None:
        root = self.tmp / "gallery"
        root.mkdir()
        bare = root / "bare.png"
        bare.write_bytes(_png())
        old = root / "old.png"
        old.write_bytes(
            pnginfo.embed(
                _png(),
                {"prompt": "legacy", "checkpoint": "model.safetensors", "loras": [{"lora": "a.safetensors"}]},
                metadata={
                    "version": 1,
                    "asset_kind": "image",
                    "params": {"prompt": "legacy", "checkpoint": "model.safetensors"},
                },
            )
        )
        with patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]):
            self.assertIsNone(gallery_cache.ingest(bare))
            self.assertIsNone(gallery_cache.ingest(old))
            ident = gallery_cache.item_id(old)
            gallery_db.execute(
                """
                INSERT INTO gallery_items (
                    id, path, root, asset_kind, media_kind, size, mtime_ns,
                    prompt, negative_prompt, params_json, created_at
                ) VALUES (?, ?, ?, 'image', 'image', 1, 1, 'legacy', '', '{"checkpoint":"old"}', '2026-01-01T00:00:00Z')
                """,
                (ident, str(old.resolve()), str(root.resolve())),
            )
            self.assertEqual(len(gallery_cache.list_rows()), 1)
            gallery_cache.sync()
            self.assertEqual(gallery_cache.list_rows(), [])

    def test_sync_does_not_reopen_cached_invalid_files(self) -> None:
        root = self.tmp / "gallery"
        root.mkdir()
        bare = root / "bare.png"
        bare.write_bytes(_png())
        with patch.object(gallery_cache.dirs, "gallery_roots", return_value=[root]):
            gallery_cache.sync()
            self.assertEqual(gallery_cache.list_rows(), [])
            with patch.object(pnginfo, "read_path") as peek:
                gallery_cache.sync()
                peek.assert_not_called()
            self.assertEqual(gallery_cache.list_rows(), [])

    def test_start_sync_returns_without_waiting(self) -> None:
        started = threading.Event()
        block = threading.Event()

        def hang() -> None:
            started.set()
            block.wait(1)

        with patch.object(gallery_cache, "sync", hang):
            busy = gallery_cache.start_sync()
            self.assertTrue(busy)
            self.assertTrue(started.wait(1))
            self.assertTrue(gallery_cache.start_sync())
            block.set()

    def test_thumbnail_cache_sanitizes_path_unsafe_item_ids(self) -> None:
        source = self.tmp / "source.png"
        source.write_bytes(_png())
        with (
            patch.object(gallery, "THUMBS", self.tmp / "thumbs"),
            patch("features.settings.service.load", return_value={}),
        ):
            thumb = gallery._thumb(source, "gallery:abc")
        self.assertEqual(thumb, self.tmp / "thumbs" / "gallery_abc_50_jpg_webp_85.jpg")
        self.assertTrue(thumb.is_file())
        with Image.open(thumb) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (16, 16))

    def test_thumbnail_fits_megapixels(self) -> None:
        source = self.tmp / "big.png"
        Image.new("RGB", (2000, 2000), (20, 80, 160)).save(source)
        with (
            patch.object(gallery, "THUMBS", self.tmp / "thumbs"),
            patch("features.settings.service.load", return_value={}),
        ):
            thumb = gallery._thumb(source, "big")
        self.assertTrue(thumb and thumb.is_file())
        with Image.open(thumb) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertLessEqual(image.size[0] * image.size[1], 500_000)


if __name__ == "__main__":
    unittest.main()
