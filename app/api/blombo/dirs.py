from __future__ import annotations

import json
import getpass
import os
import subprocess
import sys
import threading
from pathlib import Path

from blombo import settings
from blombo.paths import RUNTIME, launcher_env, models_root, outputs_root, wildcards_root

_PICK_LOCK = threading.Lock()
_RESERVED = {"local", "output"}
LOCAL_ID = "local"


def stored_dirs(key: str) -> list[dict[str, str]]:
    raw = settings.load().get(key)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = str(item.get("id") or "").strip()[:80]
        name = str(item.get("name") or "").strip()[:40]
        path = str(item.get("path") or "").strip()
        if not ident or not name or ident in seen:
            continue
        if any(ch in name for ch in "/\\"):
            continue
        seen.add(ident)
        out.append({"id": ident, "name": name, "path": path})
    return out


def extra_dirs(key: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    names: set[str] = set()
    paths: set[str] = set()
    root = _local_root(key)
    if root is not None:
        folder = norm_dir(str(root))
        if folder:
            paths.add(folder)
    for item in stored_dirs(key):
        if item["id"] == LOCAL_ID or item["name"].lower() in _RESERVED:
            continue
        key_name = item["name"].lower()
        if key_name in names:
            continue
        folder = norm_dir(item["path"])
        if folder and folder in paths:
            continue
        names.add(key_name)
        if folder:
            paths.add(folder)
        out.append(item)
    return out


def extra_named(key: str) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for item in extra_dirs(key):
        path = Path(item["path"]) if item["path"] else None
        if path is None or not path.is_dir():
            continue
        out[item["name"]] = path
    return out


def listed_dirs(key: str) -> list[dict[str, str]]:
    if key == "modelDirs":
        return _with_locked(stored_dirs(key), LOCAL_ID, "Local", models_root())
    if key == "wildcardDirs":
        return _with_locked(stored_dirs(key), LOCAL_ID, "Local", wildcards_root())
    if key == "galleryDirs":
        return [{"id": "output", "name": "Output", "path": str(outputs_root().resolve())}, *[item for item in stored_dirs(key) if item["id"] != "output"]]
    return stored_dirs(key)


def dir_exists(raw: str) -> bool:
    text = str(raw or "").strip()
    if not text:
        return False
    try:
        return Path(text).is_dir()
    except OSError:
        return False


def open_folder(raw: str) -> None:
    text = str(raw or "").strip()
    path = Path(text)
    if not text or not path.is_dir():
        raise ValueError("folder not found")
    if sys.platform == "win32":
        os.startfile(str(path))
        return
    raise ValueError("open folder is only supported on Windows")


def norm_dir(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        path = Path(text)
        if path.exists():
            text = str(path.resolve())
    except OSError:
        pass
    return text.replace("\\", "/").rstrip("/").casefold()


def _local_root(key: str) -> Path | None:
    if key == "modelDirs":
        return models_root()
    if key == "wildcardDirs":
        return wildcards_root()
    if key == "galleryDirs":
        return outputs_root()
    return None


def resolved() -> dict[str, str]:
    return {
        "models": str(models_root().resolve()),
        "wildcards": str(wildcards_root().resolve()),
        "output": str(outputs_root().resolve()),
        "userName": getpass.getuser() or "User",
    }


def set_output_root(raw: str) -> dict[str, str]:
    path = Path(raw.strip())
    if not path.is_absolute():
        raise ValueError("path must be absolute")
    path.mkdir(parents=True, exist_ok=True)
    env = dict(launcher_env())
    env["outputs.root"] = str(path.resolve())
    dest = RUNTIME / "data" / "launcher-env.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(env, indent=2), encoding="utf-8")
    return resolved()


def write_extra_model_paths() -> Path:
    # Kept separate from launcher.env: the API may write this after settings change.
    dest = RUNTIME / "data" / "extra_model_paths.yaml"
    dest.parent.mkdir(parents=True, exist_ok=True)
    lines = _yaml_block("blomboui", models_root())
    for item in extra_dirs("modelDirs"):
        folder = Path(item["path"]) if item["path"] else None
        if folder is None or not folder.is_dir():
            continue
        ident = _yaml_ident(item["name"])
        lines.extend(_yaml_block(ident, folder))
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return dest


def pick_folder() -> str | None:
    with _PICK_LOCK:
        if sys.platform == "win32":
            return _pick_folder_windows()
        return _pick_folder_tk()


def file_dialog_pick(title: str = "Select folder") -> str | None:
    import ctypes
    import uuid
    from ctypes import POINTER, byref, c_long, c_void_p
    from ctypes.wintypes import DWORD, HWND, LPCWSTR, LPWSTR, ULONG

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", DWORD),
            ("Data2", ctypes.c_ushort),
            ("Data3", ctypes.c_ushort),
            ("Data4", ctypes.c_ubyte * 8),
        ]

        def __init__(self, text: str) -> None:
            u = uuid.UUID(text)
            super().__init__()
            self.Data1 = u.time_low
            self.Data2 = u.time_mid
            self.Data3 = u.time_hi_version
            for i, byte in enumerate(u.bytes[8:]):
                self.Data4[i] = byte

    ole32 = ctypes.windll.ole32
    ole32.CoInitialize(None)
    dialog = c_void_p()
    try:
        hr = ole32.CoCreateInstance(
            byref(GUID("{DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7}")),
            None,
            1,
            byref(GUID("{D57C7288-D4AD-4768-BE02-9D969532D960}")),
            byref(dialog),
        )
        if hr != 0 or not dialog:
            raise RuntimeError("folder picker failed")

        vtbl = ctypes.cast(dialog, POINTER(POINTER(c_void_p))).contents
        keep: list[object] = []

        def call(index: int, restype, *argtypes):
            proto = ctypes.WINFUNCTYPE(restype, c_void_p, *argtypes)
            func = proto(vtbl[index])
            keep.append(func)
            return func

        get_options = call(10, c_long, POINTER(DWORD))
        set_options = call(9, c_long, DWORD)
        set_title = call(17, c_long, LPCWSTR)
        show = call(3, c_long, HWND)
        get_result = call(20, c_long, POINTER(c_void_p))
        release = call(2, ULONG)

        opts = DWORD(0)
        get_options(dialog, byref(opts))
        set_options(dialog, opts.value | 0x20 | 0x40)
        set_title(dialog, title)
        hr = show(dialog, None)
        if hr != 0:
            release(dialog)
            return None

        item = c_void_p()
        if get_result(dialog, byref(item)) != 0 or not item:
            release(dialog)
            return None

        item_vtbl = ctypes.cast(item, POINTER(POINTER(c_void_p))).contents
        get_name = ctypes.WINFUNCTYPE(c_long, c_void_p, DWORD, POINTER(LPWSTR))(item_vtbl[5])
        release_item = ctypes.WINFUNCTYPE(ULONG, c_void_p)(item_vtbl[2])
        keep.extend([get_name, release_item])
        name = LPWSTR()
        path = None
        if get_name(item, 0x80058000, byref(name)) == 0 and name.value:
            path = name.value
            ole32.CoTaskMemFree(name)
        release_item(item)
        release(dialog)
        return path
    finally:
        ole32.CoUninitialize()


def _pick_folder_windows() -> str | None:
    api = str(Path(__file__).resolve().parents[1])
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); "
        "from blombo.dirs import file_dialog_pick; "
        "p = file_dialog_pick(); "
        "sys.stdout.buffer.write((p or '').encode('utf-8'))"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", code, api],
            capture_output=True,
            timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("folder picker failed") from exc
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", errors="replace").strip()[:300]
        raise RuntimeError(detail or "folder picker failed")
    return result.stdout.decode("utf-8").strip() or None


