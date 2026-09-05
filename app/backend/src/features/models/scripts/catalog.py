from __future__ import annotations

import threading
from typing import Any

from infrastructure.storage.repositories import model_lists as lists_repo

_lock = threading.RLock()
_items: dict[str, list[dict[str, Any]]] = {}
_dirty: set[str] = set()
_hydrated = False


def _kinds() -> frozenset[str]:
    from features.models.scripts.models import ALL_KINDS

    return ALL_KINDS


def hydrate() -> None:
    global _hydrated
    with _lock:
        if _hydrated:
            return
        _hydrated = True
        try:
            stored = lists_repo.load_all()
        except Exception:
            stored = {}
        for kind, rows in stored.items():
            if kind in _kinds() and kind not in _items:
                _items[kind] = rows


def clear() -> None:
    global _hydrated
    with _lock:
        _items.clear()
        _dirty.clear()
        _hydrated = False


def peek(kind: str) -> list[dict[str, Any]] | None:
    with _lock:
        if kind in _dirty or kind not in _items:
            return None
        return list(_items[kind])


def snapshot() -> dict[str, list[dict[str, Any]]]:
    with _lock:
        return {kind: list(rows) for kind, rows in _items.items()}


def ready(kind: str) -> bool:
    with _lock:
        return kind in _items and kind not in _dirty


def invalidate(kind: str | None = None) -> None:
    with _lock:
        if kind:
            _dirty.add(kind)
            return
        _dirty.update(_kinds())


def set_kind(kind: str, items: list[dict[str, Any]]) -> None:
    rows = list(items)
    with _lock:
        _items[kind] = rows
        _dirty.discard(kind)
    lists_repo.replace_kind(kind, rows)


def relocate(kind: str, old: str, new: str) -> None:
    if not old or old == new:
        return
    with _lock:
        rows = _items.get(kind)
        if rows is None:
            _dirty.add(kind)
            return
        nxt: list[dict[str, Any]] = []
        for item in rows:
            path = map_ident(str(item.get("path") or ""), old, new)
            source = str(item.get("source") or "")
            mapped_source = map_ident(source, old, new) if source else source
            if path == item.get("path") and mapped_source == source:
                nxt.append(item)
                continue
            row = dict(item)
            row["path"] = path
            if source:
                row["source"] = mapped_source
            nxt.append(row)
        _items[kind] = nxt
        _dirty.discard(kind)
        stored = nxt
    lists_repo.replace_kind(kind, stored)


def drop(kind: str, ident: str) -> None:
    if not ident:
        return
    with _lock:
        rows = _items.get(kind)
        if rows is None:
            _dirty.add(kind)
            return
        nxt = [item for item in rows if not _covers(item, ident)]
        _items[kind] = nxt
        _dirty.discard(kind)
        stored = nxt
    lists_repo.replace_kind(kind, stored)


def map_ident(value: str, old: str, new: str) -> str:
    text = str(value or "")
    src = str(old or "")
    if not text or not src:
        return text
    if text == src:
        return new
    if text.startswith(f"{src}/") or text.startswith(f"{src}#"):
        return new + text[len(src) :]
    return text


def _covers(item: dict[str, Any], ident: str) -> bool:
    path = str(item.get("path") or "")
    source = str(item.get("source") or "")
    for value in (path, source):
        if not value:
            continue
        if value == ident or value.startswith(f"{ident}/") or value.startswith(f"{ident}#"):
            return True
    return False
