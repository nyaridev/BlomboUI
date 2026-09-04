from __future__ import annotations

import re
from collections import deque
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

from config import RUNTIME
from features.generate.scripts.workflow.rembg import IMAGE_EXTS, list_folder_images, stage_input
from infrastructure.comfy import client as comfy

PATH_DEFAULT = "dataset_prep/[date]"
NAME_DEFAULT = "[filename]_[number]"
_TABS = {"sprites"}
_BACKGROUNDS = {"Alpha", "Color"}
_HEX = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_NEIGHBORS = (
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
)


def is_dataset(values: dict[str, Any]) -> bool:
    return Path(str(values.get("workflow") or values.get("workflow_id") or "")).stem == "dataset_prep"


def empty_params() -> dict[str, Any]:
    return {
        "prompt": "",
        "negative_prompt": "",
        "prompt_raw": "",
        "negative_prompt_raw": "",
        "models": [],
    }


def needs_comfy(values: dict[str, Any]) -> bool:
    blob = clean_dataset(values.get("dataset"))
    if blob["tab"] != "sprites":
        return False
    return bool(blob["sprites"]["upscale_model"])


def _blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("dataset")
    return raw if isinstance(raw, dict) else {}


def _int(src: dict[str, Any], *keys: str, default: int, lo: int, hi: int) -> int:
    for key in keys:
        if key not in src:
            continue
        try:
            return max(lo, min(hi, int(src.get(key))))
        except (TypeError, ValueError):
            continue
    return default


def _text(src: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        raw = src.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return default


def _sprites_src(src: dict[str, Any]) -> dict[str, Any]:
    raw = src.get("sprites")
    return raw if isinstance(raw, dict) else src


def clean_dataset(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    sprites_src = _sprites_src(src)
    tab = str(src.get("tab") or "sprites").strip()
    if tab not in _TABS:
        tab = "sprites"
    background = str(sprites_src.get("background") or "Alpha")
    if background not in _BACKGROUNDS:
        background = "Alpha"
    color = _text(sprites_src, "background_color", "backgroundColor", default="#222222")
    if not _HEX.fullmatch(color):
        color = "#222222"
    return {
        "tab": tab,
        "input_mode": "directory" if str(src.get("input_mode") or src.get("inputMode") or "") == "directory" else "files",
        "input_dir": str(src.get("input_dir") or src.get("inputDir") or "").strip(),
        "sprites": {
            "width": _int(sprites_src, "width", default=512, lo=64, hi=4096),
            "height": _int(sprites_src, "height", default=512, lo=64, hi=4096),
            "padding": _int(sprites_src, "padding", default=8, lo=0, hi=512),
            "min_area": _int(sprites_src, "min_area", "minArea", default=32, lo=1, hi=1_000_000),
            "upscale_model": _text(sprites_src, "upscale_model", "upscaleModel"),
            "background": background,
            "background_color": color,
        },
    }


def list_input_images(values: dict[str, Any]) -> list[Path]:
    raw = values.get("input_paths")
    if isinstance(raw, list) and raw:
        out: list[Path] = []
        for item in raw:
            path = Path(str(item))
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                out.append(path)
        return out
    blob = _blob(values)
    folder = str(values.get("input_dir") or blob.get("input_dir") or blob.get("inputDir") or "").strip()
    if not folder:
        return []
    return list_folder_images(folder)


def input_runs(values: dict[str, Any]) -> list[dict[str, Any]]:
    return [{**values, "input_image": str(path), "batch_count": 1, "batch_size": 1} for path in list_input_images(values)]


def parse_color(raw: str) -> tuple[int, int, int, int]:
    text = raw.strip()
    if not _HEX.fullmatch(text):
        return (34, 34, 34, 255)
    hex_value = text[1:]
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    return (int(hex_value[0:2], 16), int(hex_value[2:4], 16), int(hex_value[4:6], 16), 255)


def _has_transparency(image: Image.Image) -> bool:
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        return True
    return False


def island_boxes(alpha: Image.Image, min_area: int) -> list[tuple[int, int, int, int]]:
    width, height = alpha.size
    pixels = alpha.tobytes()
    visited = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []
    min_area = max(1, min_area)

    def index(x: int, y: int) -> int:
        return y * width + x

    for y in range(height):
        row = y * width
        for x in range(width):
            i = row + x
            if visited[i] or pixels[i] == 0:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[i] = 1
            min_x = max_x = x
            min_y = max_y = y
            area = 0
            while queue:
                cx, cy = queue.popleft()
                area += 1
                if cx < min_x:
                    min_x = cx
                elif cx > max_x:
                    max_x = cx
                if cy < min_y:
                    min_y = cy
                elif cy > max_y:
                    max_y = cy
                for dx, dy in _NEIGHBORS:
                    nx = cx + dx
                    ny = cy + dy
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    ni = index(nx, ny)
                    if visited[ni] or pixels[ni] == 0:
                        continue
                    visited[ni] = 1
                    queue.append((nx, ny))
            if area >= min_area:
                boxes.append((min_x, min_y, max_x, max_y))
    boxes.sort(key=lambda box: (box[1], box[0]))
    return boxes


def extract_sprites(image: Image.Image, min_area: int) -> list[Image.Image]:
    if not _has_transparency(image):
        return []
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] == 255:
        return []
    out: list[Image.Image] = []
    for x0, y0, x1, y1 in island_boxes(alpha, min_area):
        out.append(rgba.crop((x0, y0, x1 + 1, y1 + 1)).copy())
    return out


def extract_sprites_from_path(path: str | Path, values: dict[str, Any]) -> list[Image.Image]:
    blob = clean_dataset(values.get("dataset"))
    source = Path(path)
    if not source.is_file():
        return []
    with Image.open(source) as image:
        image.load()
        return extract_sprites(image, blob["sprites"]["min_area"])


def fit_sprite(
    sprite: Image.Image,
    width: int,
    height: int,
    padding: int,
    background: str,
    color: str,
) -> Image.Image:
    canvas_w = max(1, width)
    canvas_h = max(1, height)
    pad = max(0, min(padding, (canvas_w - 1) // 2, (canvas_h - 1) // 2))
    inner_w = max(1, canvas_w - 2 * pad)
    inner_h = max(1, canvas_h - 2 * pad)
    rgba = sprite.convert("RGBA")
    sw, sh = rgba.size
    scale = min(inner_w / max(1, sw), inner_h / max(1, sh))
    next_w = max(1, round(sw * scale))
    next_h = max(1, round(sh * scale))
    if (next_w, next_h) != (sw, sh):
        rgba = rgba.resize((next_w, next_h), Image.Resampling.LANCZOS)
        sw, sh = next_w, next_h
    if background == "Color":
        canvas = Image.new("RGBA", (canvas_w, canvas_h), parse_color(color))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    ox = (canvas_w - sw) // 2
    oy = (canvas_h - sh) // 2
    canvas.paste(rgba, (ox, oy), rgba)
    return canvas


def _fill_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    filled = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
    filled.paste(rgba, mask=rgba.getchannel("A"))
    return filled.convert("RGB")


def _upscale_graph(filename: str, model: str, prefix: str) -> dict[str, Any]:
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {"image": filename},
            "_meta": {"title": "Load Image"},
        },
        "2": {
            "class_type": "UpscaleModelLoader",
            "inputs": {"model_name": model},
            "_meta": {"title": "Load Upscale Model"},
        },
        "3": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]},
            "_meta": {"title": "Upscale"},
        },
        "4": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": prefix, "images": ["3", 0]},
            "_meta": {"title": "Save"},
        },
    }


