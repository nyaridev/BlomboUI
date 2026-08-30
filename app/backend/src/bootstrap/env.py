"""Launcher paths, environment resolution, and bootstrap files."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

from shared.extra_model_paths import MODEL_SUBDIRS, write_file as write_extra_model_paths_file

APP = Path(__file__).resolve().parents[3]
ROOT = APP.parent
RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
COMFY_BUNDLED = RUNTIME / "comfyui" / "ComfyUI"
WEB = APP / "frontend"
API = APP / "backend"
RESTART_FLAG = RUNTIME / "tmp" / "restart"
COMFY_RESTART_FLAG = RUNTIME / "tmp" / "comfy-restart"


def bundled_comfy() -> Path:
    selected = RUNTIME / "comfyui" / "selected"
    try:
        slot = selected.read_text(encoding="utf-8").splitlines()[0].strip()
    except OSError:
        slot = ""
    if slot:
        return RUNTIME / "comfyui" / slot / "ComfyUI"
    return COMFY_BUNDLED


def env_path(name: str) -> Path | None:
    raw = os.environ.get(name, "").strip().strip('"')
    if not raw:
        return None
    return Path(raw).expanduser()


def _first_existing(candidates: list[Path]) -> Path | None:
    for path in candidates:
        if path.is_file():
            return path
    return None


def python_kind() -> str:
    exe = Path(sys.executable).resolve()
    venv = (RUNTIME / ".venv").resolve()
    if venv in exe.parents:
        return "venv"
    return "system"


def comfy_python(comfy_path: Path) -> Path | None:
    sibling = comfy_path.parent / "python_embeded"
    bundled = RUNTIME / "comfyui" / "python_embeded"
    return _first_existing(
        [
            sibling / "python.exe",
            sibling / "python",
            comfy_path / "venv" / "Scripts" / "python.exe",
            comfy_path / "venv" / "bin" / "python",
            comfy_path / ".venv" / "Scripts" / "python.exe",
            comfy_path / ".venv" / "bin" / "python",
            bundled / "python.exe",
            bundled / "python",
        ]
    )


def ensure_dirs() -> None:
    (APP / "workflows").mkdir(exist_ok=True)
    for name in ("data", "tmp", "comfyui"):
        (RUNTIME / name).mkdir(exist_ok=True)
    USER.mkdir(exist_ok=True)
    models = USER / "models"
    models.mkdir(exist_ok=True)
    for sub in MODEL_SUBDIRS:
        (models / sub).mkdir(exist_ok=True)
    (USER / "output").mkdir(exist_ok=True)
    (USER / "data" / "sqlite").mkdir(parents=True, exist_ok=True)
    (RUNTIME / "data" / "sqlite").mkdir(parents=True, exist_ok=True)
    (USER / "wildcards").mkdir(exist_ok=True)
    (USER / "autocompletion").mkdir(exist_ok=True)
    (USER / "gallery_thumbs").mkdir(exist_ok=True)
    (USER / "model_thumbs").mkdir(exist_ok=True)
    download_thumbs = USER / "data" / "history" / "download"
    browse_thumbs = USER / "data" / "history" / "browse"
    download_thumbs.mkdir(parents=True, exist_ok=True)
    browse_thumbs.mkdir(parents=True, exist_ok=True)
    old_thumbs = USER / "download_thumbs"
    if old_thumbs.is_dir():
        for path in old_thumbs.iterdir():
            if not path.is_file():
                continue
            dest = download_thumbs / path.name
            if dest.exists():
                path.unlink(missing_ok=True)
                continue
            path.replace(dest)
        try:
            old_thumbs.rmdir()
        except OSError:
            pass
    (USER / "removed").mkdir(exist_ok=True)


def resolve() -> dict[str, str | None]:
    comfy = env_path("COMFYUI_PATH") or bundled_comfy()
    models = env_path("MODELS_ROOT") or (USER / "models")
    wildcards = env_path("WILDCARDS_ROOT") or (USER / "wildcards")
    outputs = env_path("OUTPUTS_ROOT") or kept_output() or (USER / "output")
    py = comfy_python(comfy)
    bundled = bundled_comfy()

    if (comfy / "main.py").is_file():
        try:
            mode = "bundled" if comfy.resolve() == bundled.resolve() else "external"
        except OSError:
            mode = "external"
    else:
        mode = "missing"

    return {
        "blombo.python": sys.executable,
        "blombo.python_kind": python_kind(),
        "comfyui.mode": mode,
        "comfyui.path": str(comfy.resolve()) if comfy.exists() else str(comfy),
        "comfyui.python": str(py) if py else None,
        "comfyui.host": os.environ.get("COMFYUI_HOST", "").strip() or "127.0.0.1",
        "comfyui.port": os.environ.get("COMFYUI_PORT", "").strip() or "8188",
        "models.root": str(models.resolve()),
        "outputs.root": str(outputs.resolve()),
        "wildcards.root": str(wildcards.resolve()),
    }


def write_launcher_env(settings: dict[str, str | None]) -> Path:
    path = RUNTIME / "data" / "launcher-env.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return path


def kept_output() -> Path | None:
    path = RUNTIME / "data" / "launcher-env.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    raw = str(data.get("outputs.root") or "").strip()
    if not raw:
        return None
    folder = Path(raw)
    parts = folder.parts
    if len(parts) >= 2 and parts[-1].lower() == "output" and parts[-2].lower() == "user":
        return None
    return folder


def write_extra_model_paths(models_root: Path) -> Path:
    path = RUNTIME / "data" / "extra_model_paths.yaml"
    roots: list[tuple[str, Path]] = [("blomboui", models_root)]
    for name, folder in user_model_dirs():
        roots.append((name, folder))
    return write_extra_model_paths_file(path, roots)


def user_model_dirs() -> list[tuple[str, Path]]:
    path = USER / "data" / "sqlite" / "blombo.sqlite"
    if not path.is_file():
        return []
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        try:
            row = conn.execute("SELECT data_json FROM app_settings WHERE id = 1").fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return []
    if not row:
        return []
    try:
        data = json.loads(row[0])
    except (TypeError, json.JSONDecodeError):
        return []
    raw = data.get("modelDirs") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return []
    out: list[tuple[str, Path]] = []
    seen_names: set[str] = set()
    seen_paths: set[str] = {str((USER / "models").resolve()).replace("\\", "/").rstrip("/").casefold()}
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = str(item.get("id") or "").strip().lower()
        name = str(item.get("name") or "").strip()
        folder = Path(str(item.get("path") or "").strip())
        if ident == "local" or not name or name.lower() in seen_names or not folder.is_dir():
            continue
        resolved = str(folder.resolve()).replace("\\", "/").rstrip("/").casefold()
        if resolved in seen_paths:
            continue
        seen_names.add(name.lower())
        seen_paths.add(resolved)
        out.append((name, folder))
    return out
