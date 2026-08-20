from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from blombo import dirs, model_meta, models
from blombo.paths import models_root

_SKIP = {".gitkeep", "desktop.ini"}
_FILE_NAME = re.compile(r"^[A-Za-z0-9._ -]+$")


class ModelFileError(ValueError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def _kind(kind: str) -> str:
    if kind not in models.KINDS:
        raise ModelFileError(f"unknown model kind: {kind}")
    return kind


def _exts(kind: str) -> tuple[str, ...]:
    return models.KINDS[_kind(kind)]


def tree(kind: str) -> dict[str, Any]:
    exts = _exts(kind)
    roots: list[dict[str, Any]] = []
    for item in dirs.listed_dirs("modelDirs"):
        name = item["name"]
        if item["id"] == dirs.LOCAL_ID:
            folder = models_root() / kind
            prefix = ""
        else:
            folder = Path(item["path"]) / kind if item["path"] else None
            prefix = name
        children = _walk(folder, prefix, exts) if folder is not None else []
        roots.append({"name": name, "path": prefix, "kind": "dir", "children": children})
    return {"roots": roots}


def create_folder(kind: str, folder: str, name: str) -> dict[str, str]:
    _kind(kind)
    leaf = str(name or "").strip()
    if not _FILE_NAME.match(leaf):
        raise ModelFileError("invalid name")
    parent = _resolve(kind, folder)
    if parent is None:
        raise ModelFileError("folder not found", 404)
    parent.mkdir(parents=True, exist_ok=True)
    if not parent.is_dir():
        raise ModelFileError("folder not found", 404)
    path = parent / leaf
    _require_unique(parent, leaf)
    if path.exists():
        raise ModelFileError("already exists")
    path.mkdir()
    return {"path": _join(folder, leaf), "kind": "dir"}


def reveal(kind: str, rel: str) -> None:
    path = _entry(kind, rel)
    if sys.platform != "win32":
        raise ModelFileError("open folder is only supported on Windows")
    resolved = str(path.resolve())
    if path.is_file():
        subprocess.Popen(["explorer", "/select,", resolved])
        return
    os.startfile(resolved)


def move_entry(kind: str, rel: str, folder: str) -> dict[str, str]:
    _kind(kind)
    if _is_root(kind, rel):
        raise ModelFileError("cannot move a root folder")
    source = _entry(kind, rel)
    dest_parent = _resolve(kind, folder)
    if dest_parent is None:
        raise ModelFileError("folder not found", 404)
    dest_parent.mkdir(parents=True, exist_ok=True)
    if not dest_parent.is_dir():
        raise ModelFileError("folder not found", 404)
    if source.is_dir():
        try:
            dest_parent.resolve().relative_to(source.resolve())
        except ValueError:
            pass
        else:
            raise ModelFileError("cannot move a folder into itself")
    dest = dest_parent / source.name
    _require_unique(dest_parent, source.name, source)
    _relocate(source, dest)
    nxt = _join(folder, source.name)
    if nxt != rel:
        model_meta.remap_ident(kind, rel, nxt)
        models.refresh_models(kind)
    return {"path": nxt, "kind": "dir" if dest.is_dir() else "file"}


def rename_entry(kind: str, rel: str, name: str) -> dict[str, str]:
    _kind(kind)
    if _is_root(kind, rel):
        raise ModelFileError("cannot rename a root folder")
    source = _entry(kind, rel)
    leaf = _clean_name(name, source.is_file(), source.suffix, _exts(kind))
    dest = source.with_name(leaf)
    _require_unique(source.parent, leaf, source)
    _relocate(source, dest)
    nxt = _join(_parent_rel(rel), leaf)
    if nxt != rel:
        model_meta.remap_ident(kind, rel, nxt)
        models.refresh_models(kind)
    return {"path": nxt, "kind": "dir" if dest.is_dir() else "file"}


def _walk(folder: Path | None, prefix: str, exts: tuple[str, ...]) -> list[dict[str, Any]]:
    if folder is None or not folder.is_dir():
        return []
    try:
        entries = list(folder.iterdir())
    except OSError:
        return []
    dirs_out: list[dict[str, Any]] = []
    files_out: list[dict[str, Any]] = []
    for entry in entries:
        name = entry.name
        if name in _SKIP or name.startswith("."):
            continue
        rel = _join(prefix, name)
        if entry.is_dir():
            dirs_out.append({"name": name, "path": rel, "kind": "dir", "children": _walk(entry, rel, exts)})
        elif entry.is_file() and entry.suffix.lower() in exts:
            files_out.append({"name": name, "path": rel, "kind": "file"})
    dirs_out.sort(key=lambda node: node["name"].casefold())
    files_out.sort(key=lambda node: node["name"].casefold())
    return dirs_out + files_out


def _same_entry(left: Path, right: Path) -> bool:
    try:
        return left.resolve() == right.resolve()
    except OSError:
        return False


def _require_unique(parent: Path, leaf: str, skip: Path | None = None) -> None:
    want = leaf.casefold()
    if not want:
        return
    try:
        entries = list(parent.iterdir())
    except OSError:
        return
    for entry in entries:
        if skip is not None and _same_entry(entry, skip):
            continue
        if entry.name in _SKIP or entry.name.startswith("."):
            continue
        if entry.name.casefold() == want:
            raise ModelFileError(f"{entry.name} already exists")


def _entry(kind: str, rel: str) -> Path:
    path = _resolve(kind, rel)
    if path is None or not path.exists():
        raise ModelFileError("not found", 404)
    if path.name in _SKIP or path.name.startswith("."):
        raise ModelFileError("unsupported")
    return path


def _is_root(kind: str, rel: str) -> bool:
    name = str(rel or "").replace("\\", "/").strip("/")
    if not name:
        return True
    extras = dirs.extra_named("modelDirs")
    return name in extras and "/" not in name


def _parent_rel(rel: str) -> str:
    name = str(rel or "").replace("\\", "/").strip("/")
    if "/" not in name:
        return ""
    return name.rpartition("/")[0]


def _clean_name(raw: str, is_file: bool, suffix: str, exts: tuple[str, ...]) -> str:
    name = str(raw or "").strip()
    if not _FILE_NAME.match(name):
        raise ModelFileError("invalid name")
    if is_file:
        if Path(name).suffix.lower() not in exts:
            name = f"{name}{suffix}"
        if Path(name).suffix.lower() not in exts:
            raise ModelFileError("unsupported file type")
    return name


def _relocate(source: Path, dest: Path) -> None:
    if dest.exists():
        try:
            same = dest.resolve() == source.resolve()
        except OSError:
            same = False
        if not same:
            raise ModelFileError("already exists")
        if source.name == dest.name:
            return
        tmp = source.with_name(f".{source.name}.tmp")
        n = 0
        while tmp.exists():
            n += 1
            tmp = source.with_name(f".{source.name}.{n}.tmp")
        source.rename(tmp)
        tmp.rename(dest)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(dest))


def _resolve(kind: str, rel: str) -> Path | None:
    name = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if ".." in Path(name).parts:
        return None
    extras = dirs.extra_named("modelDirs")
    root = models_root() / kind
    if not name:
        return root
    first, _, rest = name.partition("/")
    extra = extras.get(first)
    if extra is not None:
        base = extra / kind
        return base / rest if rest else base
    return root / name


def _join(prefix: str, name: str) -> str:
    return f"{prefix}/{name}" if prefix else name
