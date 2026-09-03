from __future__ import annotations

import unittest
from unittest.mock import patch

from features.generate.scripts.job.scope_thumbs import (
    scope_thumb_run_values,
    scope_thumbs_config,
    scope_thumbs_count,
)

PROMPT_LORA = {"instant": False, "strength": 1.0, "prompt": "", "negative_prompt": ""}
INSTANT_LORA = {
    "instant": True,
    "strength": 0.6,
    "prompt": "red hair, long hair",
    "negative_prompt": "blurry",
}


class ScopeThumbsTests(unittest.TestCase):
    def test_config_rejects_empty_targets(self) -> None:
        self.assertIsNone(scope_thumbs_config({"type": "loras", "targets": []}))
        self.assertIsNone(scope_thumbs_config({"type": "loras", "targets": [{"kind": "vae", "path": "a.safetensors"}]}))
        self.assertIsNone(scope_thumbs_config(None))

    def test_config_keeps_context_and_filters_kinds(self) -> None:
        cfg = scope_thumbs_config(
            {
                "context": "aabbccddeeff",
                "type": "loras",
                "search": "TOKEN",
                "targets": [
                    {"kind": "loras", "path": "a.safetensors", "tag": "<lora:a:1>"},
                    {"kind": "wildcards", "path": "no.txt"},
                    {"kind": "loras", "path": "a.safetensors"},
                    {"kind": "loras", "path": "b.safetensors"},
                ],
            }
        )
        self.assertIsNotNone(cfg)
        assert cfg is not None
        self.assertEqual(cfg["context"], "aabbccddeeff")
        self.assertEqual(cfg["search"], "TOKEN")
        self.assertEqual(cfg["apply_after"], True)
        self.assertEqual(cfg["skip_existing"], False)
        self.assertEqual([row["path"] for row in cfg["targets"]], ["a.safetensors", "b.safetensors"])
        self.assertEqual(scope_thumbs_count(cfg), 2)

    def test_checkpoint_swap(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "checkpoints",
                "targets": [
                    {"kind": "checkpoints", "path": "one.safetensors"},
                    {"kind": "diffusion_models", "path": "two.safetensors"},
                ],
            }
        )
        assert cfg is not None
        base = {"checkpoint": "base.safetensors", "prompt": "1girl", "seed": 1, "auto_loras": []}
        first = scope_thumb_run_values(base, cfg, 0)
        second = scope_thumb_run_values(base, cfg, 1)
        self.assertEqual(first["checkpoint"], "one.safetensors")
        self.assertEqual(second["checkpoint"], "two.safetensors")
        self.assertEqual(first["prompt"], "1girl")
        self.assertEqual(base["checkpoint"], "base.safetensors")
        self.assertEqual(first["batch_size"], 1)

    def test_lora_sr_replaces_in_both_prompts(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "search": "TOKEN",
                "targets": [{"kind": "loras", "path": "hair.safetensors", "tag": "<lora:hair:0.8>"}],
            }
        )
        assert cfg is not None
        with patch("features.generate.scripts.job.scope_thumbs._lora_meta", return_value=PROMPT_LORA):
            run = scope_thumb_run_values(
                {"prompt": "1girl, TOKEN", "negative_prompt": "TOKEN, bad", "seed": 1, "auto_loras": []},
                cfg,
                0,
            )
        self.assertEqual(run["prompt"], "1girl, <lora:hair:0.8>")
        self.assertEqual(run["negative_prompt"], "<lora:hair:0.8>, bad")
        self.assertEqual(run["auto_loras"], [])

    def test_lora_sr_instant_uses_triggers_and_queues_lora(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "search": "TOKEN",
                "targets": [{"kind": "loras", "path": "hair.safetensors", "tag": "<lora:hair:0.8>"}],
            }
        )
        assert cfg is not None
        auto = [{"path": "keep.safetensors", "strength": 1}]
        with patch("features.generate.scripts.job.scope_thumbs._lora_meta", return_value=INSTANT_LORA):
            run = scope_thumb_run_values(
                {
                    "prompt": "1girl, TOKEN, smile",
                    "negative_prompt": "TOKEN, bad",
                    "seed": 1,
                    "auto_loras": auto,
                },
                cfg,
                0,
            )
        self.assertEqual(run["prompt"], "1girl, red hair, long hair, smile")
        self.assertEqual(run["negative_prompt"], "blurry, bad")
        self.assertEqual(
            run["auto_loras"],
            [{"path": "hair.safetensors", "strength": 0.6, "inject": False}, {"path": "keep.safetensors", "strength": 1}],
        )
        self.assertEqual(auto, [{"path": "keep.safetensors", "strength": 1}])

    def test_lora_prepend_keeps_existing_stack(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "search": "",
                "targets": [
                    {"kind": "loras", "path": "a.safetensors", "tag": "<lora:a:1>"},
                    {"kind": "loras", "path": "b.safetensors", "tag": "<lora:b:1>"},
                ],
            }
        )
        assert cfg is not None
        auto = [{"path": "keep.safetensors", "strength": 1}, {"path": "other.safetensors", "strength": 0.5}]
        base = {
            "prompt": "<lora:keep:1>, 1girl",
            "negative_prompt": "",
            "seed": 1,
            "auto_loras": auto,
        }
        with patch("features.generate.scripts.job.scope_thumbs._lora_meta", return_value=PROMPT_LORA):
            first = scope_thumb_run_values(base, cfg, 0)
            second = scope_thumb_run_values(base, cfg, 1)
        self.assertEqual(first["prompt"], "<lora:a:1>, <lora:keep:1>, 1girl")
        self.assertEqual(second["prompt"], "<lora:b:1>, <lora:keep:1>, 1girl")
        self.assertEqual(first["auto_loras"], auto)
        self.assertEqual(second["auto_loras"], auto)
        self.assertEqual(base["prompt"], "<lora:keep:1>, 1girl")

    def test_lora_prepend_instant_queues_on_stack(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "targets": [{"kind": "loras", "path": "hair.safetensors", "tag": "<lora:hair:1>"}],
            }
        )
        assert cfg is not None
        auto = [{"path": "keep.safetensors", "strength": 1}]
        with patch("features.generate.scripts.job.scope_thumbs._lora_meta", return_value=INSTANT_LORA):
            run = scope_thumb_run_values(
                {"prompt": "1girl", "negative_prompt": "", "seed": 1, "auto_loras": auto},
                cfg,
                0,
            )
        self.assertEqual(run["prompt"], "1girl")
        self.assertEqual(
            run["auto_loras"],
            [{"path": "hair.safetensors", "strength": 0.6}, {"path": "keep.safetensors", "strength": 1}],
        )

    def test_lora_prepend_moves_existing_tag_to_top(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "targets": [
                    {"kind": "loras", "path": "a.safetensors", "tag": "<lora:a:1>"},
                    {"kind": "loras", "path": "b.safetensors", "tag": "<lora:b:1>"},
                ],
            }
        )
        assert cfg is not None
        with patch("features.generate.scripts.job.scope_thumbs._lora_meta", return_value=PROMPT_LORA):
            run = scope_thumb_run_values(
                {"prompt": "<lora:keep:1>, <lora:a:1>, 1girl", "negative_prompt": "", "seed": 1, "auto_loras": []},
                cfg,
                0,
            )
            sibling = scope_thumb_run_values(
                {"prompt": "<lora:a:1>, <lora:keep:1>, 1girl", "negative_prompt": "", "seed": 1, "auto_loras": []},
                cfg,
                1,
            )
        self.assertEqual(run["prompt"], "<lora:a:1>, <lora:keep:1>, 1girl")
        self.assertEqual(sibling["prompt"], "<lora:b:1>, <lora:a:1>, <lora:keep:1>, 1girl")

    def test_wildcard_sr_replaces(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "wildcards",
                "search": "__hair__",
                "targets": [{"kind": "wildcards", "path": "colors.txt", "tag": "__colors__"}],
            }
        )
        assert cfg is not None
        run = scope_thumb_run_values(
            {"prompt": "1girl, __hair__", "negative_prompt": "__hair__", "seed": 1},
            cfg,
            0,
        )
        self.assertEqual(run["prompt"], "1girl, __colors__")
        self.assertEqual(run["negative_prompt"], "__colors__")

    def test_wildcard_prepend_keeps_siblings(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "wildcards",
                "targets": [
                    {"kind": "wildcards", "path": "a.txt", "tag": "__a__"},
                    {"kind": "wildcards", "path": "b.txt", "tag": "__b__"},
                ],
            }
        )
        assert cfg is not None
        run = scope_thumb_run_values(
            {"prompt": "__a__, 1girl", "negative_prompt": "", "seed": 1},
            cfg,
            1,
        )
        self.assertEqual(run["prompt"], "__b__, __a__, 1girl")
        moved = scope_thumb_run_values(
            {"prompt": "__keep__, __b__, 1girl", "negative_prompt": "", "seed": 1},
            cfg,
            1,
        )
        self.assertEqual(moved["prompt"], "__b__, __keep__, 1girl")

    def test_skip_existing_drops_targets_with_thumbs(self) -> None:
        from unittest.mock import patch

        with patch("features.generate.scripts.job.scope_thumbs.model_thumbs.thumb_file") as thumb_file:
            thumb_file.side_effect = lambda kind, path, context: path == "a.safetensors"
            cfg = scope_thumbs_config(
                {
                    "type": "loras",
                    "skip_existing": True,
                    "targets": [
                        {"kind": "loras", "path": "a.safetensors"},
                        {"kind": "loras", "path": "b.safetensors"},
                    ],
                }
            )
        self.assertIsNotNone(cfg)
        assert cfg is not None
        self.assertEqual([row["path"] for row in cfg["targets"]], ["b.safetensors"])
        self.assertTrue(cfg["skip_existing"])

    def test_skip_existing_all_gone(self) -> None:
        from unittest.mock import patch

        with patch("features.generate.scripts.job.scope_thumbs.model_thumbs.thumb_file", return_value=True):
            self.assertIsNone(
                scope_thumbs_config(
                    {
                        "type": "loras",
                        "skip_existing": True,
                        "targets": [{"kind": "loras", "path": "a.safetensors"}],
                    }
                )
            )

    def test_apply_after_false(self) -> None:
        cfg = scope_thumbs_config(
            {
                "type": "loras",
                "apply_after": False,
                "targets": [{"kind": "loras", "path": "a.safetensors"}],
            }
        )
        self.assertIsNotNone(cfg)
        assert cfg is not None
        self.assertFalse(cfg["apply_after"])

