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
        self.assertIn("    vae_approx: vae_approx", text)
        self.assertIn("    clip_vision: clip_vision", text)
        self.assertIn("    LLM: LLM", text)
        self.assertIn("    audio_encoders: audio_encoders", text)
        self.assertIn("    model_patches: model_patches", text)
        self.assertIn("    latent_upscale_models: latent_upscale_models", text)
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

    def test_write_file_drops_yaml_when_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "extra_model_paths.yaml"
            dest.write_text("stale:\n", encoding="utf-8")
            write_file(dest, [])
            self.assertFalse(dest.exists())


if __name__ == "__main__":
    unittest.main()
