from __future__ import annotations

import math
from pathlib import Path


def nearest_grid(count: int, cell_w: int, cell_h: int) -> tuple[int, int]:
    options: list[tuple[int, int, int, int]] = []
    for cols in range(1, count + 1):
        rows = math.ceil(count / cols)
        options.append((cols, rows, cols * cell_w, rows * cell_h))
    landscape = [item for item in options if item[2] >= item[3]]
    pool = landscape or options
    cols, rows, _w, _h = min(pool, key=lambda item: (abs(item[2] - item[3]), -item[0]))
    return cols, rows


def save_contact_sheet(paths: list[Path], dest: Path, quality: int = 85) -> None:
    from PIL import Image

    images = [Image.open(path).convert("RGB") for path in paths]
    cell_w, cell_h = images[0].size
    cols, rows = nearest_grid(len(images), cell_w, cell_h)
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (17, 21, 26))
    for i, image in enumerate(images):
        if image.size != (cell_w, cell_h):
            image = image.resize((cell_w, cell_h))
        sheet.paste(image, ((i % cols) * cell_w, (i // cols) * cell_h))
    max_edge = 4096
    if sheet.width > max_edge or sheet.height > max_edge:
        sheet.thumbnail((max_edge, max_edge))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, "JPEG", quality=max(40, min(95, quality)), optimize=True)
