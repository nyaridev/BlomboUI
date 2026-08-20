from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from blombo import db, templates


class TemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        user = self.tmp / "user"
        workflows = self.tmp / "workflows"
        workflows.mkdir()
        (workflows / "txt2img.json").write_text(
            json.dumps({"apply": ["prompt", "sampler", "scheduler"]}),
            encoding="utf-8",
        )
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
            patch.object(templates, "USER", user),
            patch.object(templates, "WORKFLOWS", workflows),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_migrate_json_to_sqlite(self) -> None:
        source = templates.USER / "workflow_templates" / "txt2img.json"
        source.parent.mkdir(parents=True)
        source.write_text(
            json.dumps(
                {
                    "apply": ["prompt", "sampler"],
                    "templates": [
                        {
                            "id": "cinematic",
                            "name": "Cinematic",
                            "params": {"prompt": "wide shot", "steps": 24},
                            "icon": {"kind": "icon", "id": "bookmark", "color": "blue"},
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        items, apply = templates.list_templates("txt2img")

        self.assertEqual(apply, ["prompt", "sampler"])
        self.assertEqual(items[1]["id"], "cinematic")
        self.assertEqual(items[1]["params"]["steps"], 24)
        self.assertFalse(source.exists())

    def test_create_update_and_apply_are_persistent(self) -> None:
        created = templates.create_template("txt2img", "Portrait", {"prompt": "portrait", "steps": 20})
        templates.update_template("txt2img", created["id"], {"prompt": "close portrait"}, icon={"kind": "emoji", "id": "🎨"})
        templates.set_apply("txt2img", ["prompt"])

        items, apply = templates.list_templates("txt2img")

        self.assertEqual(apply, ["prompt"])
        self.assertEqual(items[1]["name"], "Portrait")
        self.assertEqual(items[1]["params"]["prompt"], "close portrait")
        self.assertEqual(items[1]["icon"]["kind"], "emoji")


if __name__ == "__main__":
    unittest.main()
