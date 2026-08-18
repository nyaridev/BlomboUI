from __future__ import annotations

import hashlib
import json
from pathlib import Path

from blombo.paths import RUNTIME, models_root

_CACHE = RUNTIME / "data" / "model-hashes.json"


def checkpoint_hash(name: str) -> str:
    path = _find_checkpoint(name)
    if not path:
        return ""
    stat = path.stat()
    key = str(path.resolve())
    cache = _load()
    entry = cache.get(key)
    if (
        isinstance(entry, dict)
        and entry.get("mtime") == stat.st_mtime_ns
        and entry.get("size") == stat.st_size
        and isinstance(entry.get("sha256"), str)
        and len(entry["sha256"]) >= 10
    ):
        return entry["sha256"][:10]
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    sha256 = digest.hexdigest()
    cache[key] = {"mtime": stat.st_mtime_ns, "size": stat.st_size, "sha256": sha256}
    _save(cache)
    return sha256[:10]


def _find_checkpoint(name: str) -> Path | None:
    rel = str(name or "").replace("\\", "/").strip().lstrip("/")
    if not rel or rel in {".", ".."}:
        return None
    root = models_root() / "checkpoints"
    direct = root / rel
    if direct.is_file():
        return direct
    base = Path(rel).name
    if not base or base in {".", ".."}:
        return None
    for path in root.rglob(base):
        if path.is_file():
            return path
    return None


def _load() -> dict:
    try:
        data = json.loads(_CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _save(cache: dict) -> None:
    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    _CACHE.write_text(json.dumps(cache), encoding="utf-8")
