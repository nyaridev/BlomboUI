from __future__ import annotations

import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.storage import user as db
from features.models.scripts import model_meta
from infrastructure.storage.repositories import model_meta as model_meta_db
from features.models.scripts import model_thumb_storage
from features.models.scripts import model_thumbs


def _png() -> bytes:
    image = Image.new("RGB", (8, 8), (20, 80, 160))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class ModelMetaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.new_thumbs = self.tmp / "model_thumbs"
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(model_thumbs, "THUMBS", self.new_thumbs),
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

    def test_relocate_does_not_drop_source_when_dest_is_directory(self) -> None:
        src = self.tmp / "src.png"
        src.write_bytes(_png())
        dest = self.tmp / "dest"
        dest.mkdir()
        model_thumb_storage.relocate(src, dest)
        self.assertFalse(src.exists())
        self.assertTrue((dest / "src.png").is_file())
        self.assertGreater((dest / "src.png").stat().st_size, 0)

    def test_relocate_missing_source_is_ignored(self) -> None:
        dest = self.tmp / "dest.png"
        model_thumb_storage.relocate(self.tmp / "gone.png", dest)
        self.assertFalse(dest.exists())

    def test_move_thumbs_merges_when_dest_folder_already_exists(self) -> None:
        old = "Models_001/Illustrious/Style/LuL1ZS/l1zs_life_is_pi.safetensors"
        new = "External/Illustrious/Style/LuL1ZS/l1zs_life_is_pi.safetensors"
        src = self.new_thumbs / "loras" / Path(old)
        src.mkdir(parents=True)
        (src / "global.jpg").write_bytes(_png())
        dest = self.new_thumbs / "loras" / Path(new)
        dest.mkdir(parents=True)
        model_thumbs.move_thumbs("loras", old, new)
        self.assertFalse(src.exists())
        self.assertTrue((dest / "global.jpg").is_file())
        self.assertFalse((dest / Path(old).name).exists())

    def test_rebuild_index_drops_missing_files(self) -> None:
        model_meta_db.replace_thumb_index(
            {"loras": {"gone.safetensors": {"global": {"mtime": 1, "tags": ["x"]}}}}
        )
        model_thumbs.rebuild_index()
        self.assertEqual(model_thumbs.contexts("loras", "gone.safetensors"), {})

    def test_lora_auto_fields_keep_independent_inheritance(self) -> None:
        self.assertIsNone(model_meta.get_info("loras", "style.safetensors")["auto_apply"])
        self.assertIsNone(model_meta.get_info("loras", "style.safetensors")["apply_at"])

        model_meta.set_info("loras", "style.safetensors", [], auto_apply=False)
        self.assertFalse(model_meta.get_info("loras", "style.safetensors")["auto_apply"])
        self.assertIsNone(model_meta.get_info("loras", "style.safetensors")["apply_at"])

        model_meta.set_info("loras", "style.safetensors", [], apply_at="end")
        info = model_meta.get_info("loras", "style.safetensors")
        self.assertFalse(info["auto_apply"])
        self.assertEqual(info["apply_at"], "end")

        model_meta.set_info("loras", "style.safetensors", [], auto_apply=None)
        info = model_meta.get_info("loras", "style.safetensors")
        self.assertIsNone(info["auto_apply"])
        self.assertEqual(info["apply_at"], "end")


if __name__ == "__main__":
    unittest.main()
