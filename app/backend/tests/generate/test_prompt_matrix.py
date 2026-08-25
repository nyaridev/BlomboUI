from __future__ import annotations

import unittest

from features.generate.scripts import jobs


class PromptMatrixTests(unittest.TestCase):
    def test_lines_remove_empty_values_and_trailing_commas(self) -> None:
        self.assertEqual(
            jobs._prompt_matrix_lines("black hair,\n\n blonde hair,\n,"),
            ["black hair", "blonde hair"],
        )

    def test_prompt_addition_avoids_duplicate_commas(self) -> None:
        self.assertEqual(
            jobs._prompt_matrix_prompt("1girl,", "black hair,"),
            "1girl, black hair",
        )
        self.assertEqual(jobs._prompt_matrix_prompt("", "black hair"), "black hair")

    def test_config_preserves_grid_and_batch_options(self) -> None:
        self.assertEqual(
            jobs._prompt_matrix_config(
                {
                    "lines": "black hair,\nblonde hair,",
                    "save_grid": False,
                    "use_batch": False,
                }
            ),
            {
                "lines": ["black hair", "blonde hair"],
                "save_grid": False,
                "use_batch": False,
                "mode": "end",
                "target": "prompt",
                "search": "",
            },
        )

    def test_config_preserves_insert_mode(self) -> None:
        self.assertEqual(
            jobs._prompt_matrix_config(
                {
                    "lines": "blonde hair",
                    "mode": "prompt_sr",
                    "target": "negative",
                    "search": "black hair",
                }
            ),
            {
                "lines": ["blonde hair"],
                "save_grid": True,
                "use_batch": True,
                "mode": "prompt_sr",
                "target": "negative",
                "search": "black hair",
            },
        )

    def test_start_prepends_to_positive(self) -> None:
        prompt, negative = jobs._prompt_matrix_apply(
            {"prompt": "1girl, black hair", "negative_prompt": "bad"},
            "solo",
            {"mode": "start", "target": "prompt"},
        )
        self.assertEqual(prompt, "solo, 1girl, black hair")
        self.assertEqual(negative, "bad")

    def test_end_appends_to_negative(self) -> None:
        prompt, negative = jobs._prompt_matrix_apply(
            {"prompt": "1girl", "negative_prompt": "bad"},
            "blurry",
            {"mode": "end", "target": "negative"},
        )
        self.assertEqual(prompt, "1girl")
        self.assertEqual(negative, "bad, blurry")

    def test_prompt_sr_replaces_in_both_prompts(self) -> None:
        prompt, negative = jobs._prompt_matrix_apply(
            {"prompt": "1girl, black hair", "negative_prompt": "black hair, bad"},
            "blonde hair",
            {"mode": "prompt_sr", "search": "black hair"},
        )
        self.assertEqual(prompt, "1girl, blonde hair")
        self.assertEqual(negative, "blonde hair, bad")

    def test_prompt_sr_skips_field_when_tag_missing(self) -> None:
        prompt, negative = jobs._prompt_matrix_apply(
            {"prompt": "1girl, black hair", "negative_prompt": "bad"},
            "blonde hair",
            {"mode": "prompt_sr", "search": "black hair"},
        )
        self.assertEqual(prompt, "1girl, blonde hair")
        self.assertEqual(negative, "bad")

    def test_batch_plan_applies_to_each_prompt_line(self) -> None:
        values = {
            "batch_count": 2,
            "batch_size": 3,
            "seed_after": "increment",
            "prompt_matrix": {
                "lines": ["black hair", "blonde hair"],
                "use_batch": True,
            },
        }
        lines, count, size = jobs._generation_plan(values)
        self.assertEqual((lines, count, size), (["black hair", "blonde hair"], 2, 3))
        self.assertEqual(len(lines) * count * size, 12)

    def test_disabled_batching_generates_one_image_per_line(self) -> None:
        values = {
            "batch_count": 2,
            "batch_size": 3,
            "seed_after": "increment",
            "prompt_matrix": {
                "lines": ["black hair", "blonde hair"],
                "use_batch": False,
            },
        }
        self.assertEqual(
            jobs._generation_plan(values),
            (["black hair", "blonde hair"], 1, 1),
        )


if __name__ == "__main__":
    unittest.main()
