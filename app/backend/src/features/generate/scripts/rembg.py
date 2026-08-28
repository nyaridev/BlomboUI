from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any

from config import RUNTIME, comfy_models_root
from shared import pnginfo

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
PATH_DEFAULT = "background_removal/[date]"
UPLOAD_EXTS = IMAGE_EXTS
_ENGINES = {"rmbg", "birefnet"}
_BACKGROUNDS = {"Alpha", "Color"}
RMBG_MODELS = ("RMBG-2.0", "INSPYRENET", "BEN", "BEN2")
BIREFNET_MODELS = (
    "BiRefNet-general",
    "BiRefNet_512x512",
    "BiRefNet-HR",
    "BiRefNet-portrait",
    "BiRefNet-matting",
    "BiRefNet-HR-matting",
    "BiRefNet_lite",
    "BiRefNet_lite-2K",
    "BiRefNet_dynamic",
    "BiRefNet_lite-matting",
    "BiRefNet_toonout",
    "Lucida",
)


def is_rembg(values: dict[str, Any]) -> bool:
    return Path(str(values.get("workflow") or values.get("workflow_id") or "")).stem == "background_removal"


def empty_params() -> dict[str, Any]:
    return {
        "prompt": "",
        "negative_prompt": "",
        "prompt_raw": "",
        "negative_prompt_raw": "",
        "models": [],
    }


def preserve_metadata(values: dict[str, Any]) -> bool:
    blob = _blob(values)
    if "preserve_metadata" in blob:
        return bool(blob.get("preserve_metadata"))
    return bool(blob.get("preserveMetadata"))


def source_path(values: dict[str, Any]) -> Path | None:
    raw = str(values.get("source_image") or values.get("input_image") or "").strip()
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_file() else None


def source_texts(path: str | Path) -> dict[str, str]:
    info = pnginfo.read_path(path)
    raw = info.get("raw") if isinstance(info, dict) else None
    if not isinstance(raw, dict):
        return {}
    return {key: value for key, value in raw.items() if isinstance(key, str) and isinstance(value, str) and value.strip()}


def source_envelope(path: str | Path) -> dict[str, Any] | None:
    from features.generate.scripts import save_meta

    info = pnginfo.read_path(path)
    meta = info.get("metadata") if isinstance(info, dict) else None
    return dict(meta) if save_meta.valid_meta(meta) else None


def _blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("rembg")
    return raw if isinstance(raw, dict) else {}


def clean_rembg(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    engine = str(src.get("engine") or "rmbg")
    if engine not in _ENGINES:
        engine = "rmbg"
    rmbg_model = str(src.get("rmbg_model") or src.get("rmbgModel") or "RMBG-2.0")
    if rmbg_model not in RMBG_MODELS:
        rmbg_model = "RMBG-2.0"
    birefnet_model = str(src.get("birefnet_model") or src.get("birefnetModel") or "BiRefNet-general")
    if birefnet_model not in BIREFNET_MODELS:
        birefnet_model = "BiRefNet-general"
    background = str(src.get("background") or "Alpha")
    if background not in _BACKGROUNDS:
        background = "Alpha"
    color = str(src.get("background_color") or src.get("backgroundColor") or "#222222").strip() or "#222222"
    try:
        sensitivity = float(src.get("sensitivity", 1))
    except (TypeError, ValueError):
        sensitivity = 1.0
    try:
        process_res = int(src.get("process_res") or src.get("processRes") or 1024)
    except (TypeError, ValueError):
        process_res = 1024
    try:
        mask_blur = int(src.get("mask_blur") or src.get("maskBlur") or 0)
    except (TypeError, ValueError):
        mask_blur = 0
    try:
        mask_offset = int(src.get("mask_offset") or src.get("maskOffset") or 0)
    except (TypeError, ValueError):
        mask_offset = 0
    return {
        "engine": engine,
        "rmbg_model": rmbg_model,
        "birefnet_model": birefnet_model,
        "sensitivity": max(0.0, min(1.0, sensitivity)),
        "process_res": max(256, min(2048, process_res)),
        "mask_blur": max(0, min(64, mask_blur)),
        "mask_offset": max(-64, min(64, mask_offset)),
        "invert_output": bool(src.get("invert_output") if "invert_output" in src else src.get("invertOutput")),
        "refine_foreground": bool(
            src.get("refine_foreground") if "refine_foreground" in src else src.get("refineForeground")
        ),
        "background": background,
        "background_color": color,
        "input_mode": "directory" if str(src.get("input_mode") or src.get("inputMode") or "") == "directory" else "files",
        "input_dir": str(src.get("input_dir") or src.get("inputDir") or "").strip(),
        "preserve_metadata": bool(
            src.get("preserve_metadata") if "preserve_metadata" in src else src.get("preserveMetadata")
        ),
    }


def list_folder_images(folder: str | Path) -> list[Path]:
    root = Path(folder)
    if not root.is_dir():
        return []
    items: list[Path] = []
    try:
        names = sorted(root.iterdir(), key=lambda item: item.name.lower())
    except OSError:
        return []
    for path in names:
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            items.append(path)
    return items


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
    folder = str(values.get("input_dir") or blob.get("input_dir") or "").strip()
    if not folder:
        return []
    return list_folder_images(folder)


def input_runs(values: dict[str, Any]) -> list[dict[str, Any]]:
    return [{**values, "input_image": str(path), "batch_count": 1, "batch_size": 1} for path in list_input_images(values)]


def save_uploads(files: list[tuple[str, bytes]]) -> list[str]:
    folder = RUNTIME / "tmp" / "job-inputs" / str(uuid.uuid4())
    folder.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for index, (name, data) in enumerate(files):
        stem = Path(name or "").name
        ext = Path(stem).suffix.lower()
        if ext not in UPLOAD_EXTS or not data:
            continue
        dest = folder / f"{index:04d}{ext}"
        dest.write_bytes(data)
        paths.append(str(dest))
    return paths


def comfy_input_root() -> Path:
    path = comfy_models_root().parent / "input"
    path.mkdir(parents=True, exist_ok=True)
    return path


def stage_input(src: str | Path, job_id: str, run_i: int) -> Path:
    source = Path(src)
    ext = source.suffix.lower() if source.suffix.lower() in IMAGE_EXTS else ".png"
    ident = Path(str(job_id)).name or "job"
    dest = comfy_input_root() / f"blombo-{ident}-{run_i}{ext}"
    shutil.copy2(source, dest)
    return dest
