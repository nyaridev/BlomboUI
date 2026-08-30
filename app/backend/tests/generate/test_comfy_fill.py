from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from config import WORKFLOWS
from features.generate.scripts.workflow import comfy_fill
from features.models.scripts import models
from features.settings import service as settings
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


def fill(values: dict, data: dict | None = None) -> dict:
    name = f"{values.get('workflow') or 'sd15'}.json"
    data = data if data is not None else load_main(name)
    with patch.object(comfy_fill.lora_tags, "apply"):
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


class DiffusionFillTests(unittest.TestCase):
    def test_workflow_file_has_no_resolution_selector(self) -> None:
        data = load_main("anima.json")
        kinds = {node.get("class_type") for node in data.values() if isinstance(node, dict)}
        self.assertNotIn("ResolutionSelector", kinds)
        self.assertIn("UNETLoader", kinds)
        self.assertIn("CLIPLoader", kinds)
        self.assertIn("VAELoader", kinds)
        self.assertIn("EmptyLatentImage", kinds)
        self.assertNotIn("ImageUpscaleWithModel", kinds)

    def test_workflow_defaults_have_empty_prompt_and_models(self) -> None:
        for folder, name in (
            (CHECKPOINT, "sd15.json"),
            (CHECKPOINT, "sdxl.json"),
            (CHECKPOINT, "illustrious.json"),
            (CHECKPOINT, "noobai.json"),
            (DIFFUSION, "anima.json"),
            (DIFFUSION, "krea2.json"),
            (CHECKPOINT / "utils", "hiresfix.json"),
            (DIFFUSION / "utils", "hiresfix.json"),
            (CHECKPOINT / "utils", "adetailer.json"),
            (DIFFUSION / "utils", "adetailer.json"),
        ):
            data = json.loads((folder / name).read_text(encoding="utf-8"))
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
        graph = fill(
            {
                "workflow": "anima",
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
            }
        )
        self.assertNotIn("6", graph)
        self.assertFalse(any(str(key).startswith("hires/") for key in graph))
        self.assertEqual(graph["19"]["inputs"]["unet_name"], "Anima/model.safetensors")
        self.assertEqual(graph["18"]["inputs"]["clip_name"], "clip.safetensors")
        self.assertEqual(graph["17"]["inputs"]["vae_name"], "vae.safetensors")
        self.assertEqual(graph["7"]["inputs"]["width"], 640)
        self.assertEqual(graph["7"]["inputs"]["height"], 960)
        self.assertEqual(graph["7"]["inputs"]["batch_size"], 2)
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")
        self.assertEqual(graph["18"]["inputs"]["type"], "stable_diffusion")

    def test_fill_promotes_gguf_unet_and_clip_loaders(self) -> None:
        graph = fill(
            {
                "workflow": "anima",
                "prompt": "cat",
                "negative_prompt": "",
                "checkpoint": "flux.Q4_0.gguf",
                "text_encoder": "t5xxl.Q5_K_M.gguf",
                "vae": "ae.safetensors",
                "seed": 7,
                "steps": 12,
                "cfg": 3.5,
                "sampler": "euler",
                "scheduler": "sgm_uniform",
                "width": 640,
                "height": 960,
                "batch_size": 1,
            }
        )
        self.assertEqual(graph["19"]["class_type"], "UnetLoaderGGUF")
        self.assertEqual(graph["19"]["inputs"]["unet_name"], "flux.Q4_0.gguf")
        self.assertNotIn("weight_dtype", graph["19"]["inputs"])
        self.assertEqual(graph["18"]["class_type"], "CLIPLoaderGGUF")
        self.assertEqual(graph["18"]["inputs"]["clip_name"], "t5xxl.Q5_K_M.gguf")
        self.assertEqual(graph["17"]["class_type"], "VAELoader")

    def test_fill_keeps_safetensors_unet_and_clip_loaders(self) -> None:
        graph = fill(
            {
                "workflow": "anima",
                "prompt": "cat",
                "negative_prompt": "",
                "checkpoint": "flux.safetensors",
                "text_encoder": "clip.safetensors",
                "vae": "ae.safetensors",
                "seed": 7,
                "steps": 12,
                "cfg": 3.5,
                "sampler": "euler",
                "scheduler": "sgm_uniform",
                "width": 640,
                "height": 960,
                "batch_size": 1,
            }
        )
        self.assertEqual(graph["19"]["class_type"], "UNETLoader")
        self.assertIn("weight_dtype", graph["19"]["inputs"])
        self.assertEqual(graph["18"]["class_type"], "CLIPLoader")
        self.assertEqual(graph["18"]["inputs"]["type"], "stable_diffusion")

    def test_anima_and_krea2_clip_types(self) -> None:
        anima_defaults = comfy._workflow_defaults(load_main("anima.json"))
        self.assertEqual(anima_defaults["clipType"], "stable_diffusion")
        self.assertEqual(anima_defaults["clipDevice"], "default")
        krea_defaults = comfy._workflow_defaults(load_main("krea2.json"))
        self.assertEqual(krea_defaults["clipType"], "krea2")
        graph = fill(
            {
                "workflow": "krea2",
                "prompt": "cat",
                "negative_prompt": "",
                "checkpoint": "krea.safetensors",
                "text_encoder": "clip.safetensors",
                "vae": "vae.safetensors",
                "clip_type": "krea2",
                "clip_device": "cpu",
                "seed": 7,
                "steps": 12,
                "cfg": 3.5,
                "sampler": "euler",
                "scheduler": "sgm_uniform",
                "width": 640,
                "height": 960,
                "batch_size": 1,
            }
        )
        _, clip = find(graph, "CLIPLoader")
        self.assertEqual(clip["inputs"]["type"], "krea2")
        self.assertEqual(clip["inputs"]["device"], "cpu")

    def test_diffusion_empty_drops_power_lora_and_encodes_from_clip_loader(self) -> None:
        for workflow in ("anima", "krea2"):
            graph = fill(
                {
                    "workflow": workflow,
                    "prompt": "cat",
                    "negative_prompt": "",
                    "checkpoint": "model.safetensors",
                    "text_encoder": "clip.safetensors",
                    "vae": "vae.safetensors",
                    "seed": 7,
                    "steps": 8,
                    "cfg": 1,
                    "sampler": "euler",
                    "scheduler": "simple",
                    "width": 640,
                    "height": 960,
                    "batch_size": 1,
                }
            )
            with self.assertRaises(AssertionError):
                find(graph, "Power Lora Loader (rgthree)")
            clip_id, _ = find(graph, "CLIPLoader")
            unet_id, _ = find(graph, "UNETLoader")
            self.assertEqual(graph["2"]["inputs"]["clip"], [clip_id, 0])
            self.assertEqual(graph["3"]["inputs"]["clip"], [clip_id, 0])
            self.assertEqual(graph["5"]["inputs"]["model"], [unet_id, 0])

    def test_diffusion_loras_are_model_only(self) -> None:
        graph = fill(
            {
                "workflow": "krea2",
                "prompt": "cat",
                "negative_prompt": "",
                "checkpoint": "krea.safetensors",
                "text_encoder": "clip.safetensors",
                "vae": "vae.safetensors",
                "loras": [{"path": "style.safetensors", "strength": 0.8}],
                "seed": 7,
                "steps": 8,
                "cfg": 1,
                "sampler": "euler",
                "scheduler": "simple",
                "width": 640,
                "height": 960,
                "batch_size": 1,
            }
        )
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)")
        clip_id, _ = find(graph, "CLIPLoader")
        unet_id, _ = find(graph, "UNETLoader")
        self.assertNotIn("clip", lora["inputs"])
        self.assertNotIn("PowerLoraLoaderHeaderWidget", lora["inputs"])
        self.assertEqual(lora["inputs"]["model"], [unet_id, 0])
        self.assertEqual(lora["inputs"]["lora_1"]["lora"], "style.safetensors")
        self.assertEqual(lora["inputs"]["lora_1"]["strengthTwo"], 0)
        self.assertEqual(graph["2"]["inputs"]["clip"], [clip_id, 0])
        self.assertEqual(graph["5"]["inputs"]["model"], [lora_id, 0])

    def test_checkpoint_empty_drops_power_lora(self) -> None:
        graph = fill(base_values())
        with self.assertRaises(AssertionError):
            find(graph, "Power Lora Loader (rgthree)")
        self.assertEqual(graph["13"]["inputs"]["clip"], ["1", 1])
        self.assertEqual(graph["5"]["inputs"]["model"], ["1", 0])

    def test_checkpoint_loras_keep_clip(self) -> None:
        graph = fill({**base_values(), "loras": [{"path": "job.safetensors", "strength": 0.8}]})
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)")
        self.assertEqual(lora["inputs"]["clip"], ["1", 1])
        self.assertEqual(lora["inputs"]["model"], ["1", 0])
        self.assertNotIn("strengthTwo", lora["inputs"]["lora_1"])
        self.assertEqual(graph["13"]["inputs"]["clip"], [lora_id, 1])
        self.assertEqual(graph["5"]["inputs"]["model"], [lora_id, 0])

    def test_workflow_params_include_hires(self) -> None:
        for name in ("anima.json", "sd15.json"):
            data = load_main(name)
            self.assertIn("hires", comfy._workflow_params(data))
            kinds = {node["class_type"] for node in data.values() if isinstance(node, dict) and "class_type" in node}
            self.assertNotIn("ImageScale", kinds)
        util = json.loads((CHECKPOINT / "utils" / "hiresfix.json").read_text(encoding="utf-8"))
        kinds = {node["class_type"] for node in util.values() if isinstance(node, dict) and "class_type" in node}
        self.assertIn("ImageScale", kinds)
        self.assertNotIn("ImageScaleToMaxDimension", kinds)

    def test_workflow_params_include_vae_and_text_encoder(self) -> None:
        params = comfy._workflow_params(load_main("anima.json"))
        self.assertIn("checkpoint", params)
        self.assertIn("textEncoder", params)
        self.assertIn("vae", params)
        self.assertIn("clipType", params)
        self.assertIn("clipDevice", params)

    def test_checkpoint_params_omit_vae_and_text_encoder(self) -> None:
        params = comfy._workflow_params(load_main("sd15.json"))
        self.assertIn("checkpoint", params)
        self.assertNotIn("textEncoder", params)
        self.assertNotIn("vae", params)

    def test_sd15_params_include_clip_skip(self) -> None:
        params = comfy._workflow_params(load_main("sd15.json"))
        self.assertIn("clipSkip", params)
        self.assertIn("checkpoint", params)
        defaults = comfy._workflow_defaults(load_main("sd15.json"))
        self.assertEqual(defaults["steps"], 28)
        self.assertEqual(defaults["sampler"], "dpmpp_sde")
        self.assertEqual(defaults["scheduler"], "karras")
        self.assertEqual(defaults["width"], 512)
        self.assertEqual(defaults["height"], 768)
        self.assertEqual(defaults["clipSkip"], 2)
        self.assertEqual(defaults["cfg"], 7)

    def test_xl_family_workflow_defaults(self) -> None:
        sdxl = comfy._workflow_defaults(load_main("sdxl.json"))
        self.assertEqual(sdxl["steps"], 30)
        self.assertEqual(sdxl["sampler"], "dpmpp_2m_sde")
        self.assertEqual(sdxl["scheduler"], "karras")
        self.assertEqual(sdxl["width"], 832)
        self.assertEqual(sdxl["height"], 1216)
        self.assertEqual(sdxl["cfg"], 7)
        self.assertEqual(sdxl["clipSkip"], 2)
        illustrious = comfy._workflow_defaults(load_main("illustrious.json"))
        self.assertEqual(illustrious["steps"], 24)
        self.assertEqual(illustrious["sampler"], "euler_ancestral")
        self.assertEqual(illustrious["scheduler"], "sgm_uniform")
        self.assertEqual(illustrious["width"], 832)
        self.assertEqual(illustrious["height"], 1216)
        noobai = comfy._workflow_defaults(load_main("noobai.json"))
        self.assertEqual(noobai["steps"], 24)
        self.assertEqual(noobai["sampler"], "euler_ancestral")
        self.assertEqual(noobai["width"], 832)
        self.assertEqual(noobai["height"], 1216)
        graph = fill({**base_values(), "workflow": "sd15", "clip_skip": 2})
        _, skip = find(graph, "CLIPSetLastLayer")
        self.assertEqual(skip["inputs"]["stop_at_clip_layer"], -2)
        self.assertEqual(graph["2"]["inputs"]["clip"], ["13", 0])
        self.assertEqual(graph["3"]["inputs"]["clip"], ["13", 0])
        graph = fill({**base_values(), "workflow": "sd15", "clip_skip": 7})
        _, skip = find(graph, "CLIPSetLastLayer")
        self.assertEqual(skip["inputs"]["stop_at_clip_layer"], -7)

    def test_fill_hires_sampler_and_scale_size(self) -> None:
        graph = fill(
            base_values(
                scale=1.5,
                steps=15,
                cfg=3,
                cfg_override=True,
                sampler="dpmpp_2m",
                sampler_override=True,
                scheduler="karras",
                scheduler_override=True,
                denoise=0.55,
                seed=99,
                seed_follow=True,
            )
        )
        _, first_ks = find(graph, "KSampler", exclude="hires")
        hires_ks_id, hires_ks = find(graph, "KSampler", "hires")
        _, upscale_loader = find(graph, "UpscaleModelLoader")
        _, scale = find(graph, "ImageScale")
        _, save = find(graph, "SaveImage", exclude="first")
        decode_id, _ = find(graph, "VAEDecode", "hires")
        self.assertEqual(first_ks["inputs"]["seed"], 7)
        self.assertEqual(first_ks["inputs"]["steps"], 20)
        self.assertEqual(hires_ks["inputs"]["seed"], 7)
        self.assertEqual(hires_ks["inputs"]["steps"], 15)
        self.assertEqual(hires_ks["inputs"]["cfg"], 3)
        self.assertEqual(hires_ks["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(hires_ks["inputs"]["scheduler"], "karras")
        self.assertEqual(hires_ks["inputs"]["denoise"], 0.55)
        self.assertEqual(upscale_loader["inputs"]["model_name"], "4x.pth")
        self.assertEqual(scale["inputs"]["width"], 1248)
        self.assertEqual(scale["inputs"]["height"], 1824)
        self.assertEqual(scale["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(scale["inputs"]["crop"], "disabled")
        self.assertEqual(save["inputs"]["images"], [decode_id, 0])
        self.assertEqual(hires_ks["inputs"]["model"], ["1", 0])
        self.assertEqual(hires_ks["inputs"]["positive"], ["2", 0])
        self.assertEqual(hires_ks["inputs"]["negative"], ["3", 0])
        self.assertTrue(hires_ks_id.startswith("hires/"))

    def test_fill_hires_sampler_defaults_follow_first_pass(self) -> None:
        graph = fill(
            {
                **base_values(),
                "sampler": "dpmpp_2m",
                "scheduler": "karras",
                "cfg": 7,
                "steps": 20,
                "hires": {
                    "enabled": True,
                    "upscale_model": "4x.pth",
                    "sampler": "euler",
                    "scheduler": "sgm_uniform",
                    "cfg": 3,
                    "steps": 25,
                },
            }
        )
        _, hires_ks = find(graph, "KSampler", "hires")
        self.assertEqual(hires_ks["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(hires_ks["inputs"]["scheduler"], "karras")
        self.assertEqual(hires_ks["inputs"]["cfg"], 7)
        self.assertEqual(hires_ks["inputs"]["steps"], 25)
        self.assertEqual(hires_ks["inputs"]["denoise"], 0.55)

    def test_fill_hires_raw_size(self) -> None:
        graph = fill(base_values(scale=1.5, size_mode="raw", width=1024, height=768, steps=15, cfg=4, sampler="euler", scheduler="sgm_uniform", denoise=0.55, seed=7, seed_follow=True))
        _, scale = find(graph, "ImageScale")
        self.assertEqual(scale["inputs"]["width"], 1024)
        self.assertEqual(scale["inputs"]["height"], 768)
        self.assertEqual(scale["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(scale["inputs"]["crop"], "disabled")

    def test_fill_hires_scale_method_and_crop(self) -> None:
        graph = fill(base_values(upscale_method="lanczos", crop="center"))
        _, scale = find(graph, "ImageScale")
        self.assertEqual(scale["inputs"]["upscale_method"], "lanczos")
        self.assertEqual(scale["inputs"]["crop"], "center")

    def test_fill_hires_scale_method_invalid_falls_back(self) -> None:
        graph = fill(base_values(upscale_method="nope", crop="stretch"))
        _, scale = find(graph, "ImageScale")
        self.assertEqual(scale["inputs"]["upscale_method"], "bilinear")
        self.assertEqual(scale["inputs"]["crop"], "disabled")

    def test_fill_hires_seed_when_follow_off(self) -> None:
        graph = fill(base_values(scale=1.5, steps=15, cfg=4, sampler="euler", scheduler="sgm_uniform", denoise=0.4, seed=99, seed_follow=False))
        _, hires_ks = find(graph, "KSampler", "hires")
        self.assertEqual(hires_ks["inputs"]["seed"], 99)

    def test_fill_hires_prompt_override_rewires_clip(self) -> None:
        graph = fill(
            {
                **base_values(prompt_override=True, prompt="dog", negative_override=True, negative_prompt="noise"),
                "negative_prompt": "blur",
            }
        )
        _, hires_ks = find(graph, "KSampler", "hires")
        pos_id, pos = find(graph, "CLIPTextEncode", "hires positive")
        neg_id, neg = find(graph, "CLIPTextEncode", "hires negative")
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")
        self.assertEqual(pos["inputs"]["text"], "dog")
        self.assertEqual(neg["inputs"]["text"], "noise")
        self.assertEqual(hires_ks["inputs"]["positive"], [pos_id, 0])
        self.assertEqual(hires_ks["inputs"]["negative"], [neg_id, 0])
        self.assertEqual(hires_ks["inputs"]["model"], ["1", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["1", 0])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])

    def test_fill_hires_model_and_lora_override(self) -> None:
        graph = fill(
            {
                **base_values(
                    model_override=True,
                    checkpoint="hires.safetensors",
                    lora_override=True,
                    loras=[{"path": "hires-lora.safetensors", "strength": 0.4}],
                ),
                "loras": [{"path": "job.safetensors", "strength": 0.8}],
            }
        )
        ckpt_id, ckpt = find(graph, "CheckpointLoaderSimple", "hires")
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)", "hires")
        _, hires_ks = find(graph, "KSampler", "hires")
        pos_id, _ = find(graph, "CLIPTextEncode", "hires positive")
        neg_id, _ = find(graph, "CLIPTextEncode", "hires negative")
        _, encode = find(graph, "VAEEncode", "hires")
        _, decode = find(graph, "VAEDecode", "hires")
        self.assertEqual(graph["1"]["inputs"]["ckpt_name"], "model.safetensors")
        self.assertEqual(ckpt["inputs"]["ckpt_name"], "hires.safetensors")
        self.assertEqual(graph["12"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(lora["inputs"]["lora_1"]["lora"], "hires-lora.safetensors")
        self.assertEqual(lora["inputs"]["model"], [ckpt_id, 0])
        self.assertEqual(hires_ks["inputs"]["model"], [lora_id, 0])
        self.assertEqual(hires_ks["inputs"]["positive"], [pos_id, 0])
        self.assertEqual(hires_ks["inputs"]["negative"], [neg_id, 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])
        self.assertEqual(encode["inputs"]["vae"], [ckpt_id, 2])
        self.assertEqual(decode["inputs"]["vae"], [ckpt_id, 2])

    def test_fill_hires_model_override_reencodes_clip(self) -> None:
        graph = fill({**base_values(model_override=True, checkpoint="hires.safetensors"), "negative_prompt": "blur"})
        _, hires_ks = find(graph, "KSampler", "hires")
        pos_id, pos = find(graph, "CLIPTextEncode", "hires positive")
        neg_id, neg = find(graph, "CLIPTextEncode", "hires negative")
        ckpt_id, _ = find(graph, "CheckpointLoaderSimple", "hires")
        self.assertEqual(graph["2"]["inputs"]["text"], "cat")
        self.assertEqual(graph["3"]["inputs"]["text"], "blur")
        self.assertEqual(pos["inputs"]["text"], "cat")
        self.assertEqual(neg["inputs"]["text"], "blur")
        self.assertEqual(hires_ks["inputs"]["positive"], [pos_id, 0])
        self.assertEqual(hires_ks["inputs"]["negative"], [neg_id, 0])
        self.assertEqual(pos["inputs"]["clip"], [ckpt_id, 1])
        self.assertEqual(graph["5"]["inputs"]["positive"], ["2", 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["1", 0])

    def test_fill_hires_lora_override_keeps_prompt_blocks(self) -> None:
        graph = fill(
            {
                **base_values(
                    lora_override=True,
                    loras=[{"path": "hires-lora.safetensors", "strength": 0.4}],
                ),
                "prompt": "cat, <lora:foo:1>",
                "loras": [{"path": "job.safetensors", "strength": 0.8}, {"path": "foo.safetensors", "strength": 1}],
            }
        )
        _, first_lora = find(graph, "Power Lora Loader (rgthree)", exclude="hires")
        _, hires_lora = find(graph, "Power Lora Loader (rgthree)", "hires")
        _, hires_ks = find(graph, "KSampler", "hires")
        self.assertEqual(first_lora["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(first_lora["inputs"]["lora_2"]["lora"], "foo.safetensors")
        self.assertEqual(hires_lora["inputs"]["lora_1"]["lora"], "foo")
        self.assertEqual(hires_lora["inputs"]["lora_2"]["lora"], "hires-lora.safetensors")
        self.assertEqual(hires_ks["inputs"]["model"], [find(graph, "Power Lora Loader (rgthree)", "hires")[0], 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])

    def test_fill_hires_model_override_copies_first_pass_loras(self) -> None:
        graph = fill(
            {
                **base_values(model_override=True, checkpoint="hires.safetensors"),
                "loras": [{"path": "job.safetensors", "strength": 0.8}],
            }
        )
        ckpt_id, _ = find(graph, "CheckpointLoaderSimple", "hires")
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)", "hires")
        _, hires_ks = find(graph, "KSampler", "hires")
        self.assertEqual(graph["12"]["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(lora["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(lora["inputs"]["model"], [ckpt_id, 0])
        self.assertEqual(hires_ks["inputs"]["model"], [lora_id, 0])
        self.assertEqual(graph["5"]["inputs"]["model"], ["12", 0])

    def test_fill_hires_diffusion_override_on_txt2img(self) -> None:
        graph = fill(
            base_values(
                model_override=True,
                kind="diffusion_models",
                checkpoint="unet.safetensors",
                text_encoder="hires-clip.safetensors",
                vae="hires-vae.safetensors",
                lora_override=True,
                loras=[{"path": "hires-lora.safetensors", "strength": 0.4}],
            )
        )
        unet_id, unet = find(graph, "UNETLoader", "hires")
        clip_id, clip = find(graph, "CLIPLoader", "hires")
        vae_id, vae = find(graph, "VAELoader", "hires")
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)", "hires")
        _, hires_ks = find(graph, "KSampler", "hires")
        _, encode = find(graph, "VAEEncode", "hires")
        _, decode = find(graph, "VAEDecode", "hires")
        self.assertEqual(graph["1"]["inputs"]["ckpt_name"], "model.safetensors")
        self.assertEqual(unet["inputs"]["unet_name"], "unet.safetensors")
        self.assertEqual(clip["inputs"]["clip_name"], "hires-clip.safetensors")
        self.assertEqual(vae["inputs"]["vae_name"], "hires-vae.safetensors")
        self.assertEqual(lora["inputs"]["model"], [unet_id, 0])
        self.assertNotIn("clip", lora["inputs"])
        self.assertEqual(lora["inputs"]["lora_1"]["strengthTwo"], 0)
        self.assertEqual(hires_ks["inputs"]["model"], [lora_id, 0])
        self.assertEqual(encode["inputs"]["vae"], [vae_id, 0])
        self.assertEqual(decode["inputs"]["vae"], [vae_id, 0])
        with self.assertRaises(AssertionError):
            find(graph, "CheckpointLoaderSimple", "hires")

    def test_fill_hires_checkpoint_override_on_diffusion(self) -> None:
        graph = fill(
            {
                "workflow": "anima",
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
        )
        ckpt_id, ckpt = find(graph, "CheckpointLoaderSimple", "hires")
        _, hires_ks = find(graph, "KSampler", "hires")
        _, encode = find(graph, "VAEEncode", "hires")
        _, decode = find(graph, "VAEDecode", "hires")
        unet_id, _ = find(graph, "UNETLoader")
        self.assertEqual(graph["19"]["inputs"]["unet_name"], "unet.safetensors")
        self.assertEqual(ckpt["inputs"]["ckpt_name"], "illustrious.safetensors")
        self.assertEqual(hires_ks["inputs"]["model"], [ckpt_id, 0])
        self.assertEqual(graph["5"]["inputs"]["model"], [unet_id, 0])
        self.assertEqual(encode["inputs"]["vae"], [ckpt_id, 2])
        self.assertEqual(decode["inputs"]["vae"], [ckpt_id, 2])
        with self.assertRaises(AssertionError):
            find(graph, "UNETLoader", "hires")

    def test_fill_hires_seed_override_off_uses_first_pass(self) -> None:
        graph = fill(base_values(seed=99, seed_override=False))
        _, hires_ks = find(graph, "KSampler", "hires")
        self.assertEqual(hires_ks["inputs"]["seed"], 7)

    def test_fill_rewires_save_when_hires_off(self) -> None:
        graph = fill({**base_values(), "hires": {"enabled": False, "scale": 1.5}})
        self.assertEqual(graph["11"]["inputs"]["images"], ["9", 0])
        self.assertNotIn("10", graph)
        self.assertFalse(any(str(key).startswith("hires/") for key in graph))
        with self.assertRaises(AssertionError):
            find(graph, "ImageUpscaleWithModel")

    def test_fill_hires_saves_first_pass_by_default(self) -> None:
        graph = fill({**base_values(), "hires": {"enabled": True, "scale": 1.5}})
        decode_id, _ = find(graph, "VAEDecode", "hires")
        _, upscale = find(graph, "ImageUpscaleWithModel")
        self.assertEqual(graph["10"]["inputs"]["images"], ["9", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], [decode_id, 0])
        with self.assertRaises(AssertionError):
            find(graph, "easy cleanGpuUsed")
        self.assertEqual(upscale["inputs"]["image"], ["9", 0])

    def test_fill_hires_save_before_off_keeps_first_save(self) -> None:
        graph = fill(base_values(scale=1.5, save_before=False))
        decode_id, _ = find(graph, "VAEDecode", "hires")
        self.assertEqual(graph["10"]["inputs"]["images"], ["9", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], [decode_id, 0])

    def test_fill_hires_clear_vram_chains_clean_nodes(self) -> None:
        graph = fill(base_values(scale=1.5, clear_vram=True))
        before_id, before = find(graph, "easy cleanGpuUsed", "before")
        after_id, after = find(graph, "easy cleanGpuUsed", "after")
        decode_id, _ = find(graph, "VAEDecode", "hires")
        _, upscale = find(graph, "ImageUpscaleWithModel")
        self.assertEqual(before["inputs"]["anything"], ["9", 0])
        self.assertEqual(upscale["inputs"]["image"], [before_id, 0])
        self.assertEqual(after["inputs"]["anything"], [decode_id, 0])
        self.assertEqual(graph["11"]["inputs"]["images"], [decode_id, 0])

    def test_progress_stages_map_txt2img_nodes(self) -> None:
        graph = comfy._comfy_graph(load_main("sd15.json"))
        stages = comfy_fill.progress_stage_map(graph)
        self.assertEqual(stages["5"], "generation")
        self.assertEqual(stages["9"], "generation")
        self.assertEqual(stages["10"], "generation")
        self.assertEqual(stages["11"], "hires")
        composed = fill({**base_values(), "hires": {"enabled": True, "scale": 1.5, "clear_vram": True}})
        stages = comfy_fill.progress_stage_map(composed)
        upscale_id, _ = find(composed, "ImageUpscaleWithModel")
        scale_id, _ = find(composed, "ImageScale")
        ks_id, _ = find(composed, "KSampler", "hires")
        decode_id, _ = find(composed, "VAEDecode", "hires")
        before_id, _ = find(composed, "easy cleanGpuUsed", "before")
        after_id, _ = find(composed, "easy cleanGpuUsed", "after")
        self.assertEqual(stages[upscale_id], "upscaling")
        self.assertEqual(stages[scale_id], "upscaling")
        self.assertEqual(stages[before_id], "upscaling")
        self.assertEqual(stages[ks_id], "hires")
        self.assertEqual(stages[decode_id], "hires")
        self.assertEqual(stages[after_id], "hires")
        hires_stages = ("generation", "upscaling", "hires")
        self.assertEqual(comfy_fill.combined_progress("generation", 10, 20, hires_stages), 16)
        self.assertEqual(comfy_fill.combined_progress("upscaling", 0, 0, hires_stages), 33)
        self.assertEqual(comfy_fill.combined_progress("hires", 15, 15, hires_stages), 100)

    def test_fill_adetailer_detector_sam_and_detailer(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "bbox/face_yolov8m.pt",
                            "sam_model": "sam_vit_b.pt",
                            "guide_size": 384,
                            "steps": 12,
                            "cfg": 5,
                            "denoise": 0.4,
                            "advanced_override": True,
                            "device_mode": "CPU",
                            "sampler_override": True,
                            "sampler": "dpmpp_2m",
                        }
                    ],
                },
            }
        )
        _, detector = find(graph, "UltralyticsDetectorProvider")
        _, sam = find(graph, "SAMLoader")
        face_id, face = find(graph, "FaceDetailer")
        self.assertEqual(detector["inputs"]["model_name"], "bbox/face_yolov8m.pt")
        self.assertEqual(sam["inputs"]["model_name"], "sam_vit_b.pt")
        self.assertEqual(sam["inputs"]["device_mode"], "CPU")
        self.assertEqual(face["inputs"]["guide_size"], 384)
        self.assertEqual(face["inputs"]["steps"], 12)
        self.assertEqual(face["inputs"]["cfg"], 4)
        self.assertEqual(face["inputs"]["denoise"], 0.4)
        self.assertEqual(face["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(face["inputs"]["scheduler"], "sgm_uniform")
        self.assertEqual(face["inputs"]["seed"], 7)
        self.assertEqual(face["inputs"]["positive"], ["2", 0])
        self.assertEqual(face["inputs"]["negative"], ["3", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], [face_id, 0])
        self.assertNotIn("10", graph)
        with self.assertRaises(AssertionError):
            find(graph, "CheckpointLoaderSimple", "adetailer")
        with self.assertRaises(AssertionError):
            find(graph, "Power Lora Loader (rgthree)", "adetailer")
        stages = comfy_fill.progress_stage_map(graph)
        self.assertEqual(stages[face_id], "adetailer")
        self.assertEqual(stages["11"], "adetailer")
        self.assertEqual(
            comfy_fill.progress_stages({"adetailer": {"enabled": True, "units": [{}]}}),
            ("generation", "adetailer"),
        )

    def test_fill_adetailer_drops_empty_sam(self) -> None:
        graph = fill({**base_values(), "adetailer": {"enabled": True, "units": [{"detector": "face.pt"}]}})
        with self.assertRaises(AssertionError):
            find(graph, "SAMLoader")
        _, face = find(graph, "FaceDetailer")
        self.assertNotIn("sam_model_opt", face["inputs"])

    def test_fill_adetailer_prompt_override_keeps_encode(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [{"detector": "face.pt", "prompt_override": True, "prompt": "face closeup"}],
                },
            }
        )
        encode_id, encode = find(graph, "CLIPTextEncode", "adetailer positive")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(encode["inputs"]["text"], "face closeup")
        self.assertEqual(face["inputs"]["positive"], [encode_id, 0])

    def test_fill_hires_then_adetailer_chains_image(self) -> None:
        graph = fill(
            {
                **base_values(scale=1.5),
                "adetailer": {"enabled": True, "units": [{"detector": "face.pt"}]},
            }
        )
        decode_id, _ = find(graph, "VAEDecode", "hires")
        face_id, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["image"], [decode_id, 0])
        self.assertEqual(graph["11"]["inputs"]["images"], [face_id, 0])
        self.assertEqual(graph["10"]["inputs"]["images"], ["9", 0])

    def test_fill_adetailer_checkpoint_override(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "model_override": True,
                            "checkpoint": "other.safetensors",
                        }
                    ],
                },
            }
        )
        ckpt_id, ckpt = find(graph, "CheckpointLoaderSimple", "adetailer checkpoint")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(ckpt["inputs"]["ckpt_name"], "other.safetensors")
        self.assertEqual(face["inputs"]["model"], [ckpt_id, 0])
        self.assertEqual(face["inputs"]["clip"], [ckpt_id, 1])
        self.assertEqual(face["inputs"]["vae"], [ckpt_id, 2])

    def test_fill_adetailer_diffusion_override(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "model_override": True,
                            "kind": "diffusion_models",
                            "checkpoint": "unet.safetensors",
                            "text_encoder": "clip.safetensors",
                            "vae": "vae.safetensors",
                        }
                    ],
                },
            }
        )
        unet_id, unet = find(graph, "UNETLoader", "adetailer")
        clip_id, clip = find(graph, "CLIPLoader", "adetailer")
        vae_id, vae = find(graph, "VAELoader", "adetailer")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(unet["inputs"]["unet_name"], "unet.safetensors")
        self.assertEqual(clip["inputs"]["clip_name"], "clip.safetensors")
        self.assertEqual(vae["inputs"]["vae_name"], "vae.safetensors")
        self.assertEqual(face["inputs"]["model"], [unet_id, 0])
        self.assertEqual(face["inputs"]["clip"], [clip_id, 0])
        self.assertEqual(face["inputs"]["vae"], [vae_id, 0])

    def test_fill_adetailer_lora_override(self) -> None:
        graph = fill(
            {
                **base_values(),
                "loras": [{"path": "job.safetensors", "strength": 0.8}],
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "lora_override": True,
                            "loras": [{"path": "face-lora.safetensors", "strength": 0.4}],
                        }
                    ],
                },
            }
        )
        first_lora_id, first_lora = find(graph, "Power Lora Loader (rgthree)", exclude="adetailer")
        lora_id, lora = find(graph, "Power Lora Loader (rgthree)", "adetailer")
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(first_lora["inputs"]["lora_1"]["lora"], "job.safetensors")
        self.assertEqual(lora["inputs"]["lora_1"]["lora"], "face-lora.safetensors")
        self.assertEqual(lora["inputs"]["lora_1"]["strength"], 0.4)
        self.assertEqual(lora["inputs"]["model"], ["12", 0])
        self.assertEqual(lora["inputs"]["clip"], ["13", 0])
        self.assertEqual(face["inputs"]["model"], [lora_id, 0])
        self.assertEqual(face["inputs"]["clip"], [lora_id, 1])
        self.assertEqual(graph["5"]["inputs"]["model"], [first_lora_id, 0])

    def test_fill_adetailer_advanced_override_off_uses_defaults(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [{"detector": "face.pt", "bbox_threshold": 0.9}],
                },
            }
        )
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["bbox_threshold"], 0.5)

    def test_fill_adetailer_advanced_override_on_uses_slots(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "advanced_override": True,
                            "bbox_threshold": 0.9,
                        }
                    ],
                },
            }
        )
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["bbox_threshold"], 0.9)

    def test_fill_adetailer_cfg_override(self) -> None:
        graph = fill(
            {
                **base_values(),
                "adetailer": {
                    "enabled": True,
                    "units": [{"detector": "face.pt", "cfg_override": True, "cfg": 9}],
                },
            }
        )
        _, face = find(graph, "FaceDetailer")
        self.assertEqual(face["inputs"]["cfg"], 9)

    def test_fill_adetailer_from_hires_copies_overrides(self) -> None:
        graph = fill(
            {
                **base_values(
                    scale=1.5,
                    sampler_override=True,
                    sampler="dpmpp_2m",
                    scheduler_override=True,
                    scheduler="karras",
                    cfg_override=True,
                    cfg=9,
                    prompt_override=True,
                    prompt="hires face",
                ),
                "adetailer": {
                    "enabled": True,
                    "units": [{"detector": "face.pt", "from_hires": True, "sampler": "euler", "cfg": 2, "prompt": "ad prompt"}],
                },
            }
        )
        _, face = find(graph, "FaceDetailer")
        encode_id, encode = find(graph, "CLIPTextEncode", "adetailer positive")
        self.assertEqual(face["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(face["inputs"]["scheduler"], "karras")
        self.assertEqual(face["inputs"]["cfg"], 9)
        self.assertEqual(encode["inputs"]["text"], "hires face")
        self.assertEqual(face["inputs"]["positive"], [encode_id, 0])

    def test_fill_adetailer_from_hires_off_keeps_unit(self) -> None:
        graph = fill(
            {
                **base_values(scale=1.5, sampler_override=True, sampler="dpmpp_2m", cfg_override=True, cfg=9),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {
                            "detector": "face.pt",
                            "from_hires": False,
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

    def test_fill_adetailer_from_hires_is_per_unit(self) -> None:
        graph = fill(
            {
                **base_values(scale=1.5, sampler_override=True, sampler="dpmpp_2m", cfg_override=True, cfg=9),
                "adetailer": {
                    "enabled": True,
                    "units": [
                        {"detector": "face.pt", "from_hires": True},
                        {
                            "detector": "face.pt",
                            "from_hires": False,
                            "sampler_override": True,
                            "sampler": "heun",
                            "cfg_override": True,
                            "cfg": 3,
                        },
                    ],
                },
            }
        )
        faces = [
            node
            for node in graph.values()
            if isinstance(node, dict) and node.get("class_type") == "FaceDetailer"
        ]
        self.assertEqual(len(faces), 2)
        self.assertEqual(faces[0]["inputs"]["sampler_name"], "dpmpp_2m")
        self.assertEqual(faces[0]["inputs"]["cfg"], 9)
        self.assertEqual(faces[1]["inputs"]["sampler_name"], "heun")
        self.assertEqual(faces[1]["inputs"]["cfg"], 3)


class ModelKindTests(unittest.TestCase):
    def test_kinds_include_diffusion_and_text_encoders(self) -> None:
        self.assertIn("diffusion_models", models.KINDS)
        self.assertIn("text_encoders", models.KINDS)
        self.assertIn("upscale_models", models.KINDS)
        self.assertIn("sams", models.KINDS)
        self.assertIn("ultralytics", models.KINDS)


class ComfyFilenameTests(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = {folder: list(rows) for folder, rows in comfy._model_names.items()}
        comfy._model_names.clear()
        self._reach = patch.object(comfy, "reachable", return_value=False)
        self._reach.start()
        self._extra = patch.object(comfy.dirs, "extra_named", return_value={})
        self._extra.start()

    def tearDown(self) -> None:
        self._extra.stop()
        self._reach.stop()
        comfy._model_names.clear()
        comfy._model_names.update(self._saved)

    def test_comfy_filename_matches_checkpoint_backslashes(self) -> None:
        comfy._model_names["checkpoints"] = [r"Illustrious\Style\foo.safetensors"]
        self.assertEqual(
            comfy.comfy_filename("Illustrious/Style/foo.safetensors"),
            r"Illustrious\Style\foo.safetensors",
        )

    def test_comfy_filename_matches_ultralytics_slashes(self) -> None:
        comfy._model_names["ultralytics"] = ["bbox/face_yolov8m.pt"]
        self.assertEqual(comfy.comfy_filename(r"bbox\face_yolov8m.pt"), "bbox/face_yolov8m.pt")
        self.assertEqual(comfy.comfy_filename("bbox/face_yolov8m.pt"), "bbox/face_yolov8m.pt")

    def test_comfy_filename_ultralytics_backslash_list_returns_slashes(self) -> None:
        comfy._model_names["ultralytics"] = [r"bbox\face_yolov8m.pt"]
        self.assertEqual(comfy.comfy_filename("bbox/face_yolov8m.pt"), "bbox/face_yolov8m.pt")
        self.assertEqual(comfy.comfy_filename(r"bbox\face_yolov8m.pt"), "bbox/face_yolov8m.pt")

    def test_comfy_filename_falls_back_to_forward_slashes(self) -> None:
        self.assertEqual(comfy.comfy_filename(r"bbox\face_yolov8m.pt"), "bbox/face_yolov8m.pt")
        self.assertEqual(
            comfy.comfy_filename("Illustrious/Style/foo.safetensors"),
            "Illustrious/Style/foo.safetensors",
        )

    def test_comfy_filename_no_match_uses_forward_slashes(self) -> None:
        comfy._model_names["checkpoints"] = [r"other\model.safetensors"]
        self.assertEqual(
            comfy.comfy_filename("Illustrious/Style/foo.safetensors"),
            "Illustrious/Style/foo.safetensors",
        )


class RoundTo8Tests(unittest.TestCase):
    def test_ceils_to_multiples_of_eight(self) -> None:
        self.assertEqual(comfy_fill.round_to_8(8), 8)
        self.assertEqual(comfy_fill.round_to_8(1001), 1008)
        self.assertEqual(comfy_fill.round_to_8(1224.74), 1232)


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
        self.assertEqual(settings._clean({"hiresTempAfterDays": 7})["hiresTempAfterDays"], 7)
        self.assertEqual(settings._clean({"hiresTempAfterDays": 0})["hiresTempAfterDays"], 1)


if __name__ == "__main__":
    unittest.main()
