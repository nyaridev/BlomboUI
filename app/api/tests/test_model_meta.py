from __future__ import annotations

import shutil
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from blombo import model_meta_db, model_thumbs


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
            patch.object(model_meta_db, "_CONN", None),
            patch.object(model_meta_db, "db_path", return_value=self.tmp / "model_meta.sqlite"),
            patch.object(model_thumbs, "THUMBS", self.new_thumbs),
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

    def test_relocate_does_not_drop_source_when_dest_is_directory(self) -> None:
        src = self.tmp / "src.png"
        src.write_bytes(_png())
        dest = self.tmp / "dest"
        dest.mkdir()
        model_thumbs._relocate(src, dest)
        self.assertFalse(src.exists())
        self.assertTrue((dest / "src.png").is_file())
        self.assertGreater((dest / "src.png").stat().st_size, 0)

    def test_relocate_missing_source_is_ignored(self) -> None:
        dest = self.tmp / "dest.png"
        model_thumbs._relocate(self.tmp / "gone.png", dest)
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


if __name__ == "__main__":
    unittest.main()