def _pick_folder_tk() -> str | None:
    code = (
        "import sys\n"
        "from tkinter import Tk, filedialog\n"
        "root = Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        "root.lift()\n"
        "root.focus_force()\n"
        "root.update()\n"
        "path = filedialog.askdirectory(parent=root, title='Select folder')\n"
        "root.destroy()\n"
        "sys.stdout.buffer.write((path or '').encode('utf-8'))\n"
    )
    try:
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("folder picker failed") from exc
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", errors="replace").strip()[:300]
        raise RuntimeError(detail or "folder picker failed")
    return result.stdout.decode("utf-8").strip() or None


def gallery_roots() -> list[Path]:
    roots = [outputs_root().resolve()]
    for item in extra_dirs("galleryDirs"):
        folder = Path(item["path"]) if item["path"] else None
        if folder is None or not folder.is_dir():
            continue
        resolved_path = folder.resolve()
        if resolved_path not in roots:
            roots.append(resolved_path)
    return roots


def allowed_file(path: Path) -> bool:
    try:
        real = path.resolve()
    except OSError:
        return False
    if not real.is_file():
        return False
    for root in gallery_roots():
        if real == root or root in real.parents:
            return True
    return False


def _with_locked(rows: list[dict[str, str]], ident: str, name: str, root: Path) -> list[dict[str, str]]:
    locked = {"id": ident, "name": name, "path": str(root.resolve())}
    extras = [item for item in rows if item["id"] != ident]
    for index, item in enumerate(rows):
        if item["id"] == ident:
            return [*rows[:index], locked, *rows[index + 1 :]]
    return [locked, *extras]


def _yaml_ident(name: str) -> str:
    ident = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name).strip("._-")
    return ident or "extra"


def _yaml_block(ident: str, root: Path) -> list[str]:
    models = str(root.resolve()).replace("\\", "/")
    return [
        f"{ident}:",
        f"    base_path: '{models}'",
        "    checkpoints: checkpoints",
        "    loras: loras",
        "    vae: vae",
        "    controlnet: controlnet",
        "    embeddings: embeddings",
        "",
    ]
