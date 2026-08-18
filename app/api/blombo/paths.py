from __future__ import annotations

import json
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
ROOT = APP.parent
RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
WORKFLOWS = APP / "workflows"

COMFY_HOST = "127.0.0.1"
COMFY_PORT = 8188


def get_version() -> str:
    path = APP / "VERSION"
    try:
        value = path.read_text(encoding="utf-8").splitlines()[0].strip()
    except OSError:
        return "0.1.0"
    return value or "0.1.0"


VERSION = get_version()


def launcher_env() -> dict:
    path = RUNTIME / "data" / "launcher-env.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def outputs_root() -> Path:
    env = launcher_env()
    raw = env.get("outputs.root")
    path = Path(raw) if raw else USER / "output"
    path.mkdir(parents=True, exist_ok=True)
    return path


def models_root() -> Path:
    env = launcher_env()
    raw = env.get("models.root")
    return Path(raw) if raw else USER / "models"


def wildcards_root() -> Path:
    env = launcher_env()
    raw = env.get("wildcards.root")
    return Path(raw) if raw else USER / "wildcards"


def comfy_base() -> str:
    return f"http://{COMFY_HOST}:{COMFY_PORT}"
