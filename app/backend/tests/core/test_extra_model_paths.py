from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from shared.extra_model_paths import MODEL_SUBDIRS, write_file, yaml_block, yaml_ident


class ExtraModelPathsTests(unittest.TestCase):
    def test_yaml_block_includes_new_comfy_folders(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            text = "\n".join(yaml_block("blomboui", root))

        self.assertIn("    text_encoders: text_encoders", text)
        self.assertIn("    diffusion_models: diffusion_models", text)
        self.assertIn("    upscale_models: upscale_models", text)
        for name in MODEL_SUBDIRS:
            self.assertIn(f"    {name}: {name}", text)

    def test_write_file_sanitizes_idents(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "extra_model_paths.yaml"
            root = Path(tmp) / "models"
            root.mkdir()
            write_file(dest, [("My Models", root)])
            text = dest.read_text(encoding="utf-8")

        self.assertTrue(text.startswith("My_Models:\n"))
        self.assertEqual(yaml_ident("My Models"), "My_Models")


if __name__ == "__main__":
    unittest.main()
