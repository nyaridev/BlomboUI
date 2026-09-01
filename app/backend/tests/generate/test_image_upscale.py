from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from config import WORKFLOWS
from features.generate.scripts import templates
from features.generate.scripts.job import job_output
from features.generate.scripts.workflow import comfy_fill, upscale
from infrastructure.comfy import client as comfy
from infrastructure.storage import user as db

MAIN = WORKFLOWS / "utils"


def load_main(name: str) -> dict:
    return json.loads((MAIN / name).read_text(encoding="utf-8"))


def find(graph: dict, kind: str) -> tuple[str, dict]:
    for key, node in graph.items():
        if isinstance(node, dict) and node.get("class_type") == kind:
            return str(key), node
    raise AssertionError(f"missing {kind}")


def fill(values: dict) -> dict:
    data = load_main(f"{values.get('workflow') or 'sd15'}.json")
    with patch.object(comfy_fill.lora_tags, "apply"):
        return comfy_fill.fill_txt2img(values, lambda _: data, lambda name: name, comfy._comfy_graph)


def write_png(path: Path, size: tuple[int, int] = (64, 96)) -> None:
    image = Image.new("RGB", size, (20, 80, 160))
    image.save(path, format="PNG")


class ImageUpscaleWorkflowTests(unittest.TestCase):
    def test_list_workflows_name_category_and_params(self) -> None:
        item = next(row for row in comfy.list_workflows() if row["id"] == "image_upscale")
        self.assertEqual(item["name"], "Image Upscale")
        self.assertEqual(item["category"], "utility")
        self.assertIn("upscale", item["params"])
        self.assertNotIn("checkpoint", item["params"])
        self.assertNotIn("hires", item["params"])

    def test_fill_model_engine_drops_seedvr2(self) -> None:
        src = Path(tempfile.mkdtemp()) / "cat.png"
        write_png(src, (80, 120))
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": src.name,
                "source_image": str(src),
                "upscale": {"engine": "model", "upscale_model": "4x.pth", "scale": 2, "size_mode": "scale"},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("ImageUpscaleWithModel", kinds)
        self.assertIn("ImageScale", kinds)
        self.assertNotIn("SeedVR2VideoUpscaler", kinds)
        self.assertNotIn("SeedVR2TorchCompileSettings", kinds)
        self.assertEqual(find(graph, "LoadImage")[1]["inputs"]["image"], src.name)
        self.assertEqual(find(graph, "UpscaleModelLoader")[1]["inputs"]["model_name"], "4x.pth")
        scale = find(graph, "ImageScale")[1]
        self.assertEqual(scale["inputs"]["width"], 160)
        self.assertEqual(scale["inputs"]["height"], 240)
        save = find(graph, "SaveImage")[1]
        self.assertEqual(save["inputs"]["images"][0], find(graph, "ImageScale")[0])
        shutil.rmtree(src.parent, ignore_errors=True)

    def test_fill_model_max_fits_long_side(self) -> None:
        src = Path(tempfile.mkdtemp()) / "cat.png"
        write_png(src, (80, 120))
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": src.name,
                "source_image": str(src),
                "upscale": {
                    "engine": "model",
                    "upscale_model": "4x.pth",
                    "size_mode": "max",
                    "max_resolution": 1536,
                },
            }
        )
        scale = find(graph, "ImageScale")[1]
        self.assertEqual(scale["inputs"]["width"], 1024)
        self.assertEqual(scale["inputs"]["height"], 1536)
        shutil.rmtree(src.parent, ignore_errors=True)
        src = Path(tempfile.mkdtemp()) / "dog.png"
        write_png(src, (128, 64))
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": src.name,
                "source_image": str(src),
                "upscale": {
                    "engine": "seedvr2",
                    "seed": 7,
                    "color_correction": "lab",
                    "dit_model": "dit.safetensors",
                    "vae_model": "vae.safetensors",
                },
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("SeedVR2VideoUpscaler", kinds)
        self.assertNotIn("ImageUpscaleWithModel", kinds)
        self.assertNotIn("SeedVR2TorchCompileSettings", kinds)
        node = find(graph, "SeedVR2VideoUpscaler")[1]
        self.assertEqual(node["inputs"]["seed"], 7)
        self.assertEqual(node["inputs"]["resolution"], 2560)
        self.assertEqual(node["inputs"]["max_resolution"], 2560)
        dit = find(graph, "SeedVR2LoadDiTModel")[1]
        self.assertEqual(dit["inputs"]["model"], "dit.safetensors")
        self.assertNotIn("torch_compile_args", dit["inputs"])
        vae = find(graph, "SeedVR2LoadVAEModel")[1]
        self.assertNotIn("torch_compile_args", vae["inputs"])
        save = find(graph, "SaveImage")[1]
        self.assertEqual(save["inputs"]["images"][0], find(graph, "SeedVR2VideoUpscaler")[0])
        shutil.rmtree(src.parent, ignore_errors=True)

    def test_fill_seedvr2_writes_resolution_pair(self) -> None:
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": "x.png",
                "upscale": {"engine": "seedvr2", "resolution": 2048, "max_resolution": 1536},
            }
        )
        node = find(graph, "SeedVR2VideoUpscaler")[1]
        self.assertEqual(node["inputs"]["resolution"], 2048)
        self.assertEqual(node["inputs"]["max_resolution"], 1536)

    def test_fill_seedvr2_keeps_compile_when_allowed(self) -> None:
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": "x.png",
                "upscale": {"engine": "seedvr2", "allow_compile": True, "compile_backend": "inductor"},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("SeedVR2TorchCompileSettings", kinds)
        compile_id = find(graph, "SeedVR2TorchCompileSettings")[0]
        self.assertEqual(find(graph, "SeedVR2LoadDiTModel")[1]["inputs"]["torch_compile_args"][0], compile_id)

    def test_clean_upscale_default_seed_is_42(self) -> None:
        blob = upscale.clean_upscale({})
        self.assertEqual(blob["seed"], 42)
        self.assertEqual(blob["resolution"], 2560)
        self.assertEqual(blob["max_resolution"], 2560)

    def test_clean_upscale_allows_zero_max_resolution(self) -> None:
        blob = upscale.clean_upscale({"max_resolution": 0})
        self.assertEqual(blob["max_resolution"], 0)

    def test_fill_seedvr2_wraps_overflow_seed(self) -> None:
        overflow = 4586839000023720
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": "x.png",
                "seed": overflow,
                "upscale": {"engine": "seedvr2", "seed": overflow},
            }
        )
        seed = find(graph, "SeedVR2VideoUpscaler")[1]["inputs"]["seed"]
        self.assertEqual(seed, overflow % upscale.SEED_SPAN)
        self.assertGreaterEqual(seed, 0)
        self.assertLessEqual(seed, upscale.SEED_MAX)

    def test_fill_seedvr2_randomizes_negative_seed(self) -> None:
        graph = fill(
            {
                "workflow": "image_upscale",
                "input_image": "x.png",
                "seed": -1,
                "upscale": {"engine": "seedvr2", "seed": -1},
            }
        )
        seed = find(graph, "SeedVR2VideoUpscaler")[1]["inputs"]["seed"]
        self.assertIsInstance(seed, int)
        self.assertGreaterEqual(seed, 0)
        self.assertLessEqual(seed, upscale.SEED_MAX)


class ImageUpscaleOutputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "output"
        self.out.mkdir()
        self.patch = patch.object(job_output, "outputs_root", return_value=self.out)
        self.patch.start()

    def tearDown(self) -> None:
        self.patch.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_default_under_outputs(self) -> None:
        folder = job_output._output_dir({"workflow": "image_upscale"}, "image")
        self.assertTrue(str(folder.resolve()).startswith(str(self.out.resolve())))
        self.assertIn("image_upscale", folder.parts)


class ImageUpscaleTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "blombo.sqlite"),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_default_apply_from_workflow_json(self) -> None:
        apply = templates.default_apply("image_upscale")
        self.assertEqual(apply, list(templates._UPSCALE_APPLY) + ["outputPath"])

    def test_clean_params_keeps_upscale_blob(self) -> None:
        created = templates.create_template(
            "image_upscale",
            "Big",
            {"upscale": {"engine": "seedvr2", "scale": 2, "ditModel": "dit.safetensors"}},
        )
        blob = created["params"]["upscale"]
        self.assertEqual(blob["engine"], "seedvr2")
        self.assertEqual(blob["dit_model"], "dit.safetensors")
        self.assertFalse(blob["allow_compile"])


class ImageUpscaleListTests(unittest.TestCase):
    def test_list_seedvr2_models(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "SEEDVR2"
            folder.mkdir()
            (folder / "a.safetensors").write_bytes(b"x")
            nested = folder / "sub"
            nested.mkdir()
            (nested / "b.pt").write_bytes(b"x")
            (folder / "skip.txt").write_text("no", encoding="utf-8")
            with patch.object(upscale, "comfy_models_root", return_value=root), patch.object(
                upscale, "models_root", return_value=root / "missing"
            ):
                names = upscale.list_seedvr2_models()
        self.assertEqual(names, ["a.safetensors", "sub/b.pt"])


if __name__ == "__main__":
    unittest.main()
