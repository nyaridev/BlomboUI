"""BlomboUI launcher. Called by webui.bat."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parent
sys.path.insert(0, str(APP))

from version import VERSION
from launcher.proc import (
    create_job_object,
    free_port,
    install_close_handler,
    pids_listening,
    reachable,
    spawn,
    stop,
    wait_ready,
)

RUNTIME = ROOT / "runtime"
USER = ROOT / "user"
COMFY_BUNDLED = RUNTIME / "comfy" / "ComfyUI"
WEB = APP / "web"
API = APP / "api"
RESTART_FLAG = RUNTIME / "tmp" / "restart"

API_HOST = "127.0.0.1"
API_PORT = 4173
WEB_HOST = "127.0.0.1"
WEB_PORT = 5173
COMFY_HOST = "127.0.0.1"
COMFY_PORT = 8188

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
    (USER / "user_data").mkdir(exist_ok=True)
    (USER / "wildcards").mkdir(exist_ok=True)
    (USER / "autocompletion").mkdir(exist_ok=True)


def resolve() -> dict[str, str | None]:
    comfy = _env_path("COMFYUI_PATH") or COMFY_BUNDLED
    models = _env_path("MODELS_ROOT") or (USER / "models")
    wildcards = _env_path("WILDCARDS_ROOT") or (USER / "wildcards")
    outputs = _env_path("OUTPUTS_ROOT") or _kept_output() or (USER / "output")
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
        "wildcards.root": str(wildcards.resolve()),
    }


def write_launcher_env(settings: dict[str, str | None]) -> Path:
    path = RUNTIME / "data" / "launcher-env.json"
    path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return path


def _kept_output() -> Path | None:
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
    blocks = [_yaml_model_block("blomboui", models_root)]
    for name, folder in _user_model_dirs():
        blocks.append(_yaml_model_block(name, folder))
    path.write_text("\n".join(blocks) + "\n", encoding="utf-8")
    return path


def _yaml_model_block(ident: str, root: Path) -> str:
    models = str(root.resolve()).replace("\\", "/")
    ident = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in ident).strip("._-") or "extra"
    return "\n".join(
        [
            f"{ident}:",
            f"    base_path: '{models}'",
            "    checkpoints: checkpoints",
            "    loras: loras",
            "    vae: vae",
            "    controlnet: controlnet",
            "    embeddings: embeddings",
            "",
        ]
    )


def _user_model_dirs() -> list[tuple[str, Path]]:
    file = USER / "user_data" / "user_settings.json"
    if not file.is_file():
        return []
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
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


def _find_npm() -> str | None:
    return shutil.which("npm.cmd") or shutil.which("npm")


def ensure_api_deps() -> None:
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import websockets  # noqa: F401
        import yaml  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        print(f"    {_c('38;5;245', 'pip')}    installing FastAPI")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--no-warn-script-location", "setuptools>=69"]
        )
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--no-warn-script-location", "-e", str(API)]
        )


def ensure_web_deps() -> str:
    npm = _find_npm()
    if not npm:
        raise RuntimeError("Node.js / npm not found on PATH. Install Node.js LTS and relaunch.")
    if not (WEB / "package.json").is_file():
        raise RuntimeError(f"Frontend is missing: {WEB / 'package.json'}")
    if not (WEB / "node_modules").is_dir():
        print(f"    {_c('38;5;245', 'npm')}    installing frontend")
        subprocess.check_call([npm, "install"], cwd=WEB)
    return npm


_LOGS: list = []


def _vite_cmd() -> list[str]:
    node = shutil.which("node.exe") or shutil.which("node")
    if not node:
        raise RuntimeError("Node.js not found on PATH. Install Node.js LTS and relaunch.")
    script = WEB / "node_modules" / "vite" / "bin" / "vite.js"
    if not script.is_file():
        raise RuntimeError(f"Vite is missing: {script}")
    return [node, str(script), "--host", WEB_HOST, "--port", str(WEB_PORT), "--strictPort"]


def _api_cmd() -> list[str]:
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "blombo.main:app",
        "--host",
        API_HOST,
        "--port",
        str(API_PORT),
        "--no-access-log",
    ]


def _consume_restart() -> bool:
    if not RESTART_FLAG.is_file():
        return False
    try:
        RESTART_FLAG.unlink()
    except OSError:
        pass
    return True


def _comfy_url() -> str:
    return f"http://{COMFY_HOST}:{COMFY_PORT}"


def _open_browser(url: str) -> None:
    try:
        if sys.platform == "win32":
            os.startfile(url)
            return
    except OSError:
        pass
    webbrowser.open(url)


def start_comfy(settings: dict[str, str | None]) -> subprocess.Popen | None:
    stats = f"{_comfy_url()}/system_stats"
    if reachable(stats):
        print(f"    {_c('38;5;245', 'comfy')}  already running, attaching")
        return None
    if pids_listening(COMFY_PORT):
        print(f"    {_c('38;5;245', 'comfy')}  port {COMFY_PORT} in use, attaching")
        return None
    if settings["comfyui.mode"] == "missing":
        return None
    py = settings["comfyui.python"]
    if not py:
        print(f"    {_c('38;5;221', 'WARN')}   ComfyUI Python not found; backend not started")
        return None

    comfy_path = Path(settings["comfyui.path"] or "")
    models = Path(settings["models.root"] or (USER / "models"))
    outputs = RUNTIME / "tmp" / "comfy-output"
    outputs.mkdir(parents=True, exist_ok=True)
    yaml = write_extra_model_paths(models)
    log_path = RUNTIME / "tmp" / "comfyui.log"
    log_file = log_path.open("w", encoding="utf-8", errors="replace")
    _LOGS.append(log_file)

    env = os.environ.copy()
    for key in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"):
        env.pop(key, None)

    proc = spawn(
        [
            py,
            "-u",
            "main.py",
            "--listen",
            COMFY_HOST,
            "--port",
            str(COMFY_PORT),
            "--disable-auto-launch",
            "--preview-method",
            "auto",
            "--extra-model-paths-config",
            str(yaml),
            "--output-directory",
            str(outputs),
        ],
        cwd=comfy_path,
        env=env,
        log=log_file,
    )
    time.sleep(0.6)
    if proc.poll() is not None:
        print(f"    {_c('38;5;203', 'ERROR')}  ComfyUI exited immediately. See {log_path}")
        return None
    print(f"    {_c('38;5;245', 'comfy')}  starting backend  {_comfy_url()}")
    print(f"    {_c('38;5;245', 'log')}    {log_path}")
    return proc


def run_servers(settings: dict[str, str | None]) -> int:
    ensure_api_deps()
    ensure_web_deps()
    create_job_object()
    install_close_handler()
    free_port(API_PORT)
    free_port(WEB_PORT)

    env = os.environ.copy()
    pythonpath = str(API)
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = pythonpath if not existing else pythonpath + os.pathsep + existing

    api_proc: subprocess.Popen | None = None
    web_proc: subprocess.Popen | None = None
    comfy_proc: subprocess.Popen | None = None
    web_url = f"http://{WEB_HOST}:{WEB_PORT}"
    api_url = f"http://{API_HOST}:{API_PORT}"
    comfy_ready = False

    try:
        comfy_proc = start_comfy(settings)
        api_proc = spawn(_api_cmd(), cwd=API, env=env)
        api_ok = wait_ready(f"{api_url}/api/health", api_proc, API_PORT)
        web_proc = spawn(_vite_cmd(), cwd=WEB)
        web_ok = wait_ready(web_url, web_proc, WEB_PORT)
        if not api_ok or not web_ok:
            print(f"    {_c('38;5;203', 'ERROR')}  Server failed to start.")
            if api_proc.poll() is not None:
                print(f"    {_c('38;5;245', 'API exit')} {api_proc.returncode}")
            if web_proc.poll() is not None:
                print(f"    {_c('38;5;245', 'Vite exit')} {web_proc.returncode}")
            return 1

        print()
        _row("app", f"BlomboUI {VERSION}")
        _row("api", f"{api_url}/api/health")
        _row("ui", web_url)
        if reachable(f"{_comfy_url()}/system_stats"):
            _row("comfy", f"{_comfy_url()}  backend")
            comfy_ready = True
        elif comfy_proc is not None:
            _row("comfy", f"{_comfy_url()}  starting (backend, no browser)")
        else:
            _row("comfy", "not running", warn=True)
        print(f"    {_c('38;5;114', 'OK')}     Opening {web_url}")
        print(f"    {_c('38;5;245', 'Close this window or Ctrl+C to stop')}")
        print()
        _open_browser(web_url)

        while True:
            if _consume_restart():
                print(f"    {_c('38;5;245', 'reload')} API + UI")
                stop(web_proc)
                stop(api_proc)
                free_port(API_PORT)
                free_port(WEB_PORT)
                api_proc = spawn(_api_cmd(), cwd=API, env=env)
                api_ok = wait_ready(f"{api_url}/api/health", api_proc, API_PORT)
                web_proc = spawn(_vite_cmd(), cwd=WEB)
                web_ok = wait_ready(web_url, web_proc, WEB_PORT)
                if not api_ok or not web_ok:
                    print(f"    {_c('38;5;203', 'ERROR')}  Reload failed.")
                    return 1
                print(f"    {_c('38;5;114', 'OK')}     Reloaded")
                continue
            if api_proc.poll() is not None:
                print(f"    {_c('38;5;221', 'WARN')}   API exited ({api_proc.returncode}); restarting")
                stop(api_proc)
                free_port(API_PORT)
                api_proc = spawn(_api_cmd(), cwd=API, env=env)
                if not wait_ready(f"{api_url}/api/health", api_proc, API_PORT):
                    print(f"    {_c('38;5;203', 'ERROR')}  API failed to restart.")
                    return 1
                print(f"    {_c('38;5;114', 'OK')}     API restarted")
                continue
            if web_proc.poll() is not None:
                print(f"    {_c('38;5;221', 'WARN')}   Vite exited ({web_proc.returncode}); restarting")
                stop(web_proc)
                free_port(WEB_PORT)
                web_proc = spawn(_vite_cmd(), cwd=WEB)
                if not wait_ready(web_url, web_proc, WEB_PORT):
                    print(f"    {_c('38;5;203', 'ERROR')}  Vite failed to restart.")
                    return 1
                print(f"    {_c('38;5;114', 'OK')}     Vite restarted")
                continue
            if comfy_proc is not None and comfy_proc.poll() is not None:
                print(f"    {_c('38;5;203', 'ERROR')}  ComfyUI exited ({comfy_proc.returncode})")
                comfy_proc = None
            if not comfy_ready and reachable(f"{_comfy_url()}/system_stats"):
                print(f"    {_c('38;5;114', 'OK')}     ComfyUI backend ready")
                comfy_ready = True
            time.sleep(0.4)
    except KeyboardInterrupt:
        print()
        print(f"    {_c('38;5;245', 'Stopping')}")
        return 0
    finally:
        stop(web_proc)
        stop(api_proc)
        stop(comfy_proc)
        for log in _LOGS:
            try:
                log.close()
            except OSError:
                pass


def main() -> int:
    _enable_ansi()
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except (OSError, AttributeError, ValueError):
        pass
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
    _row("wildcards", settings["wildcards.root"] or "")
    _row("wrote", str(env_file))
    print()

    if not comfy_ok:
        print(f"    {_c('38;5;221', 'WARN')}   ComfyUI is not installed.")
        print(f"    {_c('38;5;245', 'Missing: runtime\\comfy\\ComfyUI')}")
        print(f"    {_c('38;5;245', 'Run install\\install-comfyui.bat')}")
        print(f"    {_c('38;5;245', 'or set COMFYUI_PATH in webui-user.bat.')}")
        print()

    try:
        return run_servers(settings)
    except RuntimeError as exc:
        print(f"    {_c('38;5;203', 'ERROR')}  {exc}")
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"    {_c('38;5;203', 'ERROR')}  Command failed ({exc.returncode})")
        return exc.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())
