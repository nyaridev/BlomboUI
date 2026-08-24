from __future__ import annotations

import csv
import re
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import prompt_tags as tags_repo

from features.settings import service as settings
from features.models.scripts import model_meta
from features.complete.scripts import autocomplete

LIMIT = 80
FREQUENT_LIMIT = 100

_WEIGHT = re.compile(r"^(.+):(-?\d+(?:\.\d+)?)$")
_LIKE_ESC = re.compile(r"([\\%_])")
_LORA = re.compile(r"^<lora:([^:>]+)(?::[^>]*)?>$", re.I)
_PAREN_ESC = re.compile(r"\\+([()])")

_lock = threading.RLock()
_files: dict[str, "_FileIndex"] = {}
_pending = False
_built = False
_thread: threading.Thread | None = None


class _FileIndex:
    __slots__ = ("name", "mtime", "size", "posts", "buckets")

    def __init__(self, name: str, mtime: float, size: int) -> None:
        self.name = name
        self.mtime = mtime
        self.size = size
        self.posts: dict[str, int] = {}
        self.buckets: dict[str, list[tuple[str, str, str | None]]] = {}


def schedule_rebuild() -> None:
    global _pending, _thread
    with _lock:
        _pending = True
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_rebuild_loop, daemon=True, name="tag-complete")
        _thread.start()


def _rebuild_loop() -> None:
    global _pending, _built
    while True:
        with _lock:
            if not _pending:
                _built = True
                return
            _pending = False
        _load_all()


def _load_all() -> None:
    root = autocomplete.csv_root()
    wanted: dict[str, tuple[float, int]] = {}
    for path in root.iterdir():
        if not path.is_file() or not autocomplete.NAME_RE.fullmatch(path.name):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        wanted[path.name] = (st.st_mtime, st.st_size)
    with _lock:
        for name in list(_files):
            if name not in wanted:
                del _files[name]
        skip = {
            name
            for name, (mtime, size) in wanted.items()
            if name in _files and _files[name].mtime == mtime and _files[name].size == size
        }
    for name, (mtime, size) in wanted.items():
        if name in skip:
            continue
        index = _parse_csv(root / name, mtime, size)
        if index is None:
            continue
        with _lock:
            _files[name] = index


def _parse_csv(path: Path, mtime: float, size: int) -> _FileIndex | None:
    index = _FileIndex(path.name, mtime, size)
    aliases: dict[str, list[str]] = {}
    try:
        with path.open(encoding="utf-8-sig", newline="") as fh:
            for row in csv.reader(fh):
                if len(row) < 3:
                    continue
                tag = row[0].strip()
                if not tag:
                    continue
                try:
                    posts = int(float(row[2]))
                except ValueError:
                    posts = 0
                prev = index.posts.get(tag)
                if prev is None or posts > prev:
                    index.posts[tag] = posts
                extra: list[str] = []
                if len(row) > 3 and row[3].strip():
                    extra = [part.strip() for part in row[3].split(",") if part.strip() and part.strip() != tag]
                if extra:
                    aliases[tag] = extra
    except OSError:
        return None
    buckets: dict[str, list[tuple[str, str, str | None, int]]] = {}
    for tag, posts in index.posts.items():
        key = _norm_key(tag)
        if key:
            buckets.setdefault(key[0], []).append((key, tag, None, posts))
        for alias in aliases.get(tag, ()):
            akey = _norm_key(alias)
            if akey:
                buckets.setdefault(akey[0], []).append((akey, tag, alias, posts))
    index.buckets = {
        letter: [(key, tag, alias) for key, tag, alias, _ in sorted(rows, key=lambda row: -row[3])]
        for letter, rows in buckets.items()
    }
    return index


def _norm_key(raw: str) -> str:
    text = raw.strip().lower().replace("_", " ")
    text = _PAREN_ESC.sub(r"\1", text)
    text = " ".join(text.split()).replace(" ", "_")
    return text.lstrip("([")


def _key_matches(key: str, prefix: str, compact: str) -> bool:
    return key.startswith(prefix) or (bool(compact) and key.replace("_", "").startswith(compact))


