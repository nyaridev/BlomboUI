from __future__ import annotations

import math
from pathlib import Path


def nearest_grid(count: int, cell_w: int = 1, cell_h: int = 1) -> tuple[int, int]:
    options = [(cols, math.ceil(count / cols)) for cols in range(1, count + 1)]
    landscape = [item for item in options if item[0] >= item[1]]
    pool = landscape or options
    return min(pool, key=lambda item: (abs(item[0] - item[1]), -item[0]))


def filled_grid(count: int, cell_w: int = 1, cell_h: int = 1, prefer_rows: int = 0) -> tuple[int, int]:
    options = [(cols, count // cols) for cols in range(1, count + 1) if count % cols == 0]
    if not options:
        return nearest_grid(count, cell_w, cell_h)
    if prefer_rows > 0:
        return min(options, key=lambda item: abs(item[1] - prefer_rows))
    landscape = [item for item in options if item[0] >= item[1]]
    pool = landscape or options
    return min(pool, key=lambda item: (abs(item[0] - item[1]), -item[0]))


def layout(count: int, cell_w: int, cell_h: int, rows: int = 0, fill: bool = False) -> tuple[int, int]:
    if fill:
        return filled_grid(count, cell_w, cell_h, rows)
    if rows > 0:
        rows = max(1, min(rows, count))
        return math.ceil(count / rows), rows
    return nearest_grid(count, cell_w, cell_h)


def save_contact_sheet(
    paths: list[Path],
    dest: Path,
    quality: int = 85,
    rows: int = 0,
    fill: bool = False,
    comment: str = "",
) -> None:
    from PIL import Image

    images = [Image.open(path).convert("RGBA") for path in paths]
    cell_w, cell_h = max(images, key=lambda image: image.size[0] * image.size[1]).size
    cols, row_n = layout(len(images), cell_w, cell_h, rows, fill)
    sheet = Image.new("RGBA", (cols * cell_w, row_n * cell_h), (0, 0, 0, 0))
    for i, image in enumerate(images):
        if image.size != (cell_w, cell_h):
            image = image.resize((cell_w, cell_h))
        sheet.paste(image, ((i % cols) * cell_w, (i // cols) * cell_h))
    max_edge = 4096
    if sheet.width > max_edge or sheet.height > max_edge:
        sheet.thumbnail((max_edge, max_edge))
    dest.parent.mkdir(parents=True, exist_ok=True)
    extra: dict = {}
    if comment:
        from PIL.PngImagePlugin import PngInfo

        info = PngInfo()
        info.add_text("parameters", comment)
        extra["pnginfo"] = info
    sheet.save(dest, "PNG", optimize=True, **extra)
