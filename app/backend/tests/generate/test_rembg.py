from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from io import BytesIO

from PIL import Image

from config import WORKFLOWS
from features.generate.scripts import save_meta, templates
from features.generate.scripts.job import job_output
from features.generate.scripts.workflow import comfy_fill, rembg
from infrastructure.comfy import client as comfy
from infrastructure.storage import user as db
from shared import pnginfo

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


def _png() -> bytes:
    image = Image.new("RGBA", (16, 16), (20, 80, 160, 255))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


class RembgWorkflowTests(unittest.TestCase):
    def test_list_workflows_name_category_and_params(self) -> None:
        item = next(row for row in comfy.list_workflows() if row["id"] == "background_removal")
        self.assertEqual(item["name"], "Background Removal")
        self.assertEqual(item["category"], "utility")
        self.assertIn("rembg", item["params"])
        self.assertNotIn("checkpoint", item["params"])
        self.assertNotIn("hires", item["params"])

    def test_fill_keeps_rmbg_and_drops_birefnet(self) -> None:
        graph = fill(
            {
                "workflow": "background_removal",
                "input_image": "cat.png",
                "rembg": {"engine": "rmbg", "rmbg_model": "BEN", "sensitivity": 0.5, "process_res": 512},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("RMBG", kinds)
        self.assertNotIn("BiRefNetRMBG", kinds)
        self.assertEqual(find(graph, "LoadImage")[1]["inputs"]["image"], "cat.png")
        node = find(graph, "RMBG")[1]
        self.assertEqual(node["inputs"]["model"], "BEN")
        self.assertEqual(node["inputs"]["process_res"], 512)
        self.assertEqual(node["inputs"]["sensitivity"], 0.5)
        save = find(graph, "SaveImage")[1]
        self.assertEqual(save["inputs"]["images"][0], find(graph, "RMBG")[0])

    def test_fill_keeps_birefnet_and_drops_rmbg(self) -> None:
        graph = fill(
            {
                "workflow": "background_removal",
                "input_image": "dog.jpg",
                "rembg": {"engine": "birefnet", "birefnet_model": "BiRefNet-HR"},
            }
        )
        kinds = {node.get("class_type") for node in graph.values() if isinstance(node, dict)}
        self.assertIn("BiRefNetRMBG", kinds)
        self.assertNotIn("RMBG", kinds)
        node = find(graph, "BiRefNetRMBG")[1]
        self.assertEqual(node["inputs"]["model"], "BiRefNet-HR")
        self.assertNotIn("process_res", node["inputs"])
        save = find(graph, "SaveImage")[1]
        self.assertEqual(save["inputs"]["images"][0], find(graph, "BiRefNetRMBG")[0])


class RembgInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_list_folder_images_non_recursive(self) -> None:
        (self.tmp / "a.png").write_bytes(b"x")
        (self.tmp / "b.jpg").write_bytes(b"x")
        (self.tmp / "skip.txt").write_text("no", encoding="utf-8")
        nested = self.tmp / "nested"
        nested.mkdir()
        (nested / "c.png").write_bytes(b"x")
        paths = rembg.list_folder_images(self.tmp)
        names = {path.name for path in paths}
        self.assertEqual(names, {"a.png", "b.jpg"})

    def test_input_runs_from_paths(self) -> None:
        one = self.tmp / "one.png"
        two = self.tmp / "two.webp"
        one.write_bytes(b"x")
        two.write_bytes(b"x")
        runs = rembg.input_runs({"workflow": "background_removal", "input_paths": [str(one), str(two), str(self.tmp / "missing.png")]})
        self.assertEqual(len(runs), 2)
        self.assertEqual(runs[0]["input_image"], str(one))
        self.assertEqual(runs[1]["input_image"], str(two))


class RembgOutputTests(unittest.TestCase):
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
        folder = job_output._output_dir({"workflow": "background_removal"}, "image")
        self.assertTrue(str(folder.resolve()).startswith(str(self.out.resolve())))
        self.assertIn("background_removal", folder.parts)

    def test_absolute_override(self) -> None:
        dest = self.tmp / "anywhere"
        folder = job_output._output_dir({"workflow": "background_removal", "output_image_path": str(dest)}, "image")
        self.assertEqual(folder, dest)
        self.assertTrue(dest.is_dir())

    def test_txt2img_relative_escape_stays_in_root(self) -> None:
        folder = job_output._output_dir({"workflow": "sd15", "output_image_path": "../escape"}, "image")
        self.assertTrue(str(folder.resolve()).startswith(str(self.out.resolve())))


class RembgTemplateTests(unittest.TestCase):
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
        apply = templates.default_apply("background_removal")
        self.assertEqual(apply, ["rembg", "outputPath"])

    def test_clean_params_keeps_rembg_blob(self) -> None:
        created = templates.create_template(
            "background_removal",
            "Cutout",
            {"rembg": {"engine": "birefnet", "birefnetModel": "BiRefNet-HR", "sensitivity": 0.8}},
        )
        blob = created["params"]["rembg"]
        self.assertEqual(blob["engine"], "birefnet")
        self.assertEqual(blob["birefnet_model"], "BiRefNet-HR")
        self.assertEqual(blob["sensitivity"], 0.8)
        self.assertFalse(blob["preserve_metadata"])


class RembgMetaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_clean_preserve_defaults_off(self) -> None:
        self.assertFalse(rembg.clean_rembg({})["preserve_metadata"])
        self.assertTrue(rembg.clean_rembg({"preserveMetadata": True})["preserve_metadata"])
        packed = rembg.empty_params()
        self.assertTrue(save_meta.valid_params(packed))
        self.assertNotIn("steps", packed)
        self.assertNotIn("sampler", packed)

    def test_import_without_preserve_skips_job_defaults(self) -> None:
        folder = self.tmp / "out"
        folder.mkdir()
        values = {
            "workflow": "background_removal",
            "workflow_id": "background_removal",
            "rembg": rembg.clean_rembg({}),
            "steps": 20,
            "sampler": "euler",
            "cfg": 4,
            "seed": 1,
            "prompt": "should not leak",
        }
        with (
            patch.object(job_output.gallery_cache, "ingest"),
            patch.object(job_output, "_output_dir", return_value=folder),
        ):
            _, dest = job_output._import_bytes("job", values, _png(), {"1": {"class_type": "RMBG"}}, "images")
        info = pnginfo.read(dest.read_bytes())
        self.assertNotIn("Steps:", info["text"])
        self.assertNotIn("should not leak", info["text"])
        self.assertEqual(info["metadata"]["params"]["prompt"], "")

    def test_import_preserve_copies_source_metadata(self) -> None:
        packed = {
            "prompt": "original cat",
            "negative_prompt": "",
            "prompt_raw": "original cat",
            "negative_prompt_raw": "",
            "steps": 28,
            "cfg": 5,
            "seed": 42,
            "sampler": "euler",
            "scheduler": "normal",
            "width": 16,
            "height": 16,
            "models": [],
        }
        meta = save_meta.envelope("orig", {"workflow": "sd15"}, packed, "image", "2026-01-01T00:00:00Z")
        src = self.tmp / "src.png"
        src.write_bytes(pnginfo.embed(_png(), packed, None, metadata=meta))
        folder = self.tmp / "out"
        folder.mkdir()
        values = {
            "workflow": "background_removal",
            "rembg": rembg.clean_rembg({"preserve_metadata": True}),
            "source_image": str(src),
            "steps": 20,
            "prompt": "job default",
        }
        with (
            patch.object(job_output.gallery_cache, "ingest"),
            patch.object(job_output, "_output_dir", return_value=folder),
        ):
            _, dest = job_output._import_bytes("job", values, _png(), None, "images")
        info = pnginfo.read(dest.read_bytes())
        self.assertIn("original cat", info["text"])
        self.assertNotIn("job default", info["text"])
        self.assertEqual(info["metadata"]["params"]["prompt"], "original cat")
        self.assertEqual(info["metadata"]["params"]["steps"], 28)


if __name__ == "__main__":
    unittest.main()
