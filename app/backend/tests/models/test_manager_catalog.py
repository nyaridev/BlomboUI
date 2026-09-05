from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from features.models.scripts import manager_catalog as catalog


class ManagerCatalogTests(unittest.TestCase):
    def test_dest_path_joins_save_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest = catalog.dest_path(
                root,
                {"save_path": "vae_approx", "filename": "taesd_decoder.pth", "url": "https://example.com/x"},
            )
        self.assertEqual(dest, (root / "vae_approx" / "taesd_decoder.pth").resolve())

    def test_dest_path_rejects_parent_segments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(catalog.CatalogError):
                catalog.dest_path(root, {"save_path": "../escape", "filename": "x.safetensors"})

    def test_find_item_requires_catalog_match(self) -> None:
        rows = [
            {
                "name": "TAESD Decoder",
                "filename": "taesd_decoder.pth",
                "save_path": "vae_approx",
                "url": "https://example.com/taesd_decoder.pth",
            }
        ]
        self.assertIsNotNone(catalog.find_item(rows, "TAESD Decoder", "taesd_decoder.pth", "vae_approx"))
        self.assertIsNone(catalog.find_item(rows, "TAESD Decoder", "other.pth", "vae_approx"))
        self.assertIsNone(catalog.find_item(rows, "Nope", "taesd_decoder.pth"))

    def test_mark_installed_when_file_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest = root / "vae_approx" / "taesd_decoder.pth"
            dest.parent.mkdir()
            dest.write_bytes(b"ok")
            rows = [
                {
                    "name": "TAESD Decoder",
                    "type": "TAESD",
                    "save_path": "vae_approx",
                    "filename": "taesd_decoder.pth",
                    "url": "https://example.com/taesd_decoder.pth",
                    "installed": "False",
                }
            ]
            with patch.object(catalog, "models_root", return_value=root), patch.object(
                catalog.dirs, "extra_named", return_value={}
            ):
                catalog._mark_installed(rows)
        self.assertEqual(rows[0]["installed"], "True")

    def test_install_root_uses_manager_download_dir_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "picked"
            dest.mkdir()
            rows = [
                {"id": "local", "name": "Local", "path": str(Path(tmp) / "local")},
                {"id": "extra", "name": "Extra", "path": str(dest)},
            ]
            with (
                patch.object(catalog.dirs, "listed_dirs", return_value=rows),
                patch("features.settings.service.load", return_value={"managerDownloadDirId": "extra"}),
            ):
                self.assertEqual(catalog.install_root(), dest)

    def test_install_root_falls_back_when_dir_id_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "local"
            local.mkdir()
            rows = [{"id": "local", "name": "Local", "path": str(local)}]
            with (
                patch.object(catalog.dirs, "listed_dirs", return_value=rows),
                patch.object(catalog, "models_root", return_value=local),
                patch("features.settings.service.load", return_value={"managerDownloadDirId": "comfyui"}),
            ):
                self.assertEqual(catalog.install_root(), local)


if __name__ == "__main__":
    unittest.main()
