from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from config import WORKFLOWS
from features.generate.scripts import comfy_fill
from features.generate.scripts.attention import FLASH_CLASS, SAGE_CLASS
from infrastructure.comfy import client as comfy

CHECKPOINT = WORKFLOWS / "image_checkpoint"
DIFFUSION = WORKFLOWS / "image_diffusion"


def load_main(name: str) -> dict:
    for folder in (CHECKPOINT, DIFFUSION):
        path = folder / name
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(name)


def find(graph: dict, kind: str, contains: str | None = None, exclude: str | None = None) -> tuple[str, dict]:
    for key, node in graph.items():
        if not isinstance(node, dict) or node.get("class_type") != kind:
            continue
        title = str((node.get("_meta") or {}).get("title") or "").lower()
        if contains is not None and contains.lower() not in title:
            continue
        if exclude is not None and exclude.lower() in title:
            continue
        return str(key), node
    raise AssertionError(f"missing {kind} contains={contains!r} exclude={exclude!r}")


def fill(values: dict, data: dict | None = None, packages: tuple[bool, bool] = (True, True)) -> dict:
    name = f"{values.get('workflow') or 'sd15'}.json"
    data = data if data is not None else load_main(name)
    with (
        patch.object(comfy_fill.lora_tags, "apply"),
        patch("features.generate.scripts.attention.installed", return_value=packages),
    ):
        return comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)


def base_values(**hires: object) -> dict:
    values: dict = {
        "workflow": "sd15",
        "prompt": "cat",
        "negative_prompt": "",
        "checkpoint": "model.safetensors",
        "seed": 7,
        "steps": 20,
        "cfg": 4,
        "sampler": "euler",
        "scheduler": "sgm_uniform",
        "width": 832,
        "height": 1216,
        "batch_size": 1,
    }
    if hires:
        values["hires"] = {"enabled": True, "upscale_model": "4x.pth", **hires}
    return values


def of_kind(graph: dict, kind: str) -> list[tuple[str, dict]]:
    return [(str(key), node) for key, node in graph.items() if isinstance(node, dict) and node.get("class_type") == kind]


