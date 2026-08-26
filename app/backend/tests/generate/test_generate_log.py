from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infrastructure.storage import user as db
from infrastructure.storage.repositories import error_log as error_log_repo
from features.generate.scripts import jobs
from infrastructure.comfy import client as comfy


class CreateJobLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "user.sqlite"),
        ]
        for item in self.patches:
            item.start()
        db.connect()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_create_job_logs_when_comfy_down(self) -> None:
        with patch.object(jobs.comfy, "reachable", return_value=False):
            with self.assertRaises(comfy.ComfyError):
                jobs.create_job({"prompt": "x"})
        rows = error_log_repo.list_rows()
        self.assertTrue(rows)
        self.assertEqual(str(rows[0]["kind"]), "generate")
        self.assertEqual(str(rows[0]["code"]), "generate_failed")
        self.assertEqual(str(rows[0]["name"]), "start")
