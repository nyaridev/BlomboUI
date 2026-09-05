from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bootstrap import env


class ResolveTests(unittest.TestCase):
    def test_resolve_uses_bundled_slot_and_keeps_model_overrides(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            user = root / "user"
            runtime = root / "runtime"
            slot = runtime / "comfyui" / "0.28.0" / "ComfyUI"
            slot.mkdir(parents=True)
            (slot / "main.py").write_text("", encoding="utf-8")
            (runtime / "comfyui" / "selected").write_text("0.28.0\n", encoding="utf-8")
            models = root / "shared" / "models"
            wildcards = root / "shared" / "wildcards"
            models.mkdir(parents=True)
            wildcards.mkdir(parents=True)
            fake_comfy = root / "other" / "ComfyUI"
            fake_comfy.mkdir(parents=True)
            (fake_comfy / "main.py").write_text("", encoding="utf-8")
            extra_out = root / "other" / "output"
            extra_out.mkdir()
            user.mkdir()

            environ = {
                "COMFYUI_PATH": str(fake_comfy),
                "OUTPUTS_ROOT": str(extra_out),
                "VENV_DIR": str(root / "elsewhere" / "venv"),
                "MODELS_ROOT": str(models),
                "WILDCARDS_ROOT": str(wildcards),
            }
            with (
                patch.object(env, "USER", user),
                patch.object(env, "RUNTIME", runtime),
                patch.object(env, "active_profile_id", return_value="default"),
                patch.object(env, "comfy_python", return_value=None),
                patch.dict(os.environ, environ, clear=False),
            ):
                data = env.resolve()

        self.assertEqual(Path(data["comfyui.path"]), slot.resolve())
        self.assertEqual(data["comfyui.mode"], "bundled")
        self.assertEqual(Path(data["models.root"]), models.resolve())
        self.assertEqual(Path(data["wildcards.root"]), wildcards.resolve())
        self.assertEqual(Path(data["outputs.root"]), (user / "output" / "default").resolve())

    def test_resolve_strips_quoted_models_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            user = root / "user"
            runtime = root / "runtime"
            models = root / "shared" / "models"
            models.mkdir(parents=True)
            user.mkdir()
            runtime.mkdir()
            with (
                patch.object(env, "USER", user),
                patch.object(env, "RUNTIME", runtime),
                patch.object(env, "active_profile_id", return_value="default"),
                patch.object(env, "bundled_comfy", return_value=runtime / "comfyui" / "ComfyUI"),
                patch.object(env, "comfy_python", return_value=None),
                patch.dict(os.environ, {"MODELS_ROOT": f'"{models}"'}, clear=False),
            ):
                data = env.resolve()

        self.assertEqual(Path(data["models.root"]), models.resolve())

    def test_ensure_dirs_skips_gallery_thumbs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            user = root / "user"
            runtime = root / "runtime"
            runtime.mkdir()
            with (
                patch.object(env, "USER", user),
                patch.object(env, "RUNTIME", runtime),
                patch.object(env, "active_profile_id", return_value="default"),
            ):
                env.ensure_dirs()
            self.assertFalse((user / "gallery_thumbs").exists())
            self.assertFalse((user / "model_thumbs").exists())
            self.assertFalse((runtime / "data" / "gallery_thumbs").exists())
            self.assertFalse((user / "data" / "history").exists())
            self.assertTrue((user / "data" / "history_thumbs" / "default" / "download").is_dir())
            self.assertTrue((user / "data" / "history_thumbs" / "default" / "browse").is_dir())

    def test_ensure_dirs_moves_legacy_gallery_thumbs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            user = root / "user"
            runtime = root / "runtime"
            runtime.mkdir()
            old = user / "gallery_thumbs" / "default"
            old.mkdir(parents=True)
            (old / "a.jpg").write_bytes(b"jpg")
            with (
                patch.object(env, "USER", user),
                patch.object(env, "RUNTIME", runtime),
                patch.object(env, "active_profile_id", return_value="default"),
            ):
                env.ensure_dirs()
            dest = runtime / "data" / "gallery_thumbs" / "default" / "a.jpg"
            self.assertTrue(dest.is_file())
            self.assertEqual(dest.read_bytes(), b"jpg")
            self.assertFalse((user / "gallery_thumbs").exists())

    def test_ensure_dirs_moves_legacy_history_thumbs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            user = root / "user"
            runtime = root / "runtime"
            runtime.mkdir()
            old = user / "data" / "history" / "default" / "browse"
            old.mkdir(parents=True)
            (old / "a.jpg").write_bytes(b"jpg")
            with (
                patch.object(env, "USER", user),
                patch.object(env, "RUNTIME", runtime),
                patch.object(env, "active_profile_id", return_value="default"),
            ):
                env.ensure_dirs()
            dest = user / "data" / "history_thumbs" / "default" / "browse" / "a.jpg"
            self.assertTrue(dest.is_file())
            self.assertEqual(dest.read_bytes(), b"jpg")
            self.assertFalse((user / "data" / "history").exists())


if __name__ == "__main__":
    unittest.main()
