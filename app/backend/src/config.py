from __future__ import annotations

import json
import os
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
ROOT = APP.parent
RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
DATA = USER / "data"
WORKFLOWS = APP / "workflows"

COMFY_HOST = os.environ.get("COMFYUI_HOST", "").strip() or "127.0.0.1"
try:
    COMFY_PORT = int(os.environ.get("COMFYUI_PORT", "").strip() or "8188")
except ValueError:
    COMFY_PORT = 8188


def get_version() -> str:
    path = APP / "VERSION"
    try:
        value = path.read_text(encoding="utf-8").splitlines()[0].strip()
    except OSError:
        return "1.0.0"
    return value or "1.0.0"


VERSION = get_version()


def user_db_path() -> Path:
    folder = DATA / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "blombo.sqlite"


def cache_db_path() -> Path:
    folder = RUNTIME / "data" / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "cache.sqlite"


def launcher_env() -> dict:
    path = RUNTIME / "data" / "launcher-env.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _is_user_leaf(path: Path, name: str) -> bool:
    parts = path.parts
    return len(parts) >= 2 and parts[-1].lower() == name.lower() and parts[-2].lower() == "user"


def _follow_install(raw: object, name: str) -> Path:
    default = USER / name
    if not raw:
        return default
    path = Path(str(raw))
    if _is_user_leaf(path, name):
        return default
    return path


def outputs_root() -> Path:
    env = launcher_env()
    path = _follow_install(env.get("outputs.root"), "output")
    path.mkdir(parents=True, exist_ok=True)
    return path


def comfy_output_root() -> Path:
    path = RUNTIME / "tmp" / "comfy-output"
    path.mkdir(parents=True, exist_ok=True)
    return path


def models_root() -> Path:
    env = launcher_env()
    return _follow_install(env.get("models.root"), "models")


def wildcards_root() -> Path:
    env = launcher_env()
    return _follow_install(env.get("wildcards.root"), "wildcards")


def comfy_base() -> str:
    env = launcher_env()
    host = os.environ.get("COMFYUI_HOST", "").strip() or str(env.get("comfyui.host") or "") or COMFY_HOST
    raw_port = os.environ.get("COMFYUI_PORT", "").strip() or str(env.get("comfyui.port") or "")
    try:
        port = int(raw_port) if raw_port else COMFY_PORT
    except ValueError:
        port = COMFY_PORT
    return f"http://{host}:{port}"
