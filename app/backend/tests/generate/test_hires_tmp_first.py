from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from features.gallery.scripts import cache as gallery_cache
from features.generate.scripts import job_output
from features.generate.scripts.job_output import tmp_first_pass
from shared import dirs


class HiresTmpFirstTests(unittest.TestCase):
    def test_tmp_first_pass_only_when_save_before_off(self) -> None:
        on = {"hires": {"enabled": True, "save_before": False}}
        self.assertTrue(tmp_first_pass(on, "images"))
        self.assertFalse(tmp_first_pass(on, "hires"))
        self.assertFalse(tmp_first_pass({"hires": {"enabled": True, "save_before": True}}, "images"))
        self.assertFalse(tmp_first_pass({"hires": {"enabled": False, "save_before": False}}, "images"))
        self.assertTrue(tmp_first_pass({"hires": {"enabled": True, "saveBefore": False}}, "images"))

    def test_tmp_path_is_temp_kind_and_allowed(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            path = root / "tmp" / "hires-first" / "job" / "a.png"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"png")
            with patch.object(dirs, "RUNTIME", root), patch.object(gallery_cache, "RUNTIME", root):
                self.assertTrue(dirs.allowed_file(path))
                self.assertEqual(gallery_cache._asset_kind(path), "temp")
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_purge_hires_tmp_drops_old_files(self) -> None:
        root = Path(tempfile.mkdtemp())
        try:
            folder = root / "tmp" / "hires-first" / "job"
            folder.mkdir(parents=True)
            old = folder / "old.png"
            fresh = folder / "new.png"
            old.write_bytes(b"old")
            fresh.write_bytes(b"new")
            os.utime(old, (0, 0))
            with (
                patch.object(job_output, "RUNTIME", root),
                patch("features.settings.service.load", return_value={"hiresTempAfterDays": 7}),
                patch.object(job_output.gallery_repo, "query", return_value=[]),
                patch.object(gallery_cache, "forget_paths") as forget,
            ):
                job_output.purge_hires_tmp()
            self.assertFalse(old.exists())
            self.assertTrue(fresh.exists())
            forget.assert_called()
            self.assertIn(str(old), forget.call_args[0][0])
        finally:
            shutil.rmtree(root, ignore_errors=True)
