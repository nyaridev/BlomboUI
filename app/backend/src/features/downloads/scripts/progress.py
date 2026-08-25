from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.Lock()
_TLS = threading.local()
_ACTIVE: dict[str, dict[str, Any]] = {}


def start(key: str, info: dict[str, Any]) -> None:
    now = time.time()
    row = {
        "key": key,
        "modelId": int(info.get("modelId") or 0),
        "versionId": int(info.get("versionId") or 0),
        "fileId": info.get("fileId"),
        "name": str(info.get("name") or ""),
        "versionName": str(info.get("versionName") or ""),
        "kind": str(info.get("kind") or ""),
        "creator": str(info.get("creator") or ""),
        "fileName": str(info.get("fileName") or ""),
        "sizeBytes": max(0, int(info.get("sizeBytes") or 0)),
        "bytesDone": 0,
        "speedBps": 0.0,
        "startedAt": now,
        "imageUrl": str(info.get("imageUrl") or ""),
        "site": str(info.get("site") or ""),
        "baseModel": str(info.get("baseModel") or ""),
        "tags": list(info.get("tags") or []) if isinstance(info.get("tags"), list) else [],
        "trainedWords": list(info.get("trainedWords") or []) if isinstance(info.get("trainedWords"), list) else [],
        "description": str(info.get("description") or ""),
        "searchText": str(info.get("searchText") or ""),
        "historyId": info.get("historyId"),
    }
    with _LOCK:
        _ACTIVE[key] = row
    _TLS.key = key


def set_fields(key: str, **fields: Any) -> None:
    with _LOCK:
        row = _ACTIVE.get(key)
        if not row:
            return
        row.update(fields)


def bump(bytes_done: int, size_bytes: int = 0) -> None:
    key = getattr(_TLS, "key", None)
    if not key:
        return
    now = time.time()
    with _LOCK:
        row = _ACTIVE.get(key)
        if not row:
            return
        started = float(row.get("startedAt") or now)
        elapsed = max(0.001, now - started)
        row["bytesDone"] = max(0, int(bytes_done))
        expected = max(0, int(size_bytes or 0))
        if expected > int(row.get("sizeBytes") or 0):
            row["sizeBytes"] = expected
        row["speedBps"] = row["bytesDone"] / elapsed


def finish(key: str) -> None:
    with _LOCK:
        _ACTIVE.pop(key, None)
    if getattr(_TLS, "key", None) == key:
        _TLS.key = None


def list_active() -> list[dict[str, Any]]:
    with _LOCK:
        rows = [dict(row) for row in _ACTIVE.values()]
    rows.sort(key=lambda row: float(row.get("startedAt") or 0), reverse=True)
    return rows
