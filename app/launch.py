"""BlomboUI launcher. Called by webui.bat."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parent
RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
COMFY_BUNDLED = RUNTIME / "comfy" / "ComfyUI"

MODEL_SUBDIRS = ("checkpoints", "loras", "vae", "controlnet", "embeddings")


def _env_path(name: str) -> Path | None:
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
    embed = (RUNTIME / "python_embeded" / "python.exe").resolve()
    if exe == embed:
        return "embed"
    venv = (RUNTIME / "venv").resolve()
    if venv in exe.parents:
        return "venv"
    return "system"


def comfy_python(comfy_path: Path) -> Path | None:
    bundled_embed = RUNTIME / "comfy" / "python_embeded" / "python.exe"
    sibling_embed = comfy_path.parent / "python_embeded" / "python.exe"
    return _first_existing(
        [
            bundled_embed,
            sibling_embed,
            comfy_path / "venv" / "Scripts" / "python.exe",
            comfy_path / ".venv" / "Scripts" / "python.exe",
        ]
    )


def ensure_dirs() -> None:
    (APP / "workflows").mkdir(exist_ok=True)
    for name in ("data", "tmp", "comfy"):
        (RUNTIME / name).mkdir(exist_ok=True)
    USER.mkdir(exist_ok=True)
    models = USER / "models"
    models.mkdir(exist_ok=True)
    for sub in MODEL_SUBDIRS:
        (models / sub).mkdir(exist_ok=True)
    (USER / "output").mkdir(exist_ok=True)
    (USER / "gallery").mkdir(exist_ok=True)
    (USER / "wildcards").mkdir(exist_ok=True)


def resolve() -> dict[str, str | None]:
    comfy = _env_path("COMFYUI_PATH") or COMFY_BUNDLED
    models = _env_path("MODELS_ROOT") or (USER / "models")
    outputs = _env_path("OUTPUTS_ROOT") or (USER / "output")
    gallery = _env_path("GALLERY_ROOT") or (USER / "gallery")
    wildcards = _env_path("WILDCARDS_ROOT") or (USER / "wildcards")
    py = comfy_python(comfy)

    if (comfy / "main.py").is_file():
        mode = "bundled" if comfy.resolve() == COMFY_BUNDLED.resolve() else "external"
    else:
        mode = "missing"

    return {
        "blombo.python": sys.executable,
        "blombo.python_kind": python_kind(),
        "comfyui.mode": mode,
        "comfyui.path": str(comfy.resolve()) if comfy.exists() else str(comfy),
        "comfyui.python": str(py) if py else None,
        "models.root": str(models.resolve()),
        "outputs.root": str(outputs.resolve()),
        "gallery.root": str(gallery.resolve()),
        "wildcards.root": str(wildcards.resolve()),
    }


def write_launcher_env(settings: dict[str, str | None]) -> Path:
    path = RUNTIME / "data" / "launcher-env.json"
    path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return path


def _enable_ansi() -> None:
    if sys.platform != "win32":
        return
    try:
        import ctypes

        handle = ctypes.windll.kernel32.GetStdHandle(-11)
        mode = ctypes.c_uint()
        if ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            ctypes.windll.kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except OSError:
        return


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"


def _row(label: str, value: str, *, warn: bool = False) -> None:
    tone = "38;5;221" if warn else "38;5;229"
    print(f"    {_c('38;5;245', f'{label:<16}')} {_c(tone, value)}")


def main() -> int:
    _enable_ansi()
    ensure_dirs()
    settings = resolve()
    env_file = write_launcher_env(settings)
    comfy_ok = settings["comfyui.mode"] != "missing"

    _row("root", str(ROOT))
    _row("app", str(APP))
    _row("runtime", str(RUNTIME))
    _row("python", f"{sys.executable}  ({settings['blombo.python_kind']})")
    _row("comfy", f"{settings['comfyui.mode']}  {settings['comfyui.path']}", warn=not comfy_ok)
    _row("comfy py", settings["comfyui.python"] or "(not found)", warn=not settings["comfyui.python"])
    _row("models", settings["models.root"] or "")
    _row("output", settings["outputs.root"] or "")
    _row("gallery", settings["gallery.root"] or "")
    _row("wildcards", settings["wildcards.root"] or "")
    _row("wrote", str(env_file))
    print()

    if not comfy_ok:
        print(f"    {_c('38;5;221', 'WARN')}   ComfyUI is not installed.")
        print(f"    {_c('38;5;245', 'Missing: runtime\\comfy\\ComfyUI')}")
        print(f"    {_c('38;5;245', 'Run install\\install-comfyui.bat')}")
        print(f"    {_c('38;5;245', 'or set COMFYUI_PATH in webui-user.bat.')}")
        print()

    print(f"    {_c('38;5;114', 'OK')}     Launcher ready")
    print(f"    {_c('38;5;245', 'App servers are the next step (FastAPI + Vite).')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
