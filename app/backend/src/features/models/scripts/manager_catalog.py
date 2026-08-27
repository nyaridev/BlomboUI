from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from config import RUNTIME, launcher_env, models_root
from infrastructure.comfy import client as comfy
from shared import dirs
from features.downloads.scripts import progress as download_progress
from features.models.scripts import models as model_lists

_CHUNK = 1024 * 1024
_TAG = re.compile(r"<[^>]+>")
_MODES = frozenset({"cache", "local", "remote", "default"})
_TYPE_FOLDERS = {
    "checkpoints": "checkpoints",
    "checkpoint": "checkpoints",
    "unclip": "checkpoints",
    "text_encoders": "text_encoders",
    "clip": "text_encoders",
    "vae": "vae",
    "lora": "loras",
    "t2i-adapter": "controlnet",
    "t2i-style": "controlnet",
    "controlnet": "controlnet",
    "clip_vision": "clip_vision",
    "gligen": "gligen",
    "upscale": "upscale_models",
    "embedding": "embeddings",
    "embeddings": "embeddings",
    "unet": "diffusion_models",
    "diffusion_model": "diffusion_models",
}


class CatalogError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def list_models(mode: str = "cache") -> dict[str, Any]:
    picked = mode if mode in _MODES else "cache"
    rows = _from_comfy(picked)
    if rows is None:
        rows = _from_disk()
        if rows is None:
            raise CatalogError("not_found", "ComfyUI Manager catalog is unavailable.", 503)
        _mark_installed(rows)
    return {"models": [_public(item) for item in rows]}


def find_item(rows: list[dict[str, Any]], name: str, filename: str, save_path: str = "") -> dict[str, Any] | None:
    want_name = name.strip()
    want_file = filename.strip()
    want_save = save_path.strip()
    for item in rows:
        if str(item.get("name") or "") != want_name:
            continue
        if str(item.get("filename") or "") != want_file:
            continue
        if want_save and str(item.get("save_path") or "") != want_save:
            continue
        return item
    return None


def dest_path(root: Path, item: dict[str, Any]) -> Path:
    folder = _save_folder(item)
    name = _file_name(item)
    dest = (root / folder / name).resolve()
    base = root.resolve()
    if dest != base and base not in dest.parents:
        raise CatalogError("bad_request", "invalid save path", 400)
    return dest


def install(name: str, filename: str, save_path: str = "") -> dict[str, Any]:
    rows = _catalog_rows()
    item = find_item(rows, name, filename, save_path)
    if item is None:
        raise CatalogError("not_found", "model is not in the Manager catalog")
    url = str(item.get("url") or "").strip()
    if not url:
        raise CatalogError("bad_request", "catalog entry has no download url", 400)
    dirs.write_extra_model_paths()
    dest = dest_path(models_root(), item)
    if dest.is_file():
        model_lists.refresh_models()
        return {"ok": True, "path": str(dest)}
    dest.parent.mkdir(parents=True, exist_ok=True)
    key = f"manager:{dest.name}:{uuid.uuid4().hex[:8]}"
    download_progress.start(
        key,
        {
            "name": str(item.get("name") or ""),
            "fileName": dest.name,
            "kind": str(item.get("type") or ""),
            "baseModel": str(item.get("base") or ""),
        },
    )
    temporary = dest.parent / f".{dest.name}.{uuid.uuid4().hex}.part"
    try:
        _write_download(url, temporary)
        os.replace(temporary, dest)
    except CatalogError:
        temporary.unlink(missing_ok=True)
        raise
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise CatalogError("bad_request", "could not save the downloaded file", 400) from exc
    finally:
        download_progress.finish(key)
    model_lists.refresh_models()
    return {"ok": True, "path": str(dest)}


def _catalog_rows() -> list[dict[str, Any]]:
    rows = _from_comfy("cache")
    if rows is None:
        rows = _from_disk()
    if not rows:
        raise CatalogError("not_found", "ComfyUI Manager catalog is unavailable.", 503)
    return rows


