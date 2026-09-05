from __future__ import annotations

import json
import os
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
ROOT = APP.parent
RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
DATA = USER / "data"
WORKFLOWS = APP / "workflows"

DEFAULT_PROFILE_ID = "default"
DEFAULT_PROFILE_NAME = "Default"
_PROFILE_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

COMFY_HOST = os.environ.get("COMFYUI_HOST", "").strip() or "127.0.0.1"
try:
    COMFY_PORT = int(os.environ.get("COMFYUI_PORT", "").strip() or "8188")
except ValueError:
    COMFY_PORT = 8188

_ACTIVE_PROFILE_ID = DEFAULT_PROFILE_ID
_OUTPUT_OVERRIDE: str | None = None


def get_version() -> str:
    path = APP / "VERSION"
    try:
        value = path.read_text(encoding="utf-8").splitlines()[0].strip()
    except OSError:
        return "1.1.0"
    return value or "1.1.0"


VERSION = get_version()


def valid_profile_id(ident: str) -> bool:
    return ident == DEFAULT_PROFILE_ID or bool(_PROFILE_UUID.fullmatch(ident))


def active_profile_id() -> str:
    return _ACTIVE_PROFILE_ID


def set_active_profile_id(ident: str) -> None:
    global _ACTIVE_PROFILE_ID
    text = str(ident or "").strip().lower()
    _ACTIVE_PROFILE_ID = text if valid_profile_id(text) else DEFAULT_PROFILE_ID


def set_output_override(path: str | None) -> None:
    global _OUTPUT_OVERRIDE
    text = str(path or "").strip()
    _OUTPUT_OVERRIDE = text or None


def profile_db_path() -> Path:
    folder = DATA / "sqlite"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "profile.sqlite"


def _profile_folder(root: Path, ident: str | None = None) -> Path:
    name = ident or active_profile_id()
    folder = root / name
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def ensure_profile_dirs(ident: str | None = None) -> None:
    name = ident or active_profile_id()
    if not valid_profile_id(name):
        return
    _profile_folder(DATA / "sqlite", name)
    _profile_folder(RUNTIME / "data" / "sqlite", name)
    _profile_folder(USER / "output", name)
    _profile_folder(USER / "gallery_thumbs", name)
    (DATA / "history" / name / "download").mkdir(parents=True, exist_ok=True)
    (DATA / "history" / name / "browse").mkdir(parents=True, exist_ok=True)
    _profile_folder(USER / "removed", name)


def user_db_path() -> Path:
    return _profile_folder(DATA / "sqlite") / "blombo.sqlite"


def cache_db_path() -> Path:
    return _profile_folder(RUNTIME / "data" / "sqlite") / "cache.sqlite"


def cache_gallery_db_path() -> Path:
    return _profile_folder(RUNTIME / "data" / "sqlite") / "cache_gallery.sqlite"


def gallery_thumbs_root() -> Path:
    return _profile_folder(USER / "gallery_thumbs")


def model_thumbs_root() -> Path:
    return _profile_folder(USER / "model_thumbs")


def download_thumbs_root() -> Path:
    folder = DATA / "history" / active_profile_id() / "download"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def browse_thumbs_root() -> Path:
    folder = DATA / "history" / active_profile_id() / "browse"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def removed_root() -> Path:
    return _profile_folder(USER / "removed")


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
    return (
        len(parts) >= 2
        and parts[-1].lower() == name.lower()
        and parts[-2].lower() == "user"
    )


def _follow_install(raw: object, name: str) -> Path:
    default = USER / name
    if not raw:
        return default
    path = Path(str(raw))
    if _is_user_leaf(path, name):
        return default
    return path


def outputs_root() -> Path:
    if _OUTPUT_OVERRIDE:
        path = Path(_OUTPUT_OVERRIDE)
    else:
        path = USER / "output" / active_profile_id()
    path.mkdir(parents=True, exist_ok=True)
    return path


def comfy_output_root() -> Path:
    path = RUNTIME / "tmp" / "comfy-output"
    path.mkdir(parents=True, exist_ok=True)
    return path


def models_root() -> Path:
    env = launcher_env()
    return _follow_install(env.get("models.root"), "models")


def comfy_models_root() -> Path:
    env = launcher_env()
    raw = env.get("comfyui.path")
    base = Path(str(raw)) if raw else RUNTIME / "comfyui" / "ComfyUI"
    return base / "models"


def wildcards_root() -> Path:
    env = launcher_env()
    return _follow_install(env.get("wildcards.root"), "wildcards")


def comfy_base() -> str:
    env = launcher_env()
    host = (
        os.environ.get("COMFYUI_HOST", "").strip()
        or str(env.get("comfyui.host") or "")
        or COMFY_HOST
    )
    raw_port = os.environ.get("COMFYUI_PORT", "").strip() or str(
        env.get("comfyui.port") or ""
    )
    try:
        port = int(raw_port) if raw_port else COMFY_PORT
    except ValueError:
        port = COMFY_PORT
    return f"http://{host}:{port}"
