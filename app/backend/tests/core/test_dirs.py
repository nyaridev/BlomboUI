from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from shared import dirs


class ListedDirsTests(unittest.TestCase):
    def test_model_dirs_keeps_local_and_extras(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "local"
            extra = Path(tmp) / "extra"
            local.mkdir()
            extra.mkdir()
            stored = [
                {"id": "comfyui", "name": "ComfyUI", "path": str(Path(tmp) / "comfy")},
                {"id": "extra", "name": "Extra", "path": str(extra)},
            ]
            with (
                patch.object(dirs, "stored_dirs", return_value=stored),
                patch.object(dirs, "models_root", return_value=local),
            ):
                rows = dirs.listed_dirs("modelDirs")
        self.assertEqual([item["id"] for item in rows], ["local", "extra"])
        self.assertEqual(rows[0]["name"], "Local")
        self.assertEqual(rows[0]["path"], str(local.resolve()))

    def test_resolved_includes_models_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "models"
            local.mkdir()
            with patch.object(dirs, "models_root", return_value=local):
                paths = dirs.resolved()
        self.assertEqual(paths["models"], str(local.resolve()))
        self.assertNotIn("comfyModels", paths)
        self.assertIn("wildcards", paths)


if __name__ == "__main__":
    unittest.main()
