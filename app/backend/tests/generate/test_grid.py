from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from features.generate.scripts.grid.grid import _legend_font_px, save_contact_sheet, save_xy_sheet


class GridSaveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="grid-"))
        self.tiles = []
        for i in range(4):
            path = self.tmp / f"{i}.png"
            Image.new("RGB", (32, 48), (i * 40, 80, 120)).save(path)
            self.tiles.append(path)

    def test_default_jpeg(self) -> None:
        dest = self.tmp / "sheet.jpg"
        save_contact_sheet(self.tiles, dest, quality=85)
        with Image.open(dest) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (64, 96))

    def test_png_and_webp(self) -> None:
        png = self.tmp / "sheet.png"
        webp = self.tmp / "sheet.webp"
        save_contact_sheet(self.tiles, png, fmt="png")
        save_contact_sheet(self.tiles, webp, fmt="webp", quality=80)
        with Image.open(png) as image:
            self.assertEqual(image.format, "PNG")
        with Image.open(webp) as image:
            self.assertEqual(image.format, "WEBP")

    def test_xy_sheet_uses_cols_rows_and_margin(self) -> None:
        dest = self.tmp / "xy.jpg"
        save_xy_sheet(self.tiles[:2], dest, cols=2, rows=1, margin=10, draw_legend=False, fmt="jpg")
        with Image.open(dest) as image:
            self.assertEqual(image.size, (74, 48))

    def test_xy_legend_adds_gutters(self) -> None:
        dest = self.tmp / "legend.png"
        save_xy_sheet(
            self.tiles[:4],
            dest,
            cols=2,
            rows=2,
            margin=0,
            x_labels=["Steps: 20", "Steps: 28"],
            y_labels=["CFG: 4", "CFG: 6"],
            draw_legend=True,
            fmt="png",
        )
        with Image.open(dest) as image:
            self.assertGreater(image.size[0], 64)
            self.assertGreater(image.size[1], 96)

    def test_xy_legend_skips_unused_axis_gutter(self) -> None:
        x_only = self.tmp / "x.png"
        save_xy_sheet(
            self.tiles[:2],
            x_only,
            cols=2,
            rows=1,
            margin=0,
            x_labels=["20", "28"],
            y_labels=[],
            draw_legend=True,
            fmt="png",
        )
        with Image.open(x_only) as image:
            self.assertEqual(image.size[0], 64)
            self.assertGreater(image.size[1], 48)

        y_only = self.tmp / "y.png"
        save_xy_sheet(
            self.tiles[:2],
            y_only,
            cols=1,
            rows=2,
            margin=0,
            x_labels=[],
            y_labels=["4", "6"],
            draw_legend=True,
            fmt="png",
        )
        with Image.open(y_only) as image:
            self.assertGreater(image.size[0], 32)
            self.assertEqual(image.size[1], 96)

    def test_legend_font_scales_with_cell_size(self) -> None:
        self.assertEqual(_legend_font_px(832, 1216), 45)
        self.assertEqual(_legend_font_px(416, 608), 23)
        self.assertEqual(_legend_font_px(32, 48), 10)
