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


if __name__ == "__main__":
    unittest.main()
