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
from features.models.scripts import model_sidecar
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
        self.files = self.tmp / "files"
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(model_sidecar, "FILES", self.files),
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
        src = model_sidecar.data_dir("loras", old)
        assert src is not None
        (src / "thumbs").mkdir(parents=True)
        (src / "thumbs" / "global.jpg").write_bytes(_png())
        dest = model_sidecar.data_dir("loras", new)
        assert dest is not None
        dest.mkdir(parents=True)
        model_thumbs.move_thumbs("loras", old, new)
        self.assertFalse(src.exists())
        self.assertTrue((dest / "thumbs" / "global.jpg").is_file())
        self.assertFalse((dest / "thumbs" / Path(old).name).exists())

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

    def test_set_info_writes_sidecar_json(self) -> None:
        import json

        model = self.files / "loras" / "style.safetensors"
        model.parent.mkdir(parents=True)
        model.write_bytes(b"x")
        model_meta.set_info("loras", "style.safetensors", ["Pony"], notes="hello", prompt="tag")
        path = model_sidecar.json_path("loras", "style.safetensors")
        self.assertTrue(path and path.is_file())
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data["info"]["notes"], "hello")
        self.assertEqual(data["info"]["prompt"], "tag")
        self.assertEqual(data["info"]["types"], ["Pony"])

    def test_restore_rematch_creates_missing_scope(self) -> None:
        from features.models.scripts import thumbnail_scopes

        model = self.files / "loras" / "char.safetensors"
        model.parent.mkdir(parents=True)
        model.write_bytes(b"x")
        ruby = thumbnail_scopes.create_scope({"name": "Ruby", "group": "characters", "anyGroups": [["ruby"]]})
        model_thumbs.save_thumb("loras", "char.safetensors", _png(), ruby["id"], {"tags": ["ruby"]})
        thumbnail_scopes.delete_scope(ruby["id"])
        model_meta_db.replace_info("loras", {})
        model_thumb_storage.write_index({})
        result = model_sidecar.restore_all()
        self.assertGreaterEqual(result["models"], 1)
        self.assertGreaterEqual(result["thumbs"], 1)
        self.assertGreaterEqual(result["scopesCreated"], 1)
        names = [row["name"] for row in thumbnail_scopes.list_scopes()]
        self.assertIn("Ruby", names)
        self.assertTrue(model_thumbs.contexts("loras", "char.safetensors"))


if __name__ == "__main__":
    unittest.main()