class AttentionFillTests(unittest.TestCase):
    def test_first_pass_sage_shared_with_hires_and_adetailer(self) -> None:
        graph = fill(
            {
                **base_values(scale=1.5),
                "attention": {"enabled": True, "engine": "sage", "sage_attention": "auto", "allow_compile": False},
                "adetailer": {"enabled": True, "units": [{"detector": "face.pt"}]},
            }
        )
        sages = of_kind(graph, SAGE_CLASS)
        self.assertEqual(len(sages), 1)
        self.assertEqual(of_kind(graph, FLASH_CLASS), [])
        patch_id, patch = sages[0]
        self.assertEqual(patch["inputs"]["sage_attention"], "auto")
        self.assertEqual(patch["inputs"]["allow_compile"], False)
        _, first = find(graph, "KSampler", exclude="hires")
        _, hires = find(graph, "KSampler", contains="hires")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(first["inputs"]["model"], [patch_id, 0])
        self.assertEqual(hires["inputs"]["model"], [patch_id, 0])
        self.assertEqual(face["inputs"]["model"], [patch_id, 0])

    def test_flash_on_uses_flash_node(self) -> None:
        graph = fill({"attention": {"enabled": True, "engine": "flash", "allow_compile": False}, **base_values()})
        flashes = of_kind(graph, FLASH_CLASS)
        self.assertEqual(len(flashes), 1)
        self.assertEqual(of_kind(graph, SAGE_CLASS), [])
        _, first = find(graph, "KSampler", exclude="hires")
        self.assertEqual(first["inputs"]["model"], [flashes[0][0], 0])

    def test_attention_off_leaves_graph_unpatched(self) -> None:
        graph = fill(base_values(scale=1.5))
        self.assertEqual(of_kind(graph, SAGE_CLASS), [])
        self.assertEqual(of_kind(graph, FLASH_CLASS), [])

    def test_hires_only_patch_leaves_first_pass_unpatched(self) -> None:
        graph = fill(
            {
                **base_values(
                    scale=1.5,
                    attention_override=True,
                    attention_engine="sage",
                    sage_attention="auto",
                    allow_compile=False,
                ),
                "adetailer": {"enabled": True, "units": [{"detector": "face.pt", "from_hires": True}]},
            }
        )
        sages = of_kind(graph, SAGE_CLASS)
        self.assertEqual(len(sages), 1)
        patch_id = sages[0][0]
        _, first = find(graph, "KSampler", exclude="hires")
        _, hires = find(graph, "KSampler", contains="hires")
        _, face = find(graph, "FaceDetailer")
        self.assertNotEqual(first["inputs"]["model"], [patch_id, 0])
        self.assertEqual(hires["inputs"]["model"], [patch_id, 0])
        self.assertEqual(face["inputs"]["model"], [patch_id, 0])
        self.assertEqual(sages[0][1]["inputs"]["model"], first["inputs"]["model"])

    def test_adetailer_only_patch(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "from_hires": False,
                            "attention_override": True,
                            "attention_engine": "sage",
                        }
                    ],
                },
            }
        )
        sages = of_kind(graph, SAGE_CLASS)
        self.assertEqual(len(sages), 1)
        _, first = find(graph, "KSampler", exclude="hires")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["model"], [sages[0][0], 0])
        self.assertNotEqual(first["inputs"]["model"], [sages[0][0], 0])

    def test_from_hires_shares_hires_override_patch_without_second_loader(self) -> None:
        graph = fill(
            {
                **base_values(
                    scale=1.5,
                    model_override=True,
                    checkpoint="hires.safetensors",
                    attention_override=True,
                    attention_engine="flash",
                    allow_compile=False,
                ),
                "adetailer": {"enabled": True, "units": [{"detector": "face.pt", "from_hires": True}]},
            }
        )
        flashes = of_kind(graph, FLASH_CLASS)
        self.assertEqual(len(flashes), 1)
        _, hires = find(graph, "KSampler", contains="hires")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["model"], hires["inputs"]["model"])
        self.assertEqual(hires["inputs"]["model"], [flashes[0][0], 0])
        adetailer_ckpts = [
            node
            for key, node in graph.items()
            if isinstance(node, dict)
            and node.get("class_type") == "CheckpointLoaderSimple"
            and str(key).startswith("adetailer/")
        ]
        self.assertEqual(adetailer_ckpts, [])

    def test_adetailer_own_model_override_does_not_share_hires_patch(self) -> None:
        graph = fill(
            {
                **base_values(
                    scale=1.5,
                    model_override=True,
                    checkpoint="hires.safetensors",
                    attention_override=True,
                    attention_engine="flash",
                ),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "from_hires": True,
                            "model_override": True,
                            "checkpoint": "ad.safetensors",
                            "attention_override": True,
                            "attention_engine": "sage",
                        }
                    ],
                },
            }
        )
        _, hires = find(graph, "KSampler", contains="hires")
        _, face = find(graph, "FaceDetailer")
        self.assertNotEqual(face["inputs"]["model"], hires["inputs"]["model"])
        self.assertEqual(len(of_kind(graph, FLASH_CLASS)), 1)
        self.assertEqual(len(of_kind(graph, SAGE_CLASS)), 1)

    def test_different_hires_attention_patches_from_unpatched_source(self) -> None:
        graph = fill(
            {
                **base_values(
                    scale=1.5,
                    attention_override=True,
                    attention_engine="flash",
                    allow_compile=False,
                ),
                "attention": {"enabled": True, "engine": "sage", "sage_attention": "auto", "allow_compile": False},
            }
        )
        sages = of_kind(graph, SAGE_CLASS)
        flashes = of_kind(graph, FLASH_CLASS)
        self.assertEqual(len(sages), 1)
        self.assertEqual(len(flashes), 1)
        _, first = find(graph, "KSampler", exclude="hires")
        _, hires = find(graph, "KSampler", contains="hires")
        self.assertEqual(first["inputs"]["model"], [sages[0][0], 0])
        self.assertEqual(hires["inputs"]["model"], [flashes[0][0], 0])
        self.assertEqual(sages[0][1]["inputs"]["model"], flashes[0][1]["inputs"]["model"])
        self.assertNotIn(sages[0][1]["inputs"]["model"][0], {sages[0][0], flashes[0][0]})

    def test_adetailer_unit_sampler_override_beats_hires(self) -> None:
        graph = fill(
            {
                **base_values(scale=1.5, sampler_override=True, sampler="dpmpp_2m", cfg_override=True, cfg=9),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "from_hires": True,
                            "sampler_override": True,
                            "sampler": "heun",
                            "cfg_override": True,
                            "cfg": 3,
                        }
                    ],
                },
            }
        )
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["sampler_name"], "heun")
        self.assertEqual(face["inputs"]["cfg"], 3)

    def test_neither_package_skips_patch(self) -> None:
        graph = fill(
            {"attention": {"enabled": True, "engine": "sage", "sage_attention": "auto"}, **base_values()},
            packages=(False, False),
        )
        self.assertEqual(of_kind(graph, SAGE_CLASS), [])
        self.assertEqual(of_kind(graph, FLASH_CLASS), [])

    def test_flash_only_coerces_sage_request(self) -> None:
        graph = fill(
            {"attention": {"enabled": True, "engine": "sage", "sage_attention": "auto"}, **base_values()},
            packages=(False, True),
        )
        self.assertEqual(of_kind(graph, SAGE_CLASS), [])
        self.assertEqual(len(of_kind(graph, FLASH_CLASS)), 1)

    def test_sage_only_coerces_flash_request(self) -> None:
        graph = fill(
            {"attention": {"enabled": True, "engine": "flash"}, **base_values()},
            packages=(True, False),
        )
        self.assertEqual(of_kind(graph, FLASH_CLASS), [])
        self.assertEqual(len(of_kind(graph, SAGE_CLASS)), 1)


if __name__ == "__main__":
    unittest.main()
