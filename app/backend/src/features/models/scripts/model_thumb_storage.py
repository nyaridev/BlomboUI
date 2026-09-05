from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import model_meta as model_meta_db


def relocate(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        if dest.exists() and dest.resolve() == src.resolve():
            return
    except OSError:
        pass
    if src.is_dir():
        if dest.is_file():
            dest.unlink(missing_ok=True)
        if dest.is_dir():
            for child in list(src.iterdir()):
                relocate(child, dest / child.name)
            try:
                src.rmdir()
            except OSError:
                pass
            return
        try:
            src.rename(dest)
        except OSError:
            dest.mkdir(parents=True, exist_ok=True)
            for child in list(src.iterdir()):
                relocate(child, dest / child.name)
            try:
                src.rmdir()
            except OSError:
                pass
        return
    if dest.is_dir():
        dest = dest / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file():
        src.unlink(missing_ok=True)
        return
    try:
        src.rename(dest)
    except OSError:
        if not src.is_file():
            return
        dest.write_bytes(src.read_bytes())
        src.unlink(missing_ok=True)


def prune_empty(path: Path, stop: Path) -> None:
    try:
        current = path if path.is_dir() else path.parent
        limit = stop.resolve()
        while current.is_dir() and current.resolve() != limit:
            parent = current.parent
            try:
                current.rmdir()
            except OSError:
                return
            current = parent
    except OSError:
        return


def load_index() -> dict[str, Any]:
    return model_meta_db.load_thumb_index()


def write_index(data: dict[str, Any]) -> None:
    model_meta_db.replace_thumb_index(data)


def ident_index(kind: str, ident: str) -> dict[str, Any]:
    rows = load_index().get(kind)
    if not isinstance(rows, dict):
        return {}
    item = rows.get(ident)
    return item if isinstance(item, dict) else {}


def set_index(
    kind: str,
    ident: str,
    context: str,
    mtime: int,
    tags: list[Any],
    file: str = "",
    raw: str = "",
) -> None:
    data = load_index()
    rows = data.setdefault(kind, {})
    if not isinstance(rows, dict):
        rows = {}
        data[kind] = rows
    item = rows.setdefault(ident, {})
    if not isinstance(item, dict):
        item = {}
        rows[ident] = item
    item[context] = {
        "mtime": int(mtime or time.time()),
        "tags": [str(tag) for tag in tags if str(tag).strip()],
        "file": str(file or ""),
        "raw": str(raw or ""),
    }
    write_index(data)


def drop_context(kind: str, ident: str, context: str) -> None:
    data = load_index()
    rows = data.get(kind)
    if not isinstance(rows, dict):
        return
    changed = False
    for stored in list(rows):
        if stored != ident and _safe_ident(str(stored)) != ident:
            continue
        item = rows.get(stored)
        if not isinstance(item, dict) or context not in item:
            continue
        item.pop(context, None)
        changed = True
        if not item:
            rows.pop(stored, None)
    if not rows:
        data.pop(kind, None)
    if changed:
        write_index(data)


def drop_ident(kind: str, ident: str) -> None:
    data = load_index()
    rows = data.get(kind)
    if not isinstance(rows, dict) or ident not in rows:
        return
    rows.pop(ident, None)
    if not rows:
        data.pop(kind, None)
    write_index(data)


def _safe_ident(rel: str) -> str | None:
    ident = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if not ident or ".." in Path(ident).parts:
        return None
    return ident
