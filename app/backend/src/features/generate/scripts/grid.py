from __future__ import annotations

import math
from io import BytesIO
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


def _text_size(draw: object, text: str, font: object) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)  # type: ignore[attr-defined]
    return int(box[2] - box[0]), int(box[3] - box[1])


def _legend_font_px(cell_w: int, cell_h: int) -> int:
    # Default bitmap font is ~10px; 832px cells use 4.5x that, then scale with the cell.
    return max(10, int(45 * min(cell_w, cell_h) / 832 + 0.5))


def _legend_font(px: int):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size=px)
    except TypeError:
        return ImageFont.load_default()


def _write_sheet(
    sheet: object,
    dest: Path,
    quality: int,
    comment: str,
    fmt: str,
    values: dict | None = None,
    metadata: dict | None = None,
) -> None:
    from shared import pnginfo
    from shared.pnginfo_write import jpeg_exif, rgb

    max_edge = 4096
    if sheet.width > max_edge or sheet.height > max_edge:  # type: ignore[attr-defined]
        sheet.thumbnail((max_edge, max_edge))  # type: ignore[attr-defined]
    dest.parent.mkdir(parents=True, exist_ok=True)
    fmt = "jpg" if fmt in {"jpg", "jpeg"} else fmt
    if fmt not in {"png", "jpg", "webp"}:
        fmt = "jpg"
    q = max(1, min(100, int(quality)))
    buf = BytesIO()
    if fmt == "png":
        extra: dict = {}
        if comment and not metadata:
            from PIL.PngImagePlugin import PngInfo

            info = PngInfo()
            info.add_text("parameters", comment)
            extra["pnginfo"] = info
        sheet.save(buf, "PNG", **extra)  # type: ignore[attr-defined]
    else:
        sheet = rgb(sheet)
        opts: dict = {"quality": q}
        if comment and not metadata:
            exif = jpeg_exif(comment)
            if exif is not None:
                opts["exif"] = exif
        sheet.save(buf, "WEBP" if fmt == "webp" else "JPEG", **opts)
    data = buf.getvalue()
    if metadata:
        dest.write_bytes(pnginfo.embed(data, values or {}, None, fmt, q, metadata))
        return
    dest.write_bytes(data)


def save_contact_sheet(
    paths: list[Path],
    dest: Path,
    quality: int = 85,
    rows: int = 0,
    fill: bool = False,
    comment: str = "",
    fmt: str = "jpg",
    values: dict | None = None,
    metadata: dict | None = None,
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
    _write_sheet(sheet, dest, quality, comment, fmt, values, metadata)


def save_xy_sheet(
    paths: list[Path],
    dest: Path,
    cols: int,
    rows: int,
    margin: int = 0,
    x_labels: list[str] | None = None,
    y_labels: list[str] | None = None,
    draw_legend: bool = True,
    quality: int = 85,
    comment: str = "",
    fmt: str = "jpg",
    values: dict | None = None,
    metadata: dict | None = None,
) -> None:
    from PIL import Image, ImageDraw

    cols = max(1, cols)
    rows = max(1, rows)
    margin = max(0, min(256, int(margin)))
    images = [Image.open(path).convert("RGBA") for path in paths]
    if not images:
        return
    cell_w, cell_h = max(images, key=lambda image: image.size[0] * image.size[1]).size
    x_labels = list(x_labels or [])
    y_labels = list(y_labels or [])
    font_px = _legend_font_px(cell_w, cell_h)
    font = _legend_font(font_px)
    edge = max(8, font_px // 4)
    gap = max(16, font_px // 2)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left = 0
    top = 0
    show_y = draw_legend and any(label.strip() for label in y_labels)
    show_x = draw_legend and any(label.strip() for label in x_labels)
    if show_y:
        left = max((_text_size(probe, label, font)[0] for label in y_labels if label.strip()), default=0) + edge + gap
    if show_x:
        top = max((_text_size(probe, label, font)[1] for label in x_labels if label.strip()), default=0) + edge + gap
    width = left + cols * cell_w + max(0, cols - 1) * margin
    height = top + rows * cell_h + max(0, rows - 1) * margin
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 255) if draw_legend and (left or top) else (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    for i, image in enumerate(images):
        if image.size != (cell_w, cell_h):
            image = image.resize((cell_w, cell_h))
        col = i % cols
        row = i // cols
        x = left + col * (cell_w + margin)
        y = top + row * (cell_h + margin)
        sheet.paste(image, (x, y))
    if show_x:
        for col, label in enumerate(x_labels[:cols]):
            if not label.strip():
                continue
            tw, th = _text_size(draw, label, font)
            x = left + col * (cell_w + margin) + max(0, (cell_w - tw) // 2)
            draw.text((x, edge), label, fill=(255, 255, 255, 255), font=font)
    if show_y:
        for row, label in enumerate(y_labels[:rows]):
            if not label.strip():
                continue
            _tw, th = _text_size(draw, label, font)
            y = top + row * (cell_h + margin) + max(0, (cell_h - th) // 2)
            draw.text((edge, y), label, fill=(255, 255, 255, 255), font=font)
    _write_sheet(sheet, dest, quality, comment, fmt, values, metadata)
