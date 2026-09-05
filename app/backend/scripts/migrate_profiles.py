"""One-shot move of pre-profile data into the Default profile folders.

Not imported by the running app. From app/backend:

    PYTHONPATH=src python scripts/migrate_profiles.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
ROOT = APP.parent
USER = ROOT / "user"
RUNTIME = ROOT / "runtime"
DATA = USER / "data"
DEFAULT = "default"


def migrate(root: Path | None = None) -> str:
    user = (root / "user") if root is not None else USER
    runtime = (root / "runtime") if root is not None else RUNTIME
    data = user / "data"
    registry = data / "sqlite" / "profile.sqlite"
    if registry.is_file():
        return "skip: profile.sqlite already exists"

    _move_file(data / "sqlite" / "blombo.sqlite", data / "sqlite" / DEFAULT / "blombo.sqlite")
    _move_file(runtime / "data" / "sqlite" / "cache.sqlite", runtime / "data" / "sqlite" / DEFAULT / "cache.sqlite")
    _move_file(
        runtime / "data" / "sqlite" / "cache_gallery.sqlite",
        runtime / "data" / "sqlite" / DEFAULT / "cache_gallery.sqlite",
    )
    old_gallery = user / "gallery_thumbs"
    if old_gallery.is_dir():
        dest = runtime / "data" / "gallery_thumbs" / DEFAULT
        nested = old_gallery / DEFAULT
        if nested.is_dir():
            _move_tree_contents(nested, dest)
            _rmtree(nested)
        _move_tree_contents(old_gallery, dest)
        _rmtree(old_gallery)
    old_models = user / "model_thumbs"
    if old_models.is_dir():
        _move_tree_contents(old_models, old_models / DEFAULT)
    old_history = data / "history"
    if old_history.is_dir():
        dest = data / "history_thumbs" / DEFAULT
        nested = old_history / DEFAULT
        if nested.is_dir():
            _move_dir(nested / "download", dest / "download")
            _move_dir(nested / "browse", dest / "browse")
            _rmtree(nested)
        _move_dir(old_history / "download", dest / "download")
        _move_dir(old_history / "browse", dest / "browse")
        _rmtree(old_history)
    _move_tree_contents(user / "removed", user / "removed" / DEFAULT)
    custom_output = _custom_output(runtime)
    if custom_output is None:
        _move_tree_contents(user / "output", user / "output" / DEFAULT)
        _rewrite_gallery_paths(
            runtime / "data" / "sqlite" / DEFAULT / "cache_gallery.sqlite",
            user / "output",
            user / "output" / DEFAULT,
        )
    else:
        _write_output_override(data / "sqlite" / DEFAULT / "blombo.sqlite", custom_output)

    _write_registry(registry)
    return "ok"


def _move_file(src: Path, dest: Path) -> None:
    for suffix in ("", "-wal", "-shm"):
        source = Path(str(src) + suffix)
        target = Path(str(dest) + suffix)
        if not source.is_file():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            target.unlink()
        source.replace(target)


def _move_dir(src: Path, dest: Path) -> None:
    if not src.is_dir() or src.resolve() == dest.resolve():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        _merge_tree(src, dest)
        _rmtree(src)
        return
    src.replace(dest)


def _move_tree_contents(src: Path, dest: Path) -> None:
    if not src.is_dir():
        dest.mkdir(parents=True, exist_ok=True)
        return
    dest.mkdir(parents=True, exist_ok=True)
    skip = dest.name
    for path in list(src.iterdir()):
        if path.name == skip:
            continue
        target = dest / path.name
        if path.is_dir():
            _merge_tree(path, target)
            _rmtree(path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                path.unlink()
                continue
            path.replace(target)


def _merge_tree(src: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for path in src.iterdir():
        target = dest / path.name
        if path.is_dir():
            _merge_tree(path, target)
        elif not target.exists():
            path.replace(target)


def _rmtree(path: Path) -> None:
    if not path.is_dir():
        return
    for child in path.iterdir():
        if child.is_dir():
            _rmtree(child)
        else:
            child.unlink(missing_ok=True)
    try:
        path.rmdir()
    except OSError:
        pass


def _custom_output(runtime: Path) -> str | None:
    env_path = runtime / "data" / "launcher-env.json"
    if not env_path.is_file():
        return None
    try:
        data = json.loads(env_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    raw = str(data.get("outputs.root") or "").strip()
    if not raw:
        return None
    folder = Path(raw)
    parts = [part.lower() for part in folder.parts]
    if len(parts) >= 2 and parts[-1] == "output" and parts[-2] == "user":
        return None
    if len(parts) >= 3 and parts[-1] == "default" and parts[-2] == "output" and parts[-3] == "user":
        return None
    return str(folder)


def _rebase_output(value: str, old_output: Path, new_output: Path) -> str:
    text = str(value)
    olds = [str(old_output), str(old_output.resolve())]
    for old in olds:
        if text == old or text.startswith(old + os.sep) or text.startswith(old + "/"):
            rest = text[len(old) :].lstrip("\\/")
            first = rest.replace("\\", "/").split("/", 1)[0] if rest else ""
            if first.lower() == new_output.name.lower():
                return value
            return str(new_output / rest) if rest else str(new_output)
    return value


def _rewrite_gallery_paths(db_path: Path, old_output: Path, new_output: Path) -> None:
    if not db_path.is_file():
        return
    conn = sqlite3.connect(db_path)
    try:
        tables = {
            str(row[0]) for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        if "gallery_items" not in tables:
            return
        rows = conn.execute("SELECT id, path, root FROM gallery_items").fetchall()
        for ident, path, root in rows:
            next_path = _rebase_output(str(path), old_output, new_output)
            next_root = _rebase_output(str(root), old_output, new_output)
            if next_path != path or next_root != root:
                conn.execute(
                    "UPDATE gallery_items SET path = ?, root = ? WHERE id = ?",
                    (next_path, next_root, ident),
                )
        if "gallery_seen" in tables:
            for (path,) in conn.execute("SELECT path FROM gallery_seen").fetchall():
                next_path = _rebase_output(str(path), old_output, new_output)
                if next_path == path:
                    continue
                conn.execute("DELETE FROM gallery_seen WHERE path = ?", (next_path,))
                conn.execute("UPDATE gallery_seen SET path = ? WHERE path = ?", (next_path, path))
        conn.commit()
    except sqlite3.DatabaseError:
        return
    finally:
        conn.close()


def _write_output_override(db_path: Path, path: str) -> None:
    if not db_path.is_file():
        return
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute("SELECT data_json FROM app_settings WHERE id = 1").fetchone()
        data: dict = {}
        if row:
            try:
                parsed = json.loads(row[0])
            except (TypeError, json.JSONDecodeError):
                parsed = {}
            if isinstance(parsed, dict):
                data = parsed
        data["outputRoot"] = path
        conn.execute(
            "INSERT INTO app_settings (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json",
            (json.dumps(data, indent=2) + "\n",),
        )
        conn.commit()
    finally:
        conn.close()


def _write_registry(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS profile_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_id TEXT NOT NULL REFERENCES profiles(id)
            );
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO profiles (id, display_name, created_at) VALUES (?, ?, ?)",
            (DEFAULT, "Default", int(time.time())),
        )
        conn.execute(
            "INSERT OR IGNORE INTO profile_state (id, active_id) VALUES (1, ?)",
            (DEFAULT,),
        )
        conn.commit()
    finally:
        conn.close()


def main() -> int:
    print(migrate())
    return 0


if __name__ == "__main__":
    sys.exit(main())
