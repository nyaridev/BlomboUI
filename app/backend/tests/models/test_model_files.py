from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from features.models.scripts import model_files


class ModelFilesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(model_files, "models_root", return_value=self.tmp),
            patch.object(model_files.dirs, "extra_named", return_value={}),
            patch.object(model_files.model_meta, "remap_ident"),
            patch.object(model_files.catalog, "relocate"),
            patch.object(model_files.hashes, "remap_moved"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rename_entry_moves_file(self) -> None:
        folder = self.tmp / "loras"
        folder.mkdir()
        (folder / "old.safetensors").write_bytes(b"x")
        result = model_files.rename_entry("loras", "old.safetensors", "new")
        self.assertEqual(result, {"path": "new.safetensors", "kind": "file"})
        self.assertFalse((folder / "old.safetensors").exists())
        self.assertTrue((folder / "new.safetensors").is_file())
        model_files.model_meta.remap_ident.assert_called_once_with("loras", "old.safetensors", "new.safetensors")
        model_files.catalog.relocate.assert_called_once_with("loras", "old.safetensors", "new.safetensors")
        model_files.hashes.remap_moved.assert_called_once()

    def test_move_entry_does_not_refresh(self) -> None:
        folder = self.tmp / "loras"
        dest = folder / "sub"
        dest.mkdir(parents=True)
        (folder / "a.safetensors").write_bytes(b"x")
        result = model_files.move_entry("loras", "a.safetensors", "sub")
        self.assertEqual(result, {"path": "sub/a.safetensors", "kind": "file"})
        self.assertTrue((dest / "a.safetensors").is_file())
        model_files.catalog.relocate.assert_called_once_with("loras", "a.safetensors", "sub/a.safetensors")
        model_files.hashes.remap_moved.assert_called()

    def test_resolve_extra_root_uses_kind_and_ignores_name_case(self) -> None:
        extra = self.tmp / "comfy"
        unet = extra / "diffusion_models"
        unet.mkdir(parents=True)
        target = unet / "unet.safetensors"
        target.write_bytes(b"x")
        (extra / "checkpoints").mkdir()
        with patch.object(model_files.dirs, "extra_named", return_value={"ComfyUI": extra}):
            path = model_files._resolve("diffusion_models", "comfyui/unet.safetensors")
            self.assertEqual(path, target)
            self.assertTrue(path.is_file())
            wrong = model_files._resolve("checkpoints", "comfyui/unet.safetensors")
            self.assertIsNotNone(wrong)
            self.assertFalse(wrong.exists())
