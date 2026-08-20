from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from blombo import db, gallery, gallery_cache, jobs, pnginfo


def _png() -> bytes:
    image = Image.new("RGB", (16, 16), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class GalleryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(db, "_migrate_legacy_db"),
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

    def test_migrate_generations_to_gallery_and_job_outputs(self) -> None:
        path = self.tmp / "image.png"
        path.write_bytes(_png())
        legacy = self.tmp / "blombo.sqlite"
        conn = sqlite3.connect(legacy)
        conn.executescript(
            """
            CREATE TABLE schema_version (version INTEGER NOT NULL);
            INSERT INTO schema_version VALUES (5);
            CREATE TABLE jobs (
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
            CREATE TABLE generations (
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
        )
        conn.execute(
            "INSERT INTO jobs VALUES (?, 'completed', 'txt2img', ?, NULL, NULL, ?, NULL, ?)",
            ("job-1", "{}", "2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z"),
        )
        conn.execute(
            "INSERT INTO generations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "legacy-1",
                "job-1",
                str(path),
                str(self.tmp),
                16,
                16,
                42,
                "model.safetensors",
                "prompt",
                "negative",
                json.dumps({"prompt": "prompt", "seed": 42}),
                "2026-01-01T00:00:01Z",
                0,
            ),
        )
        conn.commit()
        conn.close()

        db.connect()
        row = db.query_one("SELECT * FROM gallery_items WHERE id = ?", ("legacy-1",))
        self.assertIsNotNone(row)
        self.assertEqual(row["path"], str(path))
        columns = {
            str(item["name"])
            for item in db.query("PRAGMA table_info(gallery_items)")
        }
        self.assertNotIn("legacy_id", columns)
        job = db.query_one("SELECT payload_json FROM jobs WHERE id = ?", ("job-1",))
        self.assertIsNotNone(job)
        outputs = json.loads(job["payload_json"])["outputs"]
        self.assertEqual(outputs[0]["id"], "legacy-1")
        self.assertFalse(db.query("SELECT name FROM sqlite_master WHERE name = 'generations'"))

    def test_retention_keeps_active_and_500_terminal_jobs(self) -> None:
        db.connect()
        for index in range(505):
            db.execute(
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
        db.execute(
            """
            INSERT INTO jobs (id, status, mode, payload_json, created_at)
            VALUES ('active', 'running', 'txt2img', '{}', '2026-01-02T00:00:00Z')
            """
        )
        jobs._prune_jobs()
        self.assertEqual(db.query_one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'completed'")["n"], 500)
        self.assertIsNotNone(db.query_one("SELECT id FROM jobs WHERE id = 'active'"))

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
        all_rows = db.query("SELECT path, asset_kind FROM gallery_items ORDER BY path")
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
            db.execute("DROP TABLE gallery_items")
            db._CONN.close()
            db._CONN = None
            db.connect()
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
        db.execute(
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
