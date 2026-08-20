from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from blombo import model_meta, model_meta_db, model_thumbs


def _png() -> bytes:
    image = Image.new("RGB", (8, 8), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class ModelMetaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.legacy_root = self.tmp / "model_meta"
        self.data = self.legacy_root / "data"
        self.new_thumbs = self.tmp / "model_thumbs"
        self.patches = [
            patch.object(model_meta_db, "_CONN", None),
            patch.object(model_meta_db, "db_path", return_value=self.tmp / "model_meta.sqlite"),
            patch.object(model_meta, "_migrated", False),
            patch.object(model_meta, "ROOT", self.legacy_root),
            patch.object(model_meta, "DATA", self.data),
            patch.object(model_thumbs, "ROOT", self.new_thumbs),
            patch.object(model_thumbs, "THUMBS", self.new_thumbs),
            patch.object(model_thumbs, "LEGACY_ROOT", self.legacy_root / "thumbnails"),
            patch.object(model_thumbs, "INDEX", self.data / "thumbs.json"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if model_meta_db._CONN is not None:
            model_meta_db._CONN.close()
            model_meta_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_model_info_json_migrates_to_separate_sqlite(self) -> None:
        source = self.data / "loras.json"
        source.parent.mkdir(parents=True)
        source.write_text(
            json.dumps(
                {
                    "char.safetensors": {
                        "types": ["Illustrious"],
                        "modified": 42,
                        "prompt": "character",
                        "notes": "note",
                    }
                }
            ),
            encoding="utf-8",
        )

        info = model_meta.get_info("loras", "char.safetensors")

        self.assertEqual(info["types"], ["Illustrious"])
        self.assertEqual(info["prompt"], "character")
        self.assertFalse(source.exists())
        self.assertTrue((self.tmp / "model_meta.sqlite").is_file())
        self.assertEqual(
            model_meta_db.query_one("SELECT COUNT(*) AS count FROM model_info")["count"],
            1,
        )

    def test_thumbnail_files_and_index_move_to_new_root_and_sqlite(self) -> None:
        old_file = self.legacy_root / "thumbnails" / "loras" / "char.safetensors" / "global.png"
        old_file.parent.mkdir(parents=True)
        old_file.write_bytes(_png())
        index = self.data / "thumbs.json"
        index.parent.mkdir(parents=True, exist_ok=True)
        index.write_text(
            json.dumps(
                {
                    "loras": {
                        "char.safetensors": {
                            "global": {"mtime": 42, "tags": ["character"]}
                        }
                    }
                }
            ),
            encoding="utf-8",
        )

        model_thumbs.migrate()

        current = self.new_thumbs / "loras" / "char.safetensors" / "global.png"
        self.assertTrue(current.is_file())
        self.assertFalse(old_file.exists())
        self.assertFalse(index.exists())
        self.assertIn("global", model_thumbs.contexts("loras", "char.safetensors"))

    def test_relocate_does_not_drop_source_when_dest_is_directory(self) -> None:
        src = self.tmp / "src.png"
        src.write_bytes(_png())
        dest = self.tmp / "dest"
        dest.mkdir()
        model_thumbs._relocate(src, dest)
        self.assertFalse(src.exists())
        self.assertTrue((dest / "src.png").is_file())
        self.assertGreater((dest / "src.png").stat().st_size, 0)

    def test_rebuild_index_drops_missing_files(self) -> None:
        model_meta_db.replace_thumb_index(
            {"loras": {"gone.safetensors": {"global": {"mtime": 1, "tags": ["x"]}}}}
        )
        model_thumbs.rebuild_index()
        self.assertEqual(model_thumbs.contexts("loras", "gone.safetensors"), {})


if __name__ == "__main__":
    unittest.main()
