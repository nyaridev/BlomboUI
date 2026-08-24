from __future__ import annotations

import random
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from features.models.scripts import loras
from features.wildcards.scripts import wildcards


class WildcardExpandTests(unittest.TestCase):
    def test_expand_reads_configured_wildcard_directories(self) -> None:
        with TemporaryDirectory() as temp:
            local = Path(temp) / "local"
            extra = Path(temp) / "other-set"
            local.mkdir()
            extra.mkdir()
            (extra / "colors.txt").write_text("red\n", encoding="utf-8")

            with (
                patch.object(wildcards, "wildcards_root", return_value=local),
                patch.object(wildcards.app_dirs, "extra_named", return_value={"Other Set": extra}),
            ):
                values = {"prompt": "__colors__", "negative_prompt": ""}
                wildcards.apply(values, random.Random(1))

        self.assertEqual(values["prompt_expanded"], "red")
        self.assertEqual(values["wildcard_missing"], [])

    def test_expanded_wildcard_lora_is_resolved_for_generation(self) -> None:
        with TemporaryDirectory() as temp:
            local = Path(temp) / "local"
            extra = Path(temp) / "other-set"
            local.mkdir()
            extra.mkdir()
            (extra / "models.txt").write_text("<lora:style:0.75>\n", encoding="utf-8")

            with (
                patch.object(wildcards, "wildcards_root", return_value=local),
                patch.object(wildcards.app_dirs, "extra_named", return_value={"Other Set": extra}),
                patch.object(loras, "_lora_files", return_value=["style.safetensors"]),
            ):
                values = {"prompt": "__models__", "negative_prompt": ""}
                wildcards.apply(values, random.Random(1))
                values["prompt"] = values["prompt_expanded"]
                loras.apply(values)

        self.assertEqual(values["prompt"], "<lora:style:0.75>")
        self.assertEqual(values["loras"], [{"lora": "style.safetensors", "strength": 0.75}])
        self.assertEqual(values["lora_missing"], [])


if __name__ == "__main__":
    unittest.main()
