from __future__ import annotations

import json
import unittest

from config import WORKFLOWS
from features.generate.scripts.api_to_ui import to_ui_workflow
from features.generate.scripts.compose import (
    adetailer_util_stem,
    apply_adetailer,
    apply_hires,
    apply_stage,
    hires_util_stem,
    load_util,
)
from infrastructure.comfy import client as comfy


class ComposeTests(unittest.TestCase):
    def test_port_image_rewires_and_save_follows_output(self) -> None:
        host = {
            "ports": {"IMAGE": ["9", 0]},
            "9": {
                "class_type": "VAEDecode",
                "inputs": {},
                "_meta": {"title": "VAE Decode"},
            },
            "11": {
                "class_type": "SaveImage",
                "inputs": {"images": ["9", 0]},
                "_meta": {"title": "Save Image"},
            },
        }
        util = {
            "attach": "after_decode",
            "ports": {"IMAGE": ["2", 0]},
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": "x.png"},
                "_meta": {"title": "PORT:IMAGE"},
            },
            "2": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["1", 0]},
                "_meta": {"title": "Hires VAE Decode"},
            },
        }
        graph = apply_stage(host, util, "hires")
        self.assertNotIn("hires/1", graph)
        self.assertEqual(graph["hires/2"]["inputs"]["samples"], ["9", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["hires/2", 0])
        self.assertEqual(graph["ports"]["IMAGE"], ["hires/2", 0])

    def test_missing_host_port_raises(self) -> None:
        host = {"ports": {}, "9": {"class_type": "VAEDecode", "inputs": {}}}
        util = {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": "x.png"},
                "_meta": {"title": "PORT:IMAGE"},
            }
        }
        with self.assertRaises(ValueError):
            apply_stage(host, util, "hires")

    def test_hires_kind_picks_diffusion_util(self) -> None:
        self.assertEqual(hires_util_stem({"kind": "diffusion_models"}), "hiresfix_diffusion")
        self.assertEqual(hires_util_stem({"kind": "checkpoints"}), "hiresfix_checkpoint")
        self.assertEqual(hires_util_stem({}), "hiresfix_checkpoint")

    def test_load_util_and_apply_hires_on_txt2img(self) -> None:
        util = load_util("hiresfix_checkpoint")
        self.assertEqual(util["8"]["class_type"], "ImageUpscaleWithModel")
        host = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        graph = apply_hires(host, {"hires": {"enabled": True}})
        self.assertNotIn("hires/1", graph)
        self.assertEqual(graph["hires/8"]["class_type"], "ImageUpscaleWithModel")
        self.assertEqual(graph["hires/8"]["inputs"]["image"], ["9", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["hires/12", 0])
        self.assertEqual(graph["ports"]["IMAGE"], ["hires/12", 0])

    def test_apply_adetailer_chains_units_and_rewires_save(self) -> None:
        host = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        graph = apply_adetailer(host, {"adetailer": {"enabled": True, "units": [{}, {}]}})
        self.assertEqual(graph["adetailer/0/3"]["class_type"], "FaceDetailer")
        self.assertEqual(graph["adetailer/1/3"]["class_type"], "FaceDetailer")
        self.assertNotIn("adetailer/0/6", graph)
        self.assertNotIn("adetailer/1/6", graph)
        self.assertEqual(graph["adetailer/0/3"]["inputs"]["image"], ["9", 0])
        self.assertEqual(graph["adetailer/1/3"]["inputs"]["image"], ["adetailer/0/3", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["adetailer/1/3", 0])
        self.assertEqual(graph["ports"]["IMAGE"], ["adetailer/1/3", 0])

    def test_apply_adetailer_skips_disabled_units(self) -> None:
        host = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        graph = apply_adetailer(
            host, {"adetailer": {"enabled": True, "units": [{"enabled": False}, {}]}}
        )
        self.assertNotIn("adetailer/1/3", graph)
        self.assertEqual(graph["adetailer/0/3"]["class_type"], "FaceDetailer")
        self.assertEqual(graph["11"]["inputs"]["images"], ["adetailer/0/3", 0])

    def test_adetailer_kind_picks_diffusion_util(self) -> None:
        self.assertEqual(adetailer_util_stem({"kind": "diffusion_models"}), "adetailer_diffusion")
        self.assertEqual(adetailer_util_stem({"kind": "checkpoints"}), "adetailer_checkpoint")
        self.assertEqual(adetailer_util_stem({}), "adetailer_checkpoint")

    def test_apply_adetailer_diffusion_unit_loads_unet(self) -> None:
        host = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        graph = apply_adetailer(
            host, {"adetailer": {"enabled": True, "units": [{"kind": "diffusion_models"}]}}
        )
        self.assertEqual(graph["adetailer/0/12"]["class_type"], "UNETLoader")
        self.assertEqual(graph["adetailer/0/13"]["class_type"], "CLIPLoader")
        self.assertEqual(graph["adetailer/0/14"]["class_type"], "VAELoader")

    def test_apply_hires_then_adetailer_uses_hires_image(self) -> None:
        host = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        hires = apply_hires(host, {"hires": {"enabled": True}})
        graph = apply_adetailer(hires, {"adetailer": {"enabled": True, "units": [{}]}})
        self.assertEqual(graph["adetailer/0/3"]["inputs"]["image"], ["hires/12", 0])
        self.assertEqual(graph["11"]["inputs"]["images"], ["adetailer/0/3", 0])
        self.assertEqual(graph["ports"]["IMAGE"], ["adetailer/0/3", 0])

    def test_api_to_ui_has_nodes_and_links(self) -> None:
        api = json.loads((WORKFLOWS / "main" / "txt2img.json").read_text(encoding="utf-8"))
        ui = to_ui_workflow(api)
        self.assertIn("nodes", ui)
        self.assertIn("links", ui)
        self.assertTrue(ui["nodes"])
        self.assertTrue(ui["links"])
        self.assertEqual(ui["version"], 0.4)
        types = {node["type"] for node in ui["nodes"]}
        self.assertIn("CheckpointLoaderSimple", types)
        self.assertNotIn("ImageUpscaleWithModel", types)

    def test_list_workflows_skips_raw_and_utils(self) -> None:
        items = comfy.list_workflows()
        ids = [item["id"] for item in items]
        self.assertIn("txt2img", ids)
        self.assertIn("diffusion", ids)
        self.assertNotIn("txt2img_raw", ids)
        self.assertNotIn("hiresfix_checkpoint", ids)
        txt2img = next(item for item in items if item["id"] == "txt2img")
        self.assertIn("hires", txt2img["params"])


if __name__ == "__main__":
    unittest.main()