def _from_comfy(mode: str) -> list[dict[str, Any]] | None:
    try:
        raw = comfy._request("GET", f"/externalmodel/getlist?{urlencode({'mode': mode})}", timeout=60)
        data = json.loads(raw.decode("utf-8"))
    except (comfy.ComfyError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return _parse_models(data.get("models"))


def _from_disk() -> list[dict[str, Any]] | None:
    path = _catalog_file()
    if path is None or not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return _parse_models(data.get("models"))


def _catalog_file() -> Path | None:
    env = launcher_env()
    raw = str(env.get("comfyui.path") or "").strip()
    roots = [Path(raw)] if raw else []
    roots.append(RUNTIME / "comfyui" / "ComfyUI")
    for root in roots:
        path = root / "custom_nodes" / "comfyui-manager" / "model-list.json"
        if path.is_file():
            return path
    return None


def _parse_models(raw: object) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list):
        return None
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        filename = str(item.get("filename") or "").strip()
        url = str(item.get("url") or "").strip()
        if not name or not filename or not url:
            continue
        row = {
            "name": name,
            "type": str(item.get("type") or "").strip(),
            "base": str(item.get("base") or "").strip(),
            "save_path": str(item.get("save_path") or "").strip() or "default",
            "description": _plain(item.get("description")),
            "reference": str(item.get("reference") or "").strip(),
            "filename": filename,
            "url": url,
            "size": str(item.get("size") or "").strip(),
            "installed": "True" if str(item.get("installed") or "") == "True" else "False",
        }
        out.append(row)
    return out


def _mark_installed(rows: list[dict[str, Any]]) -> None:
    root = models_root()
    extras = list(dirs.extra_named("modelDirs").values())
    for item in rows:
        try:
            paths = [dest_path(root, item), *(dest_path(folder, item) for folder in extras)]
        except CatalogError:
            item["installed"] = "False"
            continue
        item["installed"] = "True" if any(path.is_file() for path in paths) else "False"


def _public(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item[key] for key in (
        "name",
        "type",
        "base",
        "save_path",
        "description",
        "reference",
        "filename",
        "size",
        "installed",
    )}


def _save_folder(item: dict[str, Any]) -> Path:
    raw = str(item.get("save_path") or "default").replace("\\", "/").strip()
    if raw == "default":
        mapped = _TYPE_FOLDERS.get(str(item.get("type") or "").strip().lower())
        raw = mapped or "etc"
    if raw.startswith("custom_nodes"):
        raise CatalogError("bad_request", "custom node model paths are not supported", 400)
    path = Path(*[part for part in raw.split("/") if part and part != "."])
    if not path.parts or path.is_absolute() or ".." in path.parts or any(":" in part for part in path.parts):
        raise CatalogError("bad_request", "invalid save path", 400)
    return path


def _file_name(item: dict[str, Any]) -> str:
    name = str(item.get("filename") or "").strip()
    if name == "<huggingface>":
        name = Path(urlsplit(str(item.get("url") or "")).path).name
    if not name or any(ch in name for ch in "/\\:") or name in {".", ".."}:
        raise CatalogError("bad_request", "invalid filename", 400)
    return name


def _plain(raw: object) -> str:
    text = _TAG.sub(" ", str(raw or ""))
    return " ".join(text.split())


def _write_download(url: str, target: Path) -> None:
    request = Request(url, headers={"User-Agent": "BlomboUI"}, method="GET")
    try:
        with urlopen(request, timeout=60) as response, target.open("wb") as output:
            expected = 0
            headers = getattr(response, "headers", None)
            if headers is not None:
                try:
                    expected = max(0, int(headers.get("Content-Length") or 0))
                except (TypeError, ValueError):
                    expected = 0
            done = 0
            while chunk := response.read(_CHUNK):
                output.write(chunk)
                done += len(chunk)
                download_progress.bump(done, expected)
    except HTTPError as exc:
        raise CatalogError("bad_request", f"download failed: HTTP {exc.code}", 400) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise CatalogError("bad_request", "download failed", 400) from exc
