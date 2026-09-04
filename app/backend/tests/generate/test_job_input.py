from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from features.generate.scripts.job import jobs


class InputPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="job-input-"))
        self.one = self.tmp / "one.png"
        self.two = self.tmp / "two.jpg"
        self.one.write_bytes(b"one")
        self.two.write_bytes(b"two")

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_serves_listed_file(self) -> None:
        payload = json.dumps({"input_paths": [str(self.one), str(self.two)]})
        with patch.object(jobs.jobs_repo, "payload_json", return_value=payload):
            self.assertEqual(jobs.input_path("job", 0), self.one)
            self.assertEqual(jobs.input_path("job", 1), self.two)

    def test_out_of_range_index(self) -> None:
        payload = json.dumps({"input_paths": [str(self.one)]})
        with patch.object(jobs.jobs_repo, "payload_json", return_value=payload):
            self.assertIsNone(jobs.input_path("job", 1))
            self.assertIsNone(jobs.input_path("job", -1))

    def test_missing_file(self) -> None:
        payload = json.dumps({"input_paths": [str(self.tmp / "gone.png")]})
        with patch.object(jobs.jobs_repo, "payload_json", return_value=payload):
            self.assertIsNone(jobs.input_path("job", 0))

    def test_unknown_job(self) -> None:
        with patch.object(jobs.jobs_repo, "payload_json", return_value=None):
            self.assertIsNone(jobs.input_path("missing", 0))

    def test_skips_non_string_entries(self) -> None:
        payload = json.dumps({"input_paths": [12, str(self.one)]})
        with patch.object(jobs.jobs_repo, "payload_json", return_value=payload):
            self.assertIsNone(jobs.input_path("job", 0))
            self.assertEqual(jobs.input_path("job", 1), self.one)
