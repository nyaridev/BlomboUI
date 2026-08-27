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
        self.assertEqual(graph["31"]["inputs"]["clip_name"], "")
        self.assertEqual(graph["32"]["inputs"]["vae_name"], "")
        self.assertEqual(graph["7"]["inputs"]["width"], 640)
        self.assertEqual(graph["7"]["inputs"]["height"], 960)
        self.assertEqual(graph["7"]["inputs"]["batch_size"], 2)
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")

    def test_workflow_params_include_hires(self) -> None:
        for name in ("diffusion.json", "txt2img.json"):
            data = json.loads((WORKFLOWS / name).read_text(encoding="utf-8"))
            self.assertIn("hires", comfy._workflow_params(data))
            kinds = {node["class_type"] for node in data.values() if isinstance(node, dict) and "class_type" in node}
            self.assertIn("ImageScale", kinds)
            self.assertNotIn("ImageScaleToMaxDimension", kinds)

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

    def test_fill_hires_sampler_and_scale_size(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "scale": 1.5,
                "upscale_model": "4x.pth",
                "steps": 15,
                "cfg": 3,
                "sampler": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 0.55,
                "seed": 99,
                "seed_follow": True,
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["5"]["inputs"]["seed"], 7)
        self.assertEqual(graph["5"]["inputs"]["steps"], 20)
        self.assertEqual(graph["18"]["inputs"]["seed"], 7)
        self.assertEqual(graph["18"]["inputs"]["steps"], 15)
        self.assertEqual(graph["18"]["inputs"]["cfg"], 3)
        self.assertEqual(graph["18"]["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(graph["18"]["inputs"]["scheduler"], "karras")
        self.assertEqual(graph["18"]["inputs"]["denoise"], 0.55)
        self.assertEqual(graph["19"]["inputs"]["model_name"], "4x.pth")
        self.assertEqual(graph["21"]["class_type"], "ImageScale")
        self.assertEqual(graph["21"]["inputs"]["width"], 1248)
        self.assertEqual(graph["21"]["inputs"]["height"], 1824)
        self.assertEqual(graph["21"]["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(graph["21"]["inputs"]["crop"], "disabled")
        self.assertEqual(graph["11"]["inputs"]["images"], ["23", 0])
        self.assertEqual(graph["18"]["inputs"]["model"], ["12", 0])
        self.assertEqual(graph["18"]["inputs"]["positive"], ["2", 0])
        self.assertEqual(graph["18"]["inputs"]["negative"], ["3", 0])

    def test_fill_hires_raw_size(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "scale": 1.5,
                "size_mode": "raw",
                "width": 1024,
                "height": 768,
                "upscale_model": "4x.pth",
                "steps": 15,
                "cfg": 4,
                "sampler": "euler",
                "scheduler": "sgm_uniform",
                "denoise": 0.55,
                "seed": 7,
                "seed_follow": True,
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["21"]["inputs"]["width"], 1024)
        self.assertEqual(graph["21"]["inputs"]["height"], 768)
        self.assertEqual(graph["21"]["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(graph["21"]["inputs"]["crop"], "disabled")

    def test_fill_hires_scale_method_and_crop(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "upscale_method": "lanczos",
                "crop": "center",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["21"]["inputs"]["upscale_method"], "lanczos")
        self.assertEqual(graph["21"]["inputs"]["crop"], "center")

    def test_fill_hires_scale_method_invalid_falls_back(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "upscale_method": "nope",
                "crop": "stretch",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["21"]["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(graph["21"]["inputs"]["crop"], "disabled")

    def test_fill_hires_seed_when_follow_off(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "scale": 1.5,
                "upscale_model": "4x.pth",
                "steps": 15,
                "cfg": 4,
                "sampler": "euler",
                "scheduler": "sgm_uniform",
                "denoise": 0.4,
                "seed": 99,
                "seed_follow": False,
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["18"]["inputs"]["seed"], 99)

    def test_fill_hires_prompt_override_rewires_clip(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
            "prompt": "cat",
            "negative_prompt": "blur",
            "checkpoint": "model.safetensors",
            "seed": 7,
            "steps": 20,
            "cfg": 4,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 832,
            "height": 1216,
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "prompt_override": True,
                "prompt": "dog",
                "negative_override": True,
                "negative_prompt": "noise",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")
        self.assertEqual(graph["26"]["inputs"]["text"], "dog")
        self.assertEqual(graph["27"]["inputs"]["text"], "noise")
        self.assertEqual(graph["18"]["inputs"]["positive"], ["26", 0])
        self.assertEqual(graph["18"]["inputs"]["negative"], ["27", 0])
        self.assertEqual(graph["18"]["inputs"]["model"], ["25", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])

    def test_fill_hires_model_and_lora_override(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "loras": [{"path": "job.safetensors", "strength": 0.8}],
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "model_override": True,
                "checkpoint": "hires.safetensors",
                "lora_override": True,
                "loras": [{"path": "hires-lora.safetensors", "strength": 0.4}],
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["1"]["inputs"]["ckpt_name"], "model.safetensors")
        self.assertEqual(graph["24"]["inputs"]["ckpt_name"], "hires.safetensors")
        self.assertEqual(graph["12"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(graph["25"]["inputs"]["lora_1"]["lora"], "hires-lora.safetensors")
        self.assertEqual(graph["25"]["inputs"]["model"], ["24", 0])
        self.assertEqual(graph["18"]["inputs"]["model"], ["25", 0])
        self.assertEqual(graph["18"]["inputs"]["positive"], ["26", 0])
        self.assertEqual(graph["18"]["inputs"]["negative"], ["27", 0])
        self.assertEqual(graph["26"]["inputs"]["clip"], ["25", 1])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])
        self.assertEqual(graph["22"]["inputs"]["vae"], ["24", 2])
        self.assertEqual(graph["23"]["inputs"]["vae"], ["24", 2])

    def test_fill_hires_model_override_reencodes_clip(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
            "prompt": "cat",
            "negative_prompt": "blur",
            "checkpoint": "model.safetensors",
            "seed": 7,
            "steps": 20,
            "cfg": 4,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 832,
            "height": 1216,
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "model_override": True,
                "checkpoint": "hires.safetensors",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")
        self.assertEqual(graph["26"]["inputs"]["text"], "cat")
        self.assertEqual(graph["27"]["inputs"]["text"], "blur")
        self.assertEqual(graph["18"]["inputs"]["positive"], ["26", 0])
        self.assertEqual(graph["18"]["inputs"]["negative"], ["27", 0])
        self.assertEqual(graph["26"]["inputs"]["clip"], ["25", 1])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])

    def test_fill_hires_lora_override_keeps_prompt_blocks(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
            "prompt": "cat, <lora:foo:1>",
            "negative_prompt": "",
            "checkpoint": "model.safetensors",
            "seed": 7,
            "steps": 20,
            "cfg": 4,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 832,
            "height": 1216,
            "loras": [{"path": "job.safetensors", "strength": 0.8}, {"path": "foo.safetensors", "strength": 1}],
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "lora_override": True,
                "loras": [{"path": "hires-lora.safetensors", "strength": 0.4}],
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["12"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(graph["12"]["inputs"]["lora_2"]["lora"], "foo.safetensors")
        self.assertEqual(graph["25"]["inputs"]["lora_1"]["lora"], "foo")
        self.assertEqual(graph["25"]["inputs"]["lora_2"]["lora"], "hires-lora.safetensors")
        self.assertEqual(graph["18"]["inputs"]["model"], ["25", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])

    def test_fill_hires_model_override_copies_first_pass_loras(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "loras": [{"path": "job.safetensors", "strength": 0.8}],
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "model_override": True,
                "checkpoint": "hires.safetensors",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["12"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(graph["25"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(graph["25"]["inputs"]["model"], ["24", 0])
        self.assertEqual(graph["18"]["inputs"]["model"], ["25", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])

    def test_fill_hires_diffusion_override_on_txt2img(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "model_override": True,
                "kind": "diffusion_models",
                "checkpoint": "unet.safetensors",
                "text_encoder": "hires-clip.safetensors",
                "vae": "hires-vae.safetensors",
                "lora_override": True,
                "loras": [{"path": "hires-lora.safetensors", "strength": 0.4}],
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["1"]["inputs"]["ckpt_name"], "model.safetensors")
        self.assertEqual(graph["24"]["inputs"]["ckpt_name"], "")
        self.assertEqual(graph["28"]["inputs"]["unet_name"], "unet.safetensors")
        self.assertEqual(graph["29"]["inputs"]["clip_name"], "hires-clip.safetensors")
        self.assertEqual(graph["30"]["inputs"]["vae_name"], "hires-vae.safetensors")
        self.assertEqual(graph["25"]["inputs"]["model"], ["28", 0])
        self.assertEqual(graph["25"]["inputs"]["clip"], ["29", 0])
        self.assertEqual(graph["18"]["inputs"]["model"], ["25", 0])
        self.assertEqual(graph["22"]["inputs"]["vae"], ["30", 0])
        self.assertEqual(graph["23"]["inputs"]["vae"], ["30", 0])

    def test_fill_hires_checkpoint_override_on_diffusion(self) -> None:
        data = json.loads((WORKFLOWS / "diffusion.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "diffusion",
            "prompt": "cat",
            "negative_prompt": "",
            "checkpoint": "unet.safetensors",
            "text_encoder": "clip.safetensors",
            "vae": "vae.safetensors",
            "seed": 7,
            "steps": 20,
            "cfg": 4,
            "sampler": "euler",
            "scheduler": "sgm_uniform",
            "width": 832,
            "height": 1216,
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "model_override": True,
                "kind": "checkpoints",
                "checkpoint": "illustrious.safetensors",
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["19"]["inputs"]["unet_name"], "unet.safetensors")
        self.assertEqual(graph["30"]["inputs"]["ckpt_name"], "illustrious.safetensors")
        self.assertEqual(graph["26"]["inputs"]["unet_name"], "")
        self.assertEqual(graph["27"]["inputs"]["model"], ["30", 0])
        self.assertEqual(graph["24"]["inputs"]["model"], ["27", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["15", 0])
        self.assertEqual(graph["23"]["inputs"]["vae"], ["30", 2])
        self.assertEqual(graph["25"]["inputs"]["vae"], ["30", 2])

    def test_fill_hires_seed_override_off_uses_first_pass(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {
                "enabled": True,
                "upscale_model": "4x.pth",
                "seed": 99,
                "seed_override": False,
            },
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["18"]["inputs"]["seed"], 7)

    def test_fill_rewires_save_when_hires_off(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {"enabled": False, "scale": 1.5},
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["11"]["inputs"]["images"], ["9", 0])
        self.assertNotIn("10", graph)
        self.assertNotIn("31", graph)
        self.assertNotIn("32", graph)
        self.assertIn("18", graph)
        self.assertIn("23", graph)

    def test_fill_hires_saves_first_pass_by_default(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {"enabled": True, "scale": 1.5},
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["10"]["inputs"]["images"], ["9", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["23", 0])
        self.assertNotIn("31", graph)
        self.assertNotIn("32", graph)
        self.assertEqual(graph["20"]["inputs"]["image"], ["9", 0])

    def test_fill_hires_save_before_off_drops_first_save(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {"enabled": True, "scale": 1.5, "save_before": False},
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertNotIn("10", graph)
        self.assertEqual(graph["11"]["inputs"]["images"], ["23", 0])

    def test_fill_hires_clear_vram_chains_clean_nodes(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        values = {
            "workflow": "txt2img",
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
            "hires": {"enabled": True, "scale": 1.5, "clear_vram": True},
        }
        with patch.object(comfy_fill.lora_tags, "apply"):
            graph = comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)
        self.assertEqual(graph["31"]["class_type"], "easy cleanGpuUsed")
        self.assertEqual(graph["31"]["inputs"]["anything"], ["9", 0])
        self.assertEqual(graph["20"]["inputs"]["image"], ["31", 0])
        self.assertEqual(graph["32"]["inputs"]["anything"], ["23", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["23", 0])

    def test_progress_stages_map_txt2img_nodes(self) -> None:
        data = json.loads((WORKFLOWS / "txt2img.json").read_text(encoding="utf-8"))
        graph = comfy._comfy_graph(data)
        stages = comfy_fill.progress_stage_map(graph)
        self.assertEqual(stages["5"], "generation")
        self.assertEqual(stages["9"], "generation")
        self.assertEqual(stages["10"], "generation")
        self.assertEqual(stages["11"], "hires")
        self.assertEqual(stages["31"], "upscaling")
        self.assertEqual(stages["32"], "hires")
        self.assertEqual(stages["20"], "upscaling")
        self.assertEqual(stages["21"], "upscaling")
        self.assertEqual(stages["18"], "hires")
        self.assertEqual(stages["23"], "hires")
        self.assertEqual(comfy_fill.combined_progress("generation", 10, 20), 16)
        self.assertEqual(comfy_fill.combined_progress("upscaling", 0, 0), 33)
        self.assertEqual(comfy_fill.combined_progress("hires", 15, 15), 100)


class ModelKindTests(unittest.TestCase):
    def test_kinds_include_diffusion_and_text_encoders(self) -> None:
        self.assertIn("diffusion_models", models.KINDS)
        self.assertIn("text_encoders", models.KINDS)
        self.assertIn("upscale_models", models.KINDS)


class GenerateTabTests(unittest.TestCase):
    def test_other_tab_appended_after_wildcards(self) -> None:
        result = settings._clean({"generateTabOrder": ["Generation", "Base Model", "LoRa", "Wildcards"]})
        self.assertEqual(
            result["generateTabOrder"],
            ["Generation", "Base Model", "LoRa", "Wildcards", "Other"],
        )

    def test_hires_save_path_keys(self) -> None:
        result = settings._clean({"hiresPath": "[workflow]/hires-out/[date]", "hiresName": "hires_[number]"})
        self.assertEqual(result["hiresPath"], "[workflow]/hires-out/[date]")
        self.assertEqual(result["hiresName"], "hires_[number]")


if __name__ == "__main__":
    unittest.main()
