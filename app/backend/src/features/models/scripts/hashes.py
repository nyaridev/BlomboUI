from __future__ import annotations

import hashlib
import struct
import threading
import time
from collections import deque
from pathlib import Path

from infrastructure.storage.repositories import hashes as hashes_repo
from shared import dirs
from config import models_root

_CHUNK = 1024 * 1024
_MAX_HEADER = 32 * 1024 * 1024
_V1_START = 0x100000
_V1_END = 0x110000

_lock = threading.Lock()
_cv = threading.Condition(_lock)
_queue: deque[Path] = deque()
_queued: set[str] = set()
_thread: threading.Thread | None = None
_stop = False


def start() -> None:
    global _thread, _stop
    with _cv:
        if _thread and _thread.is_alive():
            return
        _stop = False
        _thread = threading.Thread(target=_worker, name="model-hash", daemon=True)
        _thread.start()


def stop() -> None:
    global _stop
    with _cv:
        _stop = True
        _cv.notify_all()


def cached(path: Path) -> str | None:
    row = entry(path)
    return row["autov2"] if row else None


def entry(path: Path) -> dict[str, str] | None:
    try:
        stat = path.stat()
        key = str(path.resolve())
    except OSError:
        return None
    raw = _load().get(key)
    if not _complete(raw, stat):
        return None
    sha256 = str(raw["sha256"])
    return {
        "sha256": sha256,
        "autov1": str(raw.get("autov1") or ""),
        "autov2": str(raw.get("autov2") or sha256[:10]),
        "autov3": str(raw.get("autov3") or ""),
    }


def request(path: Path, urgent: bool = False) -> str | None:
    hit = cached(path)
    if hit:
        return hit
    _enqueue(path, urgent)
    return None


def wait(path: Path, timeout: float | None = None) -> str:
    hit = cached(path)
    if hit:
        return hit
    _enqueue(path, urgent=True)
    deadline = None if timeout is None else time.monotonic() + timeout
    with _cv:
        while True:
            hit = cached(path)
            if hit:
                return hit
            remaining = None
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return ""
            if not _cv.wait(timeout=remaining):
                return ""


def warm(paths: list[Path]) -> None:
    start()
    for path in paths:
        request(path, urgent=False)


def checkpoint_hashes(name: str) -> dict[str, str]:
    path = _find_checkpoint(name)
    if not path:
        return {}
    wait(path)
    return entry(path) or {}


def file_hash(path: Path) -> str:
    hit = cached(path)
    if hit:
        return hit
    stat = path.stat()
    key = str(path.resolve())
    fields = _digest(path)
    cache = _load()
    cache[key] = {"mtime": stat.st_mtime_ns, "size": stat.st_size, **fields}
    _save(cache)
    return fields["autov2"]


def _complete(raw: object, stat) -> bool:
    if not isinstance(raw, dict):
        return False
    if raw.get("mtime") != stat.st_mtime_ns or raw.get("size") != stat.st_size:
        return False
    sha256 = raw.get("sha256")
    if not isinstance(sha256, str) or len(sha256) < 64:
        return False
    if not isinstance(raw.get("autov1"), str):
        return False
    autov2 = raw.get("autov2")
    if not isinstance(autov2, str) or len(autov2) < 10:
        return False
    if not isinstance(raw.get("autov3"), str):
        return False
    return True


def _digest(path: Path) -> dict[str, str]:
    sha = hashlib.sha256()
    v1 = hashlib.sha256()
    v3 = hashlib.sha256()
    pos = 0
    header_end: int | None = None
    with path.open("rb") as handle:
        if path.suffix.lower() == ".safetensors":
            head = handle.read(8)
            if len(head) == 8:
                n = struct.unpack_from("<Q", head)[0]
                if 0 < n <= _MAX_HEADER:
                    header_end = 8 + n
            handle.seek(0)
        while True:
            chunk = handle.read(_CHUNK)
            if not chunk:
                break
            sha.update(chunk)
            end = pos + len(chunk)
            lo = max(pos, _V1_START)
            hi = min(end, _V1_END)
            if lo < hi:
                v1.update(chunk[lo - pos : hi - pos])
            if header_end is not None and end > header_end:
                v3.update(chunk[max(0, header_end - pos) :])
            pos += len(chunk)
    sha256 = sha.hexdigest()
    return {
        "sha256": sha256,
        "autov1": v1.hexdigest()[:8] if pos > _V1_START else "",
        "autov2": sha256[:10],
        "autov3": v3.hexdigest()[:12] if header_end is not None else "",
    }


def _enqueue(path: Path, urgent: bool) -> None:
    try:
        path = path.resolve()
    except OSError:
        return
    key = str(path)
    with _cv:
        if cached(path):
            return
        if key in _queued:
            if urgent:
                try:
                    _queue.remove(path)
                except ValueError:
                    pass
                _queue.appendleft(path)
            _cv.notify_all()
            return
        _queued.add(key)
        if urgent:
            _queue.appendleft(path)
        else:
            _queue.append(path)
        _cv.notify_all()


def _worker() -> None:
    while True:
        with _cv:
            while not _stop and not _queue:
                _cv.wait()
            if _stop:
                return
            path = _queue.popleft()
            _queued.discard(str(path))
        try:
            file_hash(path)
        except OSError:
            pass
        with _cv:
            _cv.notify_all()


def _find_checkpoint(name: str) -> Path | None:
    rel = str(name or "").replace("\\", "/").strip().lstrip("/")
    if not rel or rel in {".", ".."}:
        return None
    extras = dirs.extra_named("modelDirs")
    first, _, rest = rel.partition("/")
    extra = extras.get(first)
    if extra is not None and rest:
        path = extra / "checkpoints" / rest
        if path.is_file():
            return path
    roots = [models_root() / "checkpoints"]
    roots.extend(folder / "checkpoints" for folder in extras.values())
    for root in roots:
        direct = root / rel
        if direct.is_file():
            return direct
    base = Path(rel).name
    if not base or base in {".", ".."}:
        return None
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob(base):
            if path.is_file():
                return path
    return None


def _load() -> dict:
    return hashes_repo.load_all()


def _save(cache: dict) -> None:
    hashes_repo.replace_all(cache)