def _like_prefix(prefix: str) -> str:
    return _LIKE_ESC.sub(r"\\\1", prefix) + "%"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _unwrap(token: str) -> str:
    text = token.strip()
    while len(text) >= 2:
        if text[0] == "(" and text[-1] == ")":
            inner = text[1:-1].strip()
            match = _WEIGHT.fullmatch(inner)
            text = (match.group(1) if match else inner).strip()
            continue
        if text[0] == "[" and text[-1] == "]":
            text = text[1:-1].strip()
            continue
        break
    return text


def parse_tags(text: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in text.split(","):
        token = raw.strip()
        if not token:
            continue
        inner = _unwrap(token)
        if not inner:
            continue
        tag = _token_tag(inner)
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag)
    return out


def _token_tag(inner: str) -> str | None:
    text = inner.strip()
    lora = _LORA.fullmatch(text)
    if lora:
        name = lora.group(1).strip()
        return f"<lora:{name}>" if name else None
    if text.startswith("__") and text.endswith("__") and len(text) > 4:
        name = text[2:-2].replace("\\", "/").strip("/")
        return f"__{name}__" if name else None
    if "<lora:" in text.lower():
        return None
    tag = _norm_key(text)
    return tag or None


def star_threshold(unique: int | None = None) -> int:
    if unique is None:
        unique = tags_repo.tag_count()
    return 2 + max(0, unique) // 250


def record(prompt: str, negative: str, extra: list[str] | None = None) -> None:
    try:
        if settings.load().get("frequentTagsEnabled") is False:
            return
        _record(prompt, negative, extra or [])
    except (sqlite3.Error, OSError, ValueError):
        return


def _record(prompt: str, negative: str, extra: list[str]) -> None:
    state = tags_repo.get_state()
    if state and state[0] == prompt and state[1] == negative:
        return
    tags: list[str] = []
    seen: set[str] = set()
    for text in (prompt, negative, *extra):
        for tag in parse_tags(text):
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            tags.append(tag)
    now = _now()
    for tag in tags:
        tags_repo.bump_tag(tag, now)
    tags_repo.set_state(prompt, negative)


def _rule(lists: dict[str, Any], name: str) -> dict[str, Any]:
    raw = lists.get(name)
    if not isinstance(raw, dict):
        return {"enabled": True, "mode": "exclude", "types": []}
    mode = raw.get("mode")
    types = raw.get("types")
    return {
        "enabled": bool(raw["enabled"]) if "enabled" in raw else True,
        "mode": mode if mode in ("exclude", "include") else "exclude",
        "types": [str(item) for item in types] if isinstance(types, list) else [],
    }


def _applies(rule: dict[str, Any], model_types: list[str]) -> bool:
    if not rule["enabled"]:
        return False
    types = [str(item) for item in rule["types"]]
    if not model_types:
        return rule["mode"] == "exclude"
    if rule["mode"] == "exclude":
        return not any(item in types for item in model_types)
    return any(item in types for item in model_types)


def _applicable(checkpoint: str) -> list[_FileIndex]:
    model_types = model_meta.get_types("checkpoints", checkpoint) if checkpoint.strip() else []
    lists = settings.load().get("autocompleteLists") or {}
    if not isinstance(lists, dict):
        lists = {}
    with _lock:
        files = list(_files.values())
    return [index for index in files if _applies(_rule(lists, index.name), model_types)]


def _catalog_hits(files: list[_FileIndex], prefix: str) -> dict[str, tuple[int, str | None]]:
    compact = prefix.replace("_", "")
    first = prefix[0]
    out: dict[str, tuple[int, str | None]] = {}
    for index in files:
        seen: set[str] = set()
        for key, canonical, alias in index.buckets.get(first, ()):
            if not _key_matches(key, prefix, compact):
                continue
            posts = index.posts.get(canonical, 0)
            if canonical in seen:
                prev = out.get(canonical)
                if prev and alias and prev[1] is None:
                    out[canonical] = (prev[0], alias)
                continue
            seen.add(canonical)
            prev = out.get(canonical)
            if prev:
                out[canonical] = (prev[0] + posts, alias or prev[1])
            else:
                out[canonical] = (posts, alias)
    for tag, (posts, alias) in list(out.items()):
        if alias and _key_matches(_norm_key(tag), prefix, compact):
            out[tag] = (posts, None)
    return out


