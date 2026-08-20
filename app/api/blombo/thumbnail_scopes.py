from __future__ import annotations

import json
import re
import secrets
from typing import Any

from blombo import db

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


def context_key(ids: list[str] | None) -> str:
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
        "required": [],
        "optional": [],
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
    db.execute("DELETE FROM thumb_scopes WHERE id = ?", (name,))


def query_for(ids: list[str] | None) -> dict[str, Any]:
    required: list[str] = []
    optional: list[str] = []
    exclude: list[str] = []
    groups: list[list[str]] = []
    priority = 0
    for ident in parse_context(context_key(ids)):
        row = get_scope(ident)
        if not row or row["id"] == GLOBAL_ID:
            continue
        required.extend(row["required"])
        optional.extend(row["optional"])
        exclude.extend(row["exclude"])
        groups.extend(row["anyGroups"])
        priority = max(priority, int(row.get("priority") or 0))
    return {
        "required": _unique(required),
        "optional": _unique(optional),
        "exclude": _unique(exclude),
        "anyGroups": groups,
        "priority": priority,
    }


def match_scope(row: dict[str, Any], tags: set[str]) -> bool:
    if row["id"] == GLOBAL_ID:
        return False
    if any(item in tags for item in row["exclude"]):
        return False
    if any(item not in tags for item in row["required"]):
        return False
    for group in row["anyGroups"]:
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
        keys = set(item["required"]) | {tag for group in item["anyGroups"] for tag in group}
        if keys and keys <= covered:
            continue
        chosen.append(item)
        covered.update(keys)
        if group:
            groups.add(group)
    if not chosen:
        return [GLOBAL_ID]
    return [item["id"] for item in chosen]


def rank_tags(query: dict[str, Any], source: list[str] | None) -> tuple[int, int, int] | None:
    tags = {normalize_tag(item) for item in source or [] if normalize_tag(item)}
    if any(item in tags for item in query.get("exclude") or []):
        return None
    required = list(query.get("required") or [])
    groups = list(query.get("anyGroups") or [])
    optional = list(query.get("optional") or [])
    if required and any(item not in tags for item in required):
        return None
    if any(not any(item in tags for item in group) for group in groups):
        return None
    if not required and not groups and optional and not any(item in tags for item in optional):
        return None
    opt = sum(1 for item in optional if item in tags)
    spec = len(required) + len(groups) + opt
    return (1 if required or groups or opt else 0, opt, spec)


def _specificity(row: dict[str, Any]) -> int:
    return len(row.get("required") or []) + len(row.get("anyGroups") or []) + len(row.get("optional") or [])


def _row(raw: dict[str, Any], ident: str) -> dict[str, Any]:
    try:
        priority = int(raw.get("priority") or 0)
    except (TypeError, ValueError):
        priority = 0
    return {
        "id": ident,
        "name": str(raw.get("name") or "").strip()[:80],
        "group": str(raw.get("group") or "").strip()[:40],
        "required": _unique(raw.get("required")),
        "optional": _unique(raw.get("optional")),
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
    rows = db.query(
        "SELECT id, name, group_name, required_json, optional_json, "
        "any_groups_json, exclude_json, priority FROM thumb_scopes ORDER BY rowid"
    )
    out: list[dict[str, Any]] = []
    for item in rows:
        out.append(
            _row(
                {
                    "name": item["name"],
                    "group": item["group_name"],
                    "required": _json_value(item["required_json"]),
                    "optional": _json_value(item["optional_json"]),
                    "anyGroups": _json_value(item["any_groups_json"]),
                    "exclude": _json_value(item["exclude_json"]),
                    "priority": item["priority"],
                },
                str(item["id"]),
            )
        )
    return out


def _ensure_db() -> None:
    db.connect()


def _store(row: dict[str, Any], replace: bool = False) -> None:
    _ensure_db()

    def write(conn) -> None:
        _write_scope(conn, row, replace)

    db.transaction(write)


def _write_scope(conn, row: dict[str, Any], replace: bool = False) -> None:
    values = (
        row["name"],
        row["group"],
        json.dumps(row["required"]),
        json.dumps(row["optional"]),
        json.dumps(row["anyGroups"]),
        json.dumps(row["exclude"]),
        row["priority"],
    )
    if replace:
        conn.execute(
            """
            UPDATE thumb_scopes
            SET name = ?, group_name = ?, required_json = ?, optional_json = ?,
                any_groups_json = ?, exclude_json = ?, priority = ?
            WHERE id = ?
            """,
            (*values, row["id"]),
        )
        return
    conn.execute(
        """
        INSERT INTO thumb_scopes (
            id, name, group_name, required_json, optional_json,
            any_groups_json, exclude_json, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (row["id"], *values),
    )


def _json_value(raw: Any) -> Any:
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