def upscale_crop(image: Image.Image, model: str, job_id: str, tag: str) -> Image.Image:
    name = comfy.comfy_filename(model) or model.strip()
    if not name:
        return image.convert("RGBA")
    rgba = image.convert("RGBA")
    folder = RUNTIME / "tmp" / "dataset" / (Path(str(job_id)).name or "job")
    folder.mkdir(parents=True, exist_ok=True)
    src = folder / f"{tag}.png"
    _fill_rgb(rgba).save(src, format="PNG")
    staged = stage_input(src, job_id, tag)
    graph = _upscale_graph(staged.name, name, f"blombo/{job_id}-{tag}")
    _prompt_id, images = comfy.run_prompt(graph, f"{job_id}-{tag}", lambda _event: None)
    if not images:
        raise comfy.ComfyError("job_failed", "Upscale did not return an image.")
    raw = comfy.download_image(images[0])
    with Image.open(BytesIO(raw)) as upscaled:
        upscaled.load()
        rgb = upscaled.convert("RGB")
    alpha = rgba.getchannel("A").resize(rgb.size, Image.Resampling.LANCZOS)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def finish_sprite(crop: Image.Image, values: dict[str, Any], job_id: str, tag: str) -> bytes:
    blob = clean_dataset(values.get("dataset"))["sprites"]
    sprite = crop.convert("RGBA")
    model = str(blob.get("upscale_model") or "").strip()
    if model:
        sprite = upscale_crop(sprite, model, job_id, tag)
    fitted = fit_sprite(
        sprite,
        blob["width"],
        blob["height"],
        blob["padding"],
        blob["background"],
        blob["background_color"],
    )
    out = BytesIO()
    fitted.save(out, format="PNG")
    return out.getvalue()