def _freq_hits(prefix: str) -> dict[str, int]:
    compact = prefix.replace("_", "")
    try:
        rows = tags_repo.search_tags(_like_prefix(prefix), _like_prefix(compact), LIMIT)
    except sqlite3.Error:
        return {}
    return {str(row["tag"]): int(row["count"]) for row in rows}


def _maybe_refresh() -> None:
    root = autocomplete.csv_root()
    with _lock:
        files = dict(_files)
    try:
        paths = list(root.iterdir())
    except OSError:
        return
    wanted: set[str] = set()
    for path in paths:
        if not path.is_file() or not autocomplete.NAME_RE.fullmatch(path.name):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        wanted.add(path.name)
        index = files.get(path.name)
        if index is None or index.mtime != st.st_mtime or index.size != st.st_size:
            schedule_rebuild()
            return
    if any(name not in wanted for name in files):
        schedule_rebuild()


def _global_applies(checkpoint: str, cfg: dict[str, Any]) -> bool:
    if cfg.get("autocompleteEnabled") is False:
        return False
    mode = cfg.get("autocompleteMode")
    types = cfg.get("autocompleteTypes")
    return _applies(
        {
            "enabled": True,
            "mode": mode if mode in ("exclude", "include") else "exclude",
            "types": [str(item) for item in types] if isinstance(types, list) else [],
        },
        model_meta.get_types("checkpoints", checkpoint) if checkpoint.strip() else [],
    )


def suggest(q: str, checkpoint: str) -> list[dict[str, Any]]:
    prefix = _norm_key(q)
    if len(prefix.replace("_", "")) < 1:
        return []
    cfg = settings.load()
    if not isinstance(cfg, dict):
        cfg = {}
    if not _global_applies(checkpoint, cfg):
        return []
    _maybe_refresh()
    catalog = _catalog_hits(_applicable(checkpoint), prefix)
    freq = _freq_hits(prefix) if cfg.get("frequentTagsEnabled") is not False else {}
    threshold = star_threshold()
    merged: dict[str, dict[str, Any]] = {}
    for tag, (posts, alias) in catalog.items():
        key = _norm_key(tag)
        merged[key] = {"tag": tag, "posts": posts, "count": 0, "alias": alias}
    for tag, count in freq.items():
        key = _norm_key(tag)
        if key in merged:
            merged[key]["count"] = count
        else:
            merged[key] = {"tag": tag, "posts": 0, "count": count, "alias": None}
    rows: list[dict[str, Any]] = []
    for item in merged.values():
        count = int(item["count"])
        row: dict[str, Any] = {
            "tag": item["tag"],
            "posts": int(item["posts"]),
            "count": count,
            "favorite": count >= threshold and count > 0,
        }
        if item["alias"]:
            row["alias"] = item["alias"]
        rows.append(row)
    rows.sort(
        key=lambda item: (
            0 if item["favorite"] else 1 if item["count"] else 2,
            -int(item["count"]),
            -int(item["posts"]),
            str(item["tag"]),
        )
    )
    return rows[:LIMIT]


def ready() -> bool:
    with _lock:
        return _built and not _pending


def frequent() -> dict[str, Any]:
    try:
        unique = tags_repo.tag_count()
        rows = tags_repo.top_tags(FREQUENT_LIMIT)
    except sqlite3.Error:
        return {"tags": [], "threshold": 2}
    threshold = star_threshold(unique)
    tags = [
        {
            "tag": str(row["tag"]),
            "count": int(row["count"]),
            "favorite": int(row["count"]) >= threshold,
        }
        for row in rows
    ]
    return {"tags": tags, "threshold": threshold}


def prefix_usage(prefix: str) -> dict[str, Any]:
    needle = prefix.strip()
    if not needle:
        return {"tags": []}
    try:
        if settings.load().get("frequentTagsEnabled") is False:
            return {"tags": []}
        rows = tags_repo.tags_like(_like_prefix(needle))
    except sqlite3.Error:
        return {"tags": []}
    threshold = star_threshold()
    tags = [
        {
            "tag": str(row["tag"]),
            "count": int(row["count"]),
            "favorite": int(row["count"]) >= threshold,
        }
        for row in rows
    ]
    return {"tags": tags}
