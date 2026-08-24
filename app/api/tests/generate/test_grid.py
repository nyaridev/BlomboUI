from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from blombo.generate.grid import save_contact_sheet


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
