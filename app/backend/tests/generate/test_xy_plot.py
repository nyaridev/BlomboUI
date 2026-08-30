from __future__ import annotations

from unittest.mock import patch
import unittest

from features.generate.scripts.grid.xy_plot import (
    xy_cell_count,
    xy_cells,
    xy_config,
    xy_labels,
    xy_run_values,
    xy_shape,
)


class XyPlotTests(unittest.TestCase):
    def test_config_requires_values_and_rejects_exclusive_collision(self) -> None:
        self.assertIsNone(xy_config({"x": {"type": "steps", "values": []}, "y": {"type": "none", "values": []}}))
        self.assertIsNone(
            xy_config(
                {
                    "x": {"type": "checkpoint", "values": ["a.safetensors"]},
                    "y": {"type": "checkpoint", "values": ["b.safetensors"]},
                }
            )
        )
        cfg = xy_config(
            {
                "x": {"type": "lora", "values": ["one.safetensors"]},
                "y": {"type": "lora", "values": ["two.safetensors"]},
                "draw_legend": False,
                "keep_minus_one": True,
                "include_sub_images": False,
                "grid_margin": 12,
            }
        )
        self.assertIsNotNone(cfg)
        assert cfg is not None
        self.assertEqual(cfg["grid_margin"], 12)
        self.assertFalse(cfg["include_sub_images"])
        self.assertFalse(cfg["draw_type"])
        self.assertFalse(cfg["respect_instant_lora"])

    def test_legend_values_omit_type_unless_requested(self) -> None:
        raw = {
            "x": {"type": "steps", "values": ["20", "28"]},
            "y": {"type": "cfg", "values": ["4"]},
        }
        cfg = xy_config(raw)
        assert cfg is not None
        self.assertEqual(xy_labels(cfg), (["20", "28"], ["4"]))
        cfg["draw_type"] = True
        self.assertEqual(xy_labels(cfg), (["Steps: 20", "Steps: 28"], ["CFG: 4"]))

    def test_model_legend_uses_file_stem(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "checkpoint", "values": [r"External\Anima\waiANIMA_v10.safetensors"]},
                "y": {"type": "lora", "values": ["loras/detail.safetensors"]},
            }
        )
        assert cfg is not None
        self.assertEqual(xy_labels(cfg), (["waiANIMA_v10"], ["detail"]))
        cfg["draw_type"] = True
        self.assertEqual(xy_labels(cfg), (["Checkpoint: waiANIMA_v10"], ["LoRA: detail"]))

    def test_unused_axis_has_no_legend_labels(self) -> None:
        cfg = xy_config({"x": {"type": "steps", "values": ["10", "20"]}, "y": {"type": "none", "values": []}})
        assert cfg is not None
        self.assertEqual(xy_labels(cfg), (["10", "20"], []))
        cfg = xy_config({"x": {"type": "none", "values": []}, "y": {"type": "cfg", "values": ["4", "6"]}})
        assert cfg is not None
        self.assertEqual(xy_labels(cfg), ([], ["4", "6"]))

    def test_cells_are_row_major_x_fastest(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "steps", "values": ["20", "28"]},
                "y": {"type": "cfg", "values": ["4", "6"]},
            }
        )
        assert cfg is not None
        self.assertEqual(xy_shape(cfg), (2, 2))
        self.assertEqual(xy_cell_count(cfg), 4)
        self.assertEqual(xy_cells(cfg), [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 0, "y": 1}, {"x": 1, "y": 1}])

    def test_unused_axis_is_one_wide(self) -> None:
        cfg = xy_config({"x": {"type": "steps", "values": ["10", "20", "30"]}, "y": {"type": "none", "values": []}})
        assert cfg is not None
        self.assertEqual(xy_shape(cfg), (3, 1))
        self.assertEqual(len(xy_cells(cfg)), 3)

    def test_prompt_sr_replaces_first_chip(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "prompt_sr", "values": ["1girl", "1boy", "1cat"]},
                "y": {"type": "none", "values": []},
            }
        )
        assert cfg is not None
        base = {"prompt": "1girl, black hair", "negative_prompt": "bad", "seed": 1, "auto_loras": []}
        first = xy_run_values(base, cfg, {"x": 0, "y": 0})
        second = xy_run_values(base, cfg, {"x": 1, "y": 0})
        third = xy_run_values(base, cfg, {"x": 2, "y": 0})
        self.assertEqual(first["prompt"], "1girl, black hair")
        self.assertEqual(second["prompt"], "1boy, black hair")
        self.assertEqual(third["prompt"], "1cat, black hair")

    def test_prompt_sr_skips_when_search_missing(self) -> None:
        cfg = xy_config({"x": {"type": "prompt_sr", "values": ["missing", "other"]}, "y": {"type": "none", "values": []}})
        assert cfg is not None
        base = {"prompt": "1girl", "negative_prompt": "", "seed": 1}
        run = xy_run_values(base, cfg, {"x": 1, "y": 0})
        self.assertEqual(run["prompt"], "1girl")

    def test_lora_appends_without_replacing(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "lora", "values": ["extra.safetensors"]},
                "y": {"type": "none", "values": []},
            }
        )
        assert cfg is not None
        base = {"seed": 3, "auto_loras": [{"path": "base.safetensors", "strength": 0.8}]}
        run = xy_run_values(base, cfg, {"x": 0, "y": 0})
        self.assertEqual(run["auto_loras"][0]["path"], "base.safetensors")
        self.assertEqual(run["auto_loras"][1]["path"], "extra.safetensors")
        self.assertEqual(base["auto_loras"], [{"path": "base.safetensors", "strength": 0.8}])

    def test_seed_stays_fixed_unless_minus_one(self) -> None:
        cfg = xy_config({"x": {"type": "steps", "values": ["10", "20"]}, "y": {"type": "none", "values": []}})
        assert cfg is not None
        a = xy_run_values({"seed": 42, "steps": 20}, cfg, {"x": 0, "y": 0})
        b = xy_run_values({"seed": 42, "steps": 20}, cfg, {"x": 1, "y": 0})
        self.assertEqual(a["seed"], 42)
        self.assertEqual(b["seed"], 42)
        self.assertEqual(a["steps"], 10)
        self.assertEqual(b["steps"], 20)
        rand = xy_run_values({"seed": -1, "steps": 20}, cfg, {"x": 0, "y": 0})
        self.assertGreaterEqual(rand["seed"], 0)

    def test_both_prompt_sr_axes_apply(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "prompt_sr", "values": ["black", "blonde"]},
                "y": {"type": "prompt_sr", "values": ["1girl", "1boy"]},
            }
        )
        assert cfg is not None
        run = xy_run_values(
            {"prompt": "1girl, black hair", "negative_prompt": "", "seed": 1},
            cfg,
            {"x": 1, "y": 1},
        )
        self.assertEqual(run["prompt"], "1boy, blonde hair")

    def test_respect_instant_lora_uses_prompt_tag_when_not_instant(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "lora", "values": ["detail.safetensors"]},
                "y": {"type": "none", "values": []},
                "respect_instant_lora": True,
            }
        )
        assert cfg is not None
        self.assertTrue(cfg["respect_instant_lora"])
        meta = {
            "instant": False,
            "strength": 0.7,
            "prompt": "sharp",
            "negative_prompt": "blurry",
        }
        with patch("features.generate.scripts.grid.xy_plot._lora_meta", return_value=meta):
            run = xy_run_values(
                {"prompt": "1girl", "negative_prompt": "bad", "seed": 1, "auto_loras": []},
                cfg,
                {"x": 0, "y": 0},
            )
        self.assertEqual(run["auto_loras"], [])
        self.assertEqual(run["prompt"], "1girl, <lora:detail:0.7>, sharp")
        self.assertEqual(run["negative_prompt"], "bad, blurry")

    def test_respect_instant_lora_keeps_auto_apply_when_instant(self) -> None:
        cfg = xy_config(
            {
                "x": {"type": "lora", "values": ["style.safetensors"]},
                "y": {"type": "none", "values": []},
                "respect_instant_lora": True,
            }
        )
        assert cfg is not None
        with patch(
            "features.generate.scripts.grid.xy_plot._lora_meta",
            return_value={"instant": True, "strength": 0.4, "prompt": "", "negative_prompt": ""},
        ):
            run = xy_run_values({"prompt": "1girl", "seed": 1, "auto_loras": []}, cfg, {"x": 0, "y": 0})
        self.assertEqual(run["auto_loras"], [{"path": "style.safetensors"}])
        self.assertEqual(run["prompt"], "1girl")


if __name__ == "__main__":
    unittest.main()
