from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from config import WORKFLOWS
from features.generate.scripts import comfy_fill
from features.models.scripts import models
from features.settings import service as settings
from infrastructure.comfy import client as comfy


class DiffusionFillTests(unittest.TestCase):
    def test_workflow_file_has_no_resolution_selector(self) -> None:
        data = json.loads((WORKFLOWS / "diffusion.json").read_text(encoding="utf-8"))
        kinds = {
            node.get("class_type")
            for node in data.values()
            if isinstance(node, dict)
        }
        self.assertNotIn("ResolutionSelector", kinds)
        self.assertIn("UNETLoader", kinds)
        self.assertIn("CLIPLoader", kinds)
        self.assertIn("VAELoader", kinds)
        self.assertIn("EmptyLatentImage", kinds)

    def test_workflow_defaults_have_empty_prompt_and_models(self) -> None:
        for name in ("diffusion.json", "txt2img.json"):
            data = json.loads((WORKFLOWS / name).read_text(encoding="utf-8"))
            apply = data.get("apply") or []
            self.assertNotIn("prompt", apply)
            self.assertNotIn("checkpoint", apply)
            self.assertNotIn("vae", apply)
            self.assertNotIn("textEncoder", apply)
            for node in data.values():
                if not isinstance(node, dict):
                    continue
                inputs = node.get("inputs") or {}
                kind = node.get("class_type")
                if kind == "CLIPTextEncode":
                    self.assertEqual(inputs.get("text"), "")
                if kind == "UNETLoader":
                    self.assertEqual(inputs.get("unet_name"), "")
                if kind == "CheckpointLoaderSimple":
                    self.assertEqual(inputs.get("ckpt_name"), "")
                if kind == "CLIPLoader":
                    self.assertEqual(inputs.get("clip_name"), "")
                if kind == "VAELoader":
                    self.assertEqual(inputs.get("vae_name"), "")


    def test_fill_sets_unet_clip_vae_and_size(self) -> None:
        data = json.loads((WORKFLOWS / "diffusion.json").read_text(encoding="utf-8"))
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(
                {
                    "workflow": "diffusion",
                    "prompt": "cat",
                    "negative_prompt": "blur",
                    "checkpoint": "Anima/model.safetensors",
                    "text_encoder": "clip.safetensors",
                    "vae": "vae.safetensors",
                    "seed": 7,
                    "steps": 12,
                    "cfg": 3.5,
                    "sampler": "euler",
                    "scheduler": "sgm_uniform",
                    "width": 640,
                    "height": 960,
                    "batch_size": 2,
                },
                lambda _: data,
                lambda name: name,
                comfy._comfy_graph,
            )
        self.assertNotIn("6", graph)
        self.assertEqual(graph["19"]["inputs"]["unet_name"], "Anima/model.safetensors")
        self.assertEqual(graph["18"]["inputs"]["clip_name"], "clip.safetensors")
        self.assertEqual(graph["17"]["inputs"]["vae_name"], "vae.safetensors")
        self.assertEqual(graph["7"]["inputs"]["width"], 640)
        self.assertEqual(graph["7"]["inputs"]["height"], 960)
        self.assertEqual(graph["7"]["inputs"]["batch_size"], 2)
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")

    def test_workflow_params_include_vae_and_text_encoder(self) -> None:
        data = json.loads((WORKFLOWS / "diffusion.json").read_text(encoding="utf-8"))
        params = comfy._workflow_params(data)
        self.assertIn("checkpoint", params)
        self.assertIn("textEncoder", params)
        self.assertIn("vae", params)

    def test_txt2img_params_omit_vae_and_text_encoder(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        params = comfy._workflow_params(data)
        self.assertIn("checkpoint", params)
        self.assertNotIn("textEncoder", params)
        self.assertNotIn("vae", params)


class ModelKindTests(unittest.TestCase):
    def test_kinds_include_diffusion_and_text_encoders(self) -> None:
        self.assertIn("diffusion_models", models.KINDS)
        self.assertIn("text_encoders", models.KINDS)


class GenerateTabTests(unittest.TestCase):
    def test_other_tab_appended_after_wildcards(self) -> None:
        result = settings._clean({"generateTabOrder": ["Generation", "Base Model", "LoRa", "Wildcards"]})
        self.assertEqual(
            result["generateTabOrder"],
            ["Generation", "Base Model", "LoRa", "Wildcards", "Other"],
        )


if __name__ == "__main__":
    unittest.main()
