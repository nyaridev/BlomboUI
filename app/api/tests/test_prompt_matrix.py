from __future__ import annotations

import unittest

from blombo import jobs


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
            },
        )

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
