from __future__ import annotations

import json
import re
import secrets
from typing import Any

from infrastructure.storage.repositories import thumb_scopes as scopes_repo

GLOBAL_ID = "global"
GLOBAL_NAME = "Global"
_ID = re.compile(r"^[a-f0-9]{12}$")
_KEY = re.compile(r"^[a-f0-9]{12}(?:\+[a-f0-9]{12})*$")
_WEIGHT = re.compile(r"^\((.*?)(?::\s*[-+]?\d+(?:\.\d+)?)?\)$")
_BREAK = re.compile(r"[,.\n]+")


def normalize_tag(raw: str) -> str:
    text = str(raw or "").strip().lower().replace("_", " ")
    text = text.replace("\\(", "(").replace("\\)", ")")
    while True:
        match = _WEIGHT.match(text)
        if not match:
            break
        text = match.group(1).strip()
    return " ".join(text.split())


def parse_tags(raw: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for chunk in _BREAK.split(str(raw or "")):
        tag = normalize_tag(chunk)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        out.append(tag)
    return out


def ordered_ids(ids: list[str] | None) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for item in ids or []:
        name = str(item or "").strip().lower()
        if not name or name == GLOBAL_ID or name in seen:
            continue
        if not _ID.fullmatch(name):
            continue
        seen.add(name)
        unique.append(name)
    return unique


def context_key(ids: list[str] | None) -> str:
    unique = ordered_ids(ids)
    if not unique:
        return GLOBAL_ID
    unique.sort()
    return "+".join(unique)


def parse_context(key: str) -> list[str]:
    name = str(key or "").strip().lower()
    if not name or name == GLOBAL_ID:
        return [GLOBAL_ID]
    if not _KEY.fullmatch(name):
        return [GLOBAL_ID]
    return name.split("+")


def is_context_key(key: str) -> bool:
    name = str(key or "").strip().lower()
    return name == GLOBAL_ID or bool(_KEY.fullmatch(name))


def global_scope() -> dict[str, Any]:
    return {
        "id": GLOBAL_ID,
        "name": GLOBAL_NAME,
        "group": "",
        "anyGroups": [],
        "exclude": [],
        "priority": 0,
    }


def list_scopes() -> list[dict[str, Any]]:
    data = _load()
    return [global_scope(), *[dict(item) for item in data]]


def get_scope(ident: str) -> dict[str, Any] | None:
    name = str(ident or "").strip().lower()
    if name == GLOBAL_ID:
        return global_scope()
    for item in _load():
        if item["id"] == name:
            return dict(item)
    return None


def create_scope(raw: dict[str, Any]) -> dict[str, Any]:
    row = _row(raw, secrets.token_hex(6))
    if not row["name"]:
        raise ValueError("name is required")
    _store(row)
    return dict(row)


def ensure_scope(raw: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    ident = str(raw.get("id") or "").strip().lower()
    name = str(raw.get("name") or "").strip()
    group = str(raw.get("group") or "").strip().lower()
    if ident == GLOBAL_ID:
        return None, False
    if ident and _ID.fullmatch(ident):
        existing = get_scope(ident)
        if existing and existing["id"] != GLOBAL_ID:
            return existing, False
    rows = _load()
    if name:
        for item in rows:
            if item["name"].strip().lower() == name.lower() and str(item.get("group") or "").strip().lower() == group:
                return dict(item), False
        hits = [item for item in rows if item["name"].strip().lower() == name.lower()]
        if hits:
            return dict(hits[0]), False
    if name and ident and _ID.fullmatch(ident):
        row = _row(raw, ident)
        if row["name"]:
            _store(row)
            return dict(row), True
    if name:
        return create_scope(raw), True
    return None, False


def update_scope(ident: str, raw: dict[str, Any]) -> dict[str, Any]:
    name = str(ident or "").strip().lower()
    if name == GLOBAL_ID:
        raise ValueError("cannot edit Global")
    data = _load()
    for index, item in enumerate(data):
        if item["id"] != name:
            continue
        row = _row(raw, name)
        if not row["name"]:
            raise ValueError("name is required")
        data[index] = row
        _store(row, replace=True)
        return dict(row)
    raise ValueError("not found")


def delete_scope(ident: str) -> None:
    name = str(ident or "").strip().lower()
    if name == GLOBAL_ID:
        raise ValueError("cannot delete Global")
    data = _load()
    keep = [item for item in data if item["id"] != name]
    if len(keep) == len(data):
        raise ValueError("not found")
    scopes_repo.delete(name)


def query_for(ids: list[str] | None) -> dict[str, Any]:
    exclude: list[str] = []
    groups: list[list[str]] = []
    priority = 0
    for ident in parse_context(context_key(ids)):
        row = get_scope(ident)
        if not row or row["id"] == GLOBAL_ID:
            continue
        exclude.extend(row["exclude"])
        groups.extend(row["anyGroups"])
        priority = max(priority, int(row.get("priority") or 0))
    return {
        "exclude": _unique(exclude),
        "anyGroups": groups,
        "priority": priority,
    }


def match_scope(row: dict[str, Any], tags: set[str]) -> bool:
    if row["id"] == GLOBAL_ID:
        return False
    if any(item in tags for item in row["exclude"]):
        return False
    groups = list(row.get("anyGroups") or [])
    if not groups:
        return False
    for group in groups:
        if not any(item in tags for item in group):
            return False
    return True


def auto_ids(prompt: str) -> list[str]:
    tags = set(parse_tags(prompt))
    hits = [item for item in _load() if match_scope(item, tags)]
    hits.sort(key=lambda item: (-_specificity(item), -int(item.get("priority") or 0), item["name"].lower()))
    chosen: list[dict[str, Any]] = []
    groups: set[str] = set()
    covered: set[str] = set()
    for item in hits:
        group = str(item.get("group") or "").strip().lower()
        if group and group in groups:
            continue
        keys = {tag for group in item["anyGroups"] for tag in group}
        if keys and keys <= covered:
            continue
        chosen.append(item)
        covered.update(keys)
        if group:
            groups.add(group)
    if not chosen:
        return [GLOBAL_ID]
    return [item["id"] for item in chosen]


def rank_thumb(
    ids: list[str] | None,
    candidate: str,
    source: list[str] | None,
    optional: list[str] | None = None,
) -> tuple[int, int, int] | None:
    selected = [item for item in parse_context(context_key(ids)) if item != GLOBAL_ID]
    cand = [item for item in parse_context(candidate) if item != GLOBAL_ID]
    if not selected:
        return None
    tags = {normalize_tag(item) for item in source or [] if normalize_tag(item)}
    query = query_for(selected)
    if any(item in tags for item in query.get("exclude") or []):
        return None
    optional_ids = [item for item in parse_context(context_key(optional)) if item in selected]
    required_ids = [ident for ident in selected if ident not in optional_ids]
    if any(not _covers(ident, cand, tags) for ident in required_ids):
        return None
    if not required_ids and not any(_covers(ident, cand, tags) for ident in optional_ids):
        return None
    opt = sum(1 for ident in optional_ids if _covers(ident, cand, tags))
    overlap = sum(1 for ident in selected if ident in cand)
    extra = sum(1 for ident in cand if ident not in selected)
    return (opt, overlap, -extra)


def _covers(ident: str, cand: list[str], tags: set[str]) -> bool:
    if ident in cand:
        return True
    row = get_scope(ident)
    if not row or not row["anyGroups"]:
        return False
    return match_scope(row, tags)


def _specificity(row: dict[str, Any]) -> int:
    return len(row.get("anyGroups") or [])


def _row(raw: dict[str, Any], ident: str) -> dict[str, Any]:
    try:
        priority = int(raw.get("priority") or 0)
    except (TypeError, ValueError):
        priority = 0
    return {
        "id": ident,
        "name": str(raw.get("name") or "").strip()[:80],
        "group": str(raw.get("group") or "").strip()[:40],
        "anyGroups": _groups(raw.get("anyGroups")),
        "exclude": _unique(raw.get("exclude")),
        "priority": max(-1000, min(1000, priority)),
    }


def _unique(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        if isinstance(raw, str):
            return parse_tags(raw)
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if isinstance(item, list):
            continue
        tag = normalize_tag(str(item))
        if not tag or tag in seen:
            continue
        seen.add(tag)
        out.append(tag)
    return out[:80]


def _groups(raw: Any) -> list[list[str]]:
    if not isinstance(raw, list):
        return []
    out: list[list[str]] = []
    for item in raw:
        tags = _unique(item if isinstance(item, list) else [item])
        if tags:
            out.append(tags)
    return out[:40]


def _load() -> list[dict[str, Any]]:
    _ensure_db()
    rows = scopes_repo.list_rows()
    out: list[dict[str, Any]] = []
    for item in rows:
        out.append(
            _row(
                {
                    "name": item["name"],
                    "group": item["group_name"],
                    "anyGroups": _json_value(item["any_groups_json"]),
                    "exclude": _json_value(item["exclude_json"]),
                    "priority": item["priority"],
                },
                str(item["id"]),
            )
        )
    return out


def _ensure_db() -> None:
    scopes_repo.connect()


def _store(row: dict[str, Any], replace: bool = False) -> None:
    _ensure_db()
    payload = (
        row["id"],
        row["name"],
        row["group"],
        json.dumps(row["anyGroups"]),
        json.dumps(row["exclude"]),
        row["priority"],
    )
    if replace:
        scopes_repo.update(*payload)
        return
    scopes_repo.insert(*payload)


def _json_value(raw: Any) -> Any:
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
