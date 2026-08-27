from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infrastructure.storage import user as db
from features.generate.scripts import templates


class TemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
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

    def test_create_update_and_apply_are_persistent(self) -> None:
        created = templates.create_template("txt2img", "Portrait", {"prompt": "portrait", "steps": 20})
        templates.update_template("txt2img", created["id"], {"prompt": "close portrait"}, icon={"kind": "emoji", "id": "🎨"})
        templates.set_apply("txt2img", ["prompt"])

        items, apply = templates.list_templates("txt2img")

        self.assertEqual(apply, ["prompt"])
        self.assertEqual(items[0]["apply"], ["prompt"])
        self.assertEqual(items[1]["name"], "Portrait")
        self.assertEqual(items[1]["params"]["prompt"], "close portrait")
        self.assertEqual(items[1]["icon"]["kind"], "emoji")
        self.assertEqual(items[1]["apply"], list(templates._APPLY))
        self.assertTrue(items[1]["enabled"])

    def test_default_apply_skips_prompt_and_models(self) -> None:
        items, apply = templates.list_templates("txt2img")
        expected = templates.default_apply("txt2img")
        self.assertEqual(apply, expected)
        self.assertEqual(items[0]["id"], "default")
        self.assertEqual(items[0]["apply"], expected)
        self.assertNotIn("prompt", apply)
        self.assertNotIn("checkpoint", apply)
        self.assertTrue(items[0]["enabled"])

    def test_per_template_apply_and_enabled(self) -> None:
        one = templates.create_template("txt2img", "New1", {"steps": 10})
        two = templates.create_template("txt2img", "New2", {"steps": 30})
        templates.update_template("txt2img", one["id"], None, apply=["steps"], enabled=True)
        templates.update_template("txt2img", two["id"], None, apply=["steps"], enabled=False)

        items, _ = templates.list_templates("txt2img")
        by_id = {item["id"]: item for item in items}
        self.assertEqual(by_id[one["id"]]["apply"], ["steps"])
        self.assertTrue(by_id[one["id"]]["enabled"])
        self.assertEqual(by_id[two["id"]]["apply"], ["steps"])
        self.assertFalse(by_id[two["id"]]["enabled"])

    def test_reorder_and_delete(self) -> None:
        templates.create_template("txt2img", "New1", {"steps": 10})
        templates.create_template("txt2img", "New2", {"steps": 20})
        items, _ = templates.reorder_templates("txt2img", ["New2", "New1"])
        self.assertEqual([item["id"] for item in items], ["default", "New2", "New1"])

        templates.delete_template("txt2img", "New2")
        items, _ = templates.list_templates("txt2img")
        self.assertEqual([item["id"] for item in items], ["default", "New1"])

        with self.assertRaises(templates.TemplateError):
            templates.delete_template("txt2img", "default")

    def test_clean_params_keeps_lora_order_and_strengths(self) -> None:
        created = templates.create_template(
            "txt2img",
            "Loras",
            {
                "activeLoraOrder": ["auto:foo.safetensors", "", "auto:foo.safetensors", "auto:bar.safetensors"],
                "activeLoraStrengths": {"foo.safetensors": 0.8, "": 1, "bar.safetensors": "0.5"},
            },
        )
        params = created["params"]
        self.assertEqual(params["activeLoraOrder"], ["auto:foo.safetensors", "auto:bar.safetensors"])
        self.assertEqual(params["activeLoraStrengths"]["foo.safetensors"], 0.8)
        self.assertEqual(params["activeLoraStrengths"]["bar.safetensors"], 0.5)
        self.assertNotIn("", params["activeLoraStrengths"])

    def test_migrate_copies_shared_apply_onto_customs(self) -> None:
        db.connect()
        db.execute(
            "INSERT INTO workflow_template_state (workflow, apply_json) VALUES (?, ?)",
            ("txt2img", json.dumps(["prompt", "steps"])),
        )
        db.execute(
            "INSERT INTO workflow_templates (workflow, id, name, position, params_json) VALUES (?, ?, ?, ?, ?)",
            ("txt2img", "Old", "Old", 0, json.dumps({"steps": 12})),
        )
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None

        items, apply = templates.list_templates("txt2img")
        self.assertEqual(apply, ["prompt", "steps"])
        self.assertEqual(items[1]["apply"], ["prompt", "steps"])


if __name__ == "__main__":
    unittest.main()
