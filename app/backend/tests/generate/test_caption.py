from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from config import WORKFLOWS
from features.generate.scripts import templates
from features.generate.scripts.job import job_output
from features.generate.scripts.workflow import caption, comfy_fill
from infrastructure.comfy import client as comfy

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


def write_png(path: Path, size: tuple[int, int] = (1000, 1000)) -> None:
    image = Image.new("RGB", size, (20, 80, 160))
    image.save(path, format="PNG")


class CaptionWorkflowTests(unittest.TestCase):
    def test_list_workflows_name_category_and_params(self) -> None:
        item = next(row for row in comfy.list_workflows() if row["id"] == "image_caption")
        self.assertEqual(item["name"], "Image Caption")
        self.assertEqual(item["category"], "utility")
        self.assertIn("caption", item["params"])
        self.assertNotIn("checkpoint", item["params"])
        self.assertNotIn("hires", item["params"])

    def test_fill_keeps_wd14_and_drops_qwen(self) -> None:
        src = Path(tempfile.mkdtemp()) / "cat.png"
        write_png(src, (2000, 1000))
        graph = fill(
            {
                "workflow": "image_caption",
                "input_image": src.name,
                "source_image": str(src),
                "caption": {"engine": "wd14", "wd14_model": "wd-vit-tagger-v3", "prefix": "solo, ", "suffix": ", masterpiece"},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("WD14Tagger|pysssss", kinds)
        self.assertNotIn("AILab_QwenVL", kinds)
        self.assertNotIn("SaveStringKJ", kinds)
        self.assertEqual(find(graph, "LoadImage")[1]["inputs"]["image"], src.name)
        tagger = find(graph, "WD14Tagger|pysssss")[1]
        self.assertEqual(tagger["inputs"]["model"], "wd-vit-tagger-v3")
        scale = find(graph, "ImageScale")[1]
        width, height = caption.target_size(src, 1.0)
        self.assertEqual(scale["inputs"]["width"], width)
        self.assertEqual(scale["inputs"]["height"], height)
        save = find(graph, "SaveImage")[1]
        self.assertEqual(save["inputs"]["images"][0], find(graph, "ImageScale")[0])
        shutil.rmtree(src.parent, ignore_errors=True)

    def test_fill_keeps_qwen_and_sets_prompt(self) -> None:
        src = Path(tempfile.mkdtemp()) / "dog.png"
        write_png(src, (500, 500))
        graph = fill(
            {
                "workflow": "image_caption",
                "input_image": src.name,
                "source_image": str(src),
                "caption": {"engine": "qwen", "qwen_model": "Qwen3-VL-2B-Instruct", "guidance": "Focus on clothing."},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("AILab_QwenVL", kinds)
        self.assertNotIn("WD14Tagger|pysssss", kinds)
        node = find(graph, "AILab_QwenVL")[1]
        self.assertEqual(node["inputs"]["model_name"], "Qwen3-VL-2B-Instruct")
        self.assertIn("Focus on clothing.", node["inputs"]["custom_prompt"])
        self.assertIn("Mark the subject as `Character`.", node["inputs"]["custom_prompt"])
        self.assertTrue(node["inputs"]["keep_model_loaded"])
        str_save = find(graph, "SaveStringKJ")[1]
        self.assertEqual(str_save["inputs"]["string"][0], find(graph, "AILab_QwenVL")[0])
        shutil.rmtree(src.parent, ignore_errors=True)

    def test_fill_drops_save_image_when_unchecked(self) -> None:
        graph = fill(
            {
                "workflow": "image_caption",
                "input_image": "a.png",
                "caption": {"engine": "wd14", "save_image": False},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertNotIn("SaveImage", kinds)
        self.assertIn("WD14Tagger|pysssss", kinds)

    def test_fill_wd14_batches_with_image_batch(self) -> None:
        folder = Path(tempfile.mkdtemp())
        one = folder / "one.png"
        two = folder / "two.png"
        write_png(one, (100, 100))
        write_png(two, (100, 100))
        graph = fill(
            {
                "workflow": "image_caption",
                "input_image": one.name,
                "input_images": [one.name, two.name],
                "source_images": [str(one), str(two)],
                "caption": {"engine": "wd14", "batch_count": 2},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("ImageBatch", kinds)
        loads = [node["inputs"]["image"] for node in graph.values() if isinstance(node, dict) and node.get("class_type") == "LoadImage"]
        self.assertEqual(sorted(loads), ["one.png", "two.png"])
        shutil.rmtree(folder, ignore_errors=True)

    def test_format_caption_prefix_suffix(self) -> None:
        blob = caption.clean_caption({"engine": "wd14", "prefix": "solo, ", "suffix": ", masterpiece"})
        self.assertEqual(caption.format_caption(blob, "1girl, smile"), "solo, 1girl, smile, masterpiece")
        qwen = caption.clean_caption({"engine": "qwen", "prefix": "x"})
        self.assertEqual(caption.format_caption(qwen, " a cat "), "a cat")


class CaptionNamingTests(unittest.TestCase):
    def test_index_and_filename_tokens(self) -> None:
        now = datetime(2026, 8, 31, 12, 0, 0)
        values = {
            "workflow": "image_caption",
            "run_index": 3,
            "source_image": r"C:\tmp\photo of cat.png",
        }
        self.assertEqual(job_output._token_value("index", values, now), "000003")
        self.assertEqual(job_output._token_value("filename", values, now), "photo_of_cat")

    def test_empty_name_uses_source_stem(self) -> None:
        values = {
            "workflow": "image_caption",
            "output_image_name": "",
            "source_image": "/tmp/my file.png",
        }
        template, _ = job_output._name_template(values, "images")
        self.assertEqual(template, "my_file")

    def test_default_name_is_index(self) -> None:
        values = {"workflow": "image_caption"}
        template, fallback = job_output._name_template(values, "images")
        self.assertEqual(template, "[index]")
        self.assertEqual(fallback, "[index]")


class CaptionInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_input_runs_chunks_wd14(self) -> None:
        paths = []
        for name in ("a.png", "b.png", "c.png"):
            path = self.tmp / name
            path.write_bytes(b"x")
            paths.append(path)
        runs = caption.input_runs(
            {
                "workflow": "image_caption",
                "input_paths": [str(path) for path in paths],
                "caption": {"engine": "wd14", "batch_count": 2},
            }
        )
        self.assertEqual(len(runs), 2)
        self.assertEqual(runs[0]["input_images"], [str(paths[0]), str(paths[1])])
        self.assertEqual(runs[1]["input_images"], [str(paths[2])])
        self.assertEqual(runs[0]["file_index"], 1)
        self.assertEqual(runs[1]["file_index"], 3)

    def test_input_runs_qwen_is_one_per_file(self) -> None:
        one = self.tmp / "a.png"
        two = self.tmp / "b.png"
        one.write_bytes(b"x")
        two.write_bytes(b"x")
        runs = caption.input_runs(
            {
                "workflow": "image_caption",
                "input_paths": [str(one), str(two)],
                "caption": {"engine": "qwen", "batch_count": 2},
            }
        )
        self.assertEqual(len(runs), 2)
        self.assertEqual(runs[0]["input_images"], [str(one)])
        self.assertEqual(runs[1]["input_images"], [str(two)])


class CaptionHistoryTests(unittest.TestCase):
    def test_output_texts_prefers_wd14_tags(self) -> None:
        texts = comfy.output_texts(
            {
                "outputs": {
                    "3": {"tags": ["1girl, smile", "1boy, hat"]},
                    "6": {"string": "1girl, smile\n1boy, hat"},
                }
            }
        )
        self.assertEqual(texts, ["1girl, smile", "1boy, hat"])

    def test_output_texts_reads_qwen_response(self) -> None:
        texts = comfy.output_texts({"outputs": {"4": {"RESPONSE": " a cat in a hat "}, "6": {"string": " a cat in a hat "}}})
        self.assertEqual(texts, ["a cat in a hat"])

    def test_output_texts_falls_back_to_string(self) -> None:
        texts = comfy.output_texts({"outputs": {"6": {"string": "caption here"}}})
        self.assertEqual(texts, ["caption here"])


class CaptionTemplateTests(unittest.TestCase):
    def test_default_apply(self) -> None:
        expected = list(templates._CAPTION_APPLY) + ["outputPath"]
        self.assertEqual(templates.default_apply("image_caption"), expected)
