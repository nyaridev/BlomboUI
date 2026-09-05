from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from shared import dirs


class ListedDirsTests(unittest.TestCase):
    def test_model_dirs_inserts_comfyui_second(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "local"
            comfy = Path(tmp) / "comfy"
            extra = Path(tmp) / "extra"
            local.mkdir()
            comfy.mkdir()
            extra.mkdir()
            stored = [{"id": "extra", "name": "Extra", "path": str(extra)}]
            with (
                patch.object(dirs, "stored_dirs", return_value=stored),
                patch.object(dirs, "models_root", return_value=local),
                patch.object(dirs, "comfy_models_root", return_value=comfy),
            ):
                rows = dirs.listed_dirs("modelDirs")
        self.assertEqual([item["id"] for item in rows], ["local", "comfyui", "extra"])
        self.assertEqual(rows[1]["name"], "ComfyUI")
        self.assertEqual(rows[1]["path"], str(comfy.resolve()))

    def test_resolved_includes_models_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "models"
            local.mkdir()
            with patch.object(dirs, "models_root", return_value=local):
                paths = dirs.resolved()
        self.assertEqual(paths["models"], str(local.resolve()))
        self.assertIn("comfyModels", paths)
        self.assertIn("wildcards", paths)


if __name__ == "__main__":
    unittest.main()
