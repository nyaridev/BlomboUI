from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from infrastructure.comfy import client as comfy
from infrastructure.storage import cache as cache_db
from infrastructure.storage import user as db
from features.generate.scripts import templates
from features.generate.scripts.job import jobs
from features.generate.scripts.workflow import dataset, upscale


def _rgba(width: int, height: int, fill: tuple[int, int, int, int] = (0, 0, 0, 0)) -> Image.Image:
    return Image.new("RGBA", (width, height), fill)


def _paint(image: Image.Image, x: int, y: int, w: int, h: int, color: tuple[int, int, int, int]) -> None:
    for py in range(y, y + h):
        for px in range(x, x + w):
            image.putpixel((px, py), color)


class DatasetSpritesTests(unittest.TestCase):
    def test_list_workflows_name_category_and_params(self) -> None:
        item = next(row for row in comfy.list_workflows() if row["id"] == "dataset_prep")
        self.assertEqual(item["name"], "Dataset Prep")
        self.assertEqual(item["category"], "utility")
        self.assertIn("dataset", item["params"])
        self.assertNotIn("checkpoint", item["params"])
        self.assertNotIn("hires", item["params"])

    def test_is_file_utility(self) -> None:
        self.assertTrue(upscale.is_file_utility({"workflow": "dataset_prep"}))
        self.assertTrue(dataset.is_dataset({"workflow": "dataset_prep"}))

    def test_clean_dataset_defaults_and_clamps(self) -> None:
        cleaned = dataset.clean_dataset(
            {
                "tab": "nope",
                "inputMode": "directory",
                "inputDir": " C:/icons ",
                "sprites": {
                    "width": 32,
                    "height": 9000,
                    "padding": -4,
                    "minArea": 0,
                    "upscaleModel": "4x.pth",
                    "background": "Color",
                    "backgroundColor": "red",
                },
            }
        )
        self.assertEqual(cleaned["tab"], "sprites")
        self.assertEqual(cleaned["input_mode"], "directory")
        self.assertEqual(cleaned["input_dir"], "C:/icons")
        self.assertEqual(cleaned["sprites"]["width"], 64)
        self.assertEqual(cleaned["sprites"]["height"], 4096)
        self.assertEqual(cleaned["sprites"]["padding"], 0)
        self.assertEqual(cleaned["sprites"]["min_area"], 1)
        self.assertEqual(cleaned["sprites"]["upscale_model"], "4x.pth")
        self.assertEqual(cleaned["sprites"]["background"], "Color")
        self.assertEqual(cleaned["sprites"]["background_color"], "#222222")

    def test_needs_comfy_only_with_upscale_model(self) -> None:
        self.assertFalse(dataset.needs_comfy({"workflow": "dataset_prep", "dataset": {}}))
        self.assertTrue(
            dataset.needs_comfy({"workflow": "dataset_prep", "dataset": {"sprites": {"upscale_model": "4x.pth"}}})
        )

    def test_extracts_disconnected_islands_left_to_right(self) -> None:
        image = _rgba(40, 12)
        _paint(image, 2, 2, 4, 4, (255, 0, 0, 255))
        _paint(image, 20, 3, 5, 5, (0, 255, 0, 255))
        sprites = dataset.extract_sprites(image, min_area=1)
        self.assertEqual(len(sprites), 2)
        self.assertEqual(sprites[0].size, (4, 4))
        self.assertEqual(sprites[0].getpixel((0, 0))[:3], (255, 0, 0))
        self.assertEqual(sprites[1].size, (5, 5))
        self.assertEqual(sprites[1].getpixel((0, 0))[:3], (0, 255, 0))

    def test_sorts_top_to_bottom_then_left_to_right(self) -> None:
        image = _rgba(30, 30)
        _paint(image, 16, 2, 3, 3, (0, 0, 255, 255))
        _paint(image, 2, 16, 3, 3, (255, 255, 0, 255))
        _paint(image, 16, 16, 3, 3, (0, 255, 255, 255))
        sprites = dataset.extract_sprites(image, min_area=1)
        colors = [sprite.getpixel((0, 0))[:3] for sprite in sprites]
        self.assertEqual(colors, [(0, 0, 255), (255, 255, 0), (0, 255, 255)])

    def test_eight_connected_merges_diagonal(self) -> None:
        image = _rgba(4, 4)
        image.putpixel((0, 0), (255, 0, 0, 255))
        image.putpixel((1, 1), (255, 0, 0, 255))
        sprites = dataset.extract_sprites(image, min_area=1)
        self.assertEqual(len(sprites), 1)
        self.assertEqual(sprites[0].size, (2, 2))

    def test_min_area_filters_specks(self) -> None:
        image = _rgba(20, 10)
        image.putpixel((1, 1), (255, 0, 0, 255))
        _paint(image, 8, 2, 4, 4, (0, 255, 0, 255))
        sprites = dataset.extract_sprites(image, min_area=4)
        self.assertEqual(len(sprites), 1)
        self.assertEqual(sprites[0].size, (4, 4))

    def test_opaque_image_yields_no_sprites(self) -> None:
        image = Image.new("RGB", (8, 8), (12, 34, 56))
        self.assertEqual(dataset.extract_sprites(image, min_area=1), [])

    def test_fit_centers_with_padding(self) -> None:
        sprite = _rgba(10, 10, (200, 10, 10, 255))
        canvas = dataset.fit_sprite(sprite, 100, 100, 10, "Alpha", "#000000")
        self.assertEqual(canvas.size, (100, 100))
        self.assertEqual(canvas.getpixel((9, 9))[3], 0)
        self.assertEqual(canvas.getpixel((10, 10))[:3], (200, 10, 10))
        self.assertEqual(canvas.getpixel((89, 89))[:3], (200, 10, 10))
        self.assertEqual(canvas.getpixel((90, 90))[3], 0)

    def test_color_background_fills_canvas(self) -> None:
        sprite = _rgba(4, 4, (0, 0, 255, 255))
        canvas = dataset.fit_sprite(sprite, 20, 20, 2, "Color", "#112233")
        self.assertEqual(canvas.getpixel((0, 0)), (0x11, 0x22, 0x33, 255))
        self.assertEqual(canvas.getpixel((10, 10))[:3], (0, 0, 255))

    def test_parse_color_short_hex(self) -> None:
        self.assertEqual(dataset.parse_color("#abc"), (0xAA, 0xBB, 0xCC, 255))

    def test_default_apply_from_workflow_json(self) -> None:
        apply = templates.default_apply("dataset_prep")
        self.assertEqual(apply, list(templates._DATASET_APPLY) + ["outputPath"])


class DatasetPrepareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [
            patch.object(db, "_CONN", None),
            patch.object(db, "db_path", return_value=self.tmp / "user.sqlite"),
            patch.object(cache_db, "_CONN", None),
            patch.object(cache_db, "db_path", return_value=self.tmp / "cache.sqlite"),
        ]
        for item in self.patches:
            item.start()
        db.connect()
        cache_db.connect()
        image = _rgba(8, 8)
        _paint(image, 1, 1, 3, 3, (255, 0, 0, 255))
        self.sheet = self.tmp / "sheet.png"
        image.save(self.sheet, format="PNG")

    def tearDown(self) -> None:
        if db._CONN is not None:
            db._CONN.close()
            db._CONN = None
        if cache_db._CONN is not None:
            cache_db._CONN.close()
            cache_db._CONN = None
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_prepare_without_comfy_when_upscale_off(self) -> None:
        with patch.object(jobs.comfy, "reachable", return_value=False):
            job_id, values = jobs._prepare_job(
                {
                    "workflow": "dataset_prep",
                    "input_paths": [str(self.sheet)],
                    "dataset": {"tab": "sprites"},
                }
            )
        self.assertTrue(job_id)
        self.assertEqual(values["workflow_id"], "dataset_prep")
        self.assertEqual(values["dataset"]["sprites"]["upscale_model"], "")

    def test_clean_params_keeps_dataset_blob(self) -> None:
        created = templates.create_template(
            "dataset_prep",
            "Icons",
            {"dataset": {"sprites": {"padding": 16, "minArea": 64, "background": "Color", "backgroundColor": "#abcabc"}}},
        )
        blob = created["params"]["dataset"]
        self.assertEqual(blob["tab"], "sprites")
        self.assertEqual(blob["sprites"]["padding"], 16)
        self.assertEqual(blob["sprites"]["min_area"], 64)
        self.assertEqual(blob["sprites"]["background"], "Color")
        self.assertEqual(blob["sprites"]["background_color"], "#abcabc")

    def test_prepare_requires_comfy_when_upscale_on(self) -> None:
        with patch.object(jobs.comfy, "reachable", return_value=False):
            with self.assertRaises(comfy.ComfyError) as raised:
                jobs._prepare_job(
                    {
                        "workflow": "dataset_prep",
                        "input_paths": [str(self.sheet)],
                        "dataset": {"sprites": {"upscale_model": "4x.pth"}},
                    }
                )
        self.assertEqual(raised.exception.code, "comfy_unreachable")

    def test_prepare_still_requires_comfy_for_other_jobs(self) -> None:
        with patch.object(jobs.comfy, "reachable", return_value=False):
            with self.assertRaises(comfy.ComfyError) as raised:
                jobs._prepare_job({"prompt": "x"})
        self.assertEqual(raised.exception.code, "comfy_unreachable")
