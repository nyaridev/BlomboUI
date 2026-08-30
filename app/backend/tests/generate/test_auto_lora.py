from __future__ import annotations

import unittest
from unittest.mock import patch

from features.settings import service as settings
from infrastructure.comfy import client as comfy
from features.generate.scripts.job import jobs
from features.models.scripts import loras
from features.models.scripts import model_meta
from features.models.scripts import models


class AutoLoraTests(unittest.TestCase):
    def test_settings_keep_auto_lora_defaults(self) -> None:
        result = settings._clean({"loraAutoApply": False, "loraApplyAt": "end"})
        self.assertFalse(result["loraAutoApply"])
        self.assertEqual(result["loraApplyAt"], "end")

    def test_trigger_placement_preserves_order(self) -> None:
        automatic = [
            {"prompt": "first", "negative_prompt": "bad first", "apply_at": "start"},
            {"prompt": "last", "negative_prompt": "bad last", "apply_at": "end"},
            {"prompt": "second", "negative_prompt": "", "apply_at": "start"},
        ]
        self.assertEqual(loras.inject_triggers("base", automatic), "first, second, base, last")
        self.assertEqual(
            loras.inject_triggers("bad", automatic, "negative_prompt"),
            "bad first, bad, bad last",
        )

    def test_apply_merges_prompt_and_automatic_loras_without_duplicates(self) -> None:
        with patch.object(loras, "_lora_files", return_value=["a.safetensors", "b.safetensors"]):
            values = {"prompt": "<lora:a:0.5>", "negative_prompt": ""}
            loras.apply(
                values,
                [
                    {"lora": "b.safetensors", "strength": 0.7},
                    {"lora": "a.safetensors", "strength": 1.0},
                ],
            )

        self.assertEqual(
            values["loras"],
            [
                {"lora": "a.safetensors", "strength": 0.5},
                {"lora": "b.safetensors", "strength": 0.7},
            ],
        )
        self.assertEqual(values["lora_missing"], [])

    def test_comfy_loader_keeps_merged_lora_order(self) -> None:
        inputs = {"lora_9": {"on": True, "lora": "old", "strength": 1}}
        comfy._fill_power_loras(
            inputs,
            {
                "loras": [
                    {"lora": "first.safetensors", "strength": 0.4},
                    {"lora": "second.safetensors", "strength": 0.8},
                ]
            },
        )

        self.assertEqual(inputs["lora_1"]["lora"], "first.safetensors")
        self.assertEqual(inputs["lora_2"]["lora"], "second.safetensors")
        self.assertNotIn("lora_9", inputs)

    def test_resolve_auto_loras_reads_metadata_in_requested_order(self) -> None:
        with (
            patch.object(
                models,
                "list_kind",
                return_value=[{"path": "b.safetensors"}, {"path": "a.safetensors"}],
            ),
            patch.object(
                model_meta,
                "get_info",
                side_effect=[
                    {"strength": 0.7, "prompt": "b-trigger", "negative_prompt": "", "apply_at": "end"},
                    {"strength": 0.4, "prompt": "a-trigger", "negative_prompt": "a-bad", "apply_at": "start"},
                ],
            ),
        ):
            rows, missing = jobs._resolve_auto_loras(["b.safetensors", "a.safetensors"])

        self.assertEqual([row["lora"] for row in rows], ["b.safetensors", "a.safetensors"])
        self.assertEqual([row["strength"] for row in rows], [0.7, 0.4])
        self.assertEqual([row["apply_at"] for row in rows], ["end", "start"])
        self.assertEqual(missing, [])

    def test_resolve_auto_loras_reports_missing_entries(self) -> None:
        with patch.object(models, "list_kind", return_value=[{"path": "a.safetensors"}]):
            rows, missing = jobs._resolve_auto_loras(["missing.safetensors", "missing.safetensors"])

        self.assertEqual(rows, [])
        self.assertEqual(missing, ["missing.safetensors"])

    def test_resolve_auto_loras_uses_global_placement_when_not_overridden(self) -> None:
        with (
            patch.object(models, "list_kind", return_value=[{"path": "a.safetensors"}]),
            patch.object(settings, "load", return_value={"loraApplyAt": "end"}),
            patch.object(
                model_meta,
                "get_info",
                return_value={"strength": 1, "prompt": "trigger", "negative_prompt": "", "apply_at": None},
            ),
        ):
            rows, missing = jobs._resolve_auto_loras(["a.safetensors"])

        self.assertEqual([row["apply_at"] for row in rows], ["end"])
        self.assertEqual(missing, [])

    def test_resolve_auto_loras_honors_requested_strength(self) -> None:
        with (
            patch.object(models, "list_kind", return_value=[{"path": "a.safetensors"}]),
            patch.object(
                model_meta,
                "get_info",
                return_value={"strength": 0.7, "prompt": "", "negative_prompt": "", "apply_at": None},
            ),
        ):
            rows, missing = jobs._resolve_auto_loras([{"path": "a.safetensors", "strength": 0.3}])

        self.assertEqual([row["strength"] for row in rows], [0.3])
        self.assertEqual(missing, [])

    def test_normalized_structured_auto_lora_resolves_nested_path(self) -> None:
        requested = {
            "path": "Illustrious/Style/THEANTLERS/ta_picturd1.safetensors",
            "strength": 1.0,
        }
        normalized = jobs._normalize_auto_loras([requested])

        with (
            patch.object(
                models,
                "list_kind",
                return_value=[{"path": requested["path"]}],
            ),
            patch.object(
                model_meta,
                "get_info",
                return_value={"strength": 0.7, "prompt": "", "negative_prompt": "", "apply_at": None},
            ),
        ):
            rows, missing = jobs._resolve_auto_loras(normalized)

        self.assertEqual(normalized, [requested])
        self.assertEqual([row["lora"] for row in rows], [requested["path"]])
        self.assertEqual([row["strength"] for row in rows], [1.0])
        self.assertEqual(missing, [])

    def test_auto_loras_use_the_expanded_prompt_without_mutating_the_raw_prompt(self) -> None:
        values = {
            "prompt": "expanded wildcard",
            "negative_prompt": "clean",
        }
        with patch.object(loras, "_lora_files", return_value=["style.safetensors"]):
            jobs._apply_auto_loras(
                values,
                [
                    {
                        "lora": "style.safetensors",
                        "strength": 0.8,
                        "prompt": "style trigger",
                        "negative_prompt": "style negative",
                        "apply_at": "start",
                    }
                ],
            )

        self.assertEqual(values["prompt"], "style trigger, expanded wildcard")
        self.assertEqual(values["negative_prompt"], "style negative, clean")
        self.assertEqual(values["loras"], [{"lora": "style.safetensors", "strength": 0.8}])


if __name__ == "__main__":
    unittest.main()
