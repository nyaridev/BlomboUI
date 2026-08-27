from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any

from infrastructure.storage.repositories import user_galleries as repo
from features.gallery.scripts import search as gallery_search

KINDS = ("library", "folder")


def list_libraries() -> list[dict[str, Any]]:
    rows = [_row(item, previews=False) for item in repo.list_rows()]
    by_parent: dict[str | None, list[dict[str, Any]]] = {}
    for item in rows:
        by_parent.setdefault(item["parent_id"], []).append(item)
    out: list[dict[str, Any]] = []
    for item in rows:
        packed = dict(item)
        if packed["kind"] == "folder":
            packed["previews"] = _folder_previews(packed["id"], by_parent)
        else:
            packed["previews"] = gallery_search.previews_for_library(packed)
        out.append(packed)
    return out


def get_library(ident: str) -> dict[str, Any] | None:
    row = repo.get_by_id(str(ident or "").strip())
    return _row(row) if row else None


def create_library(body: dict[str, Any]) -> dict[str, Any]:
    ident = secrets.token_hex(6)
    values = _values(body, ident, existing=None)
    if not values["name"]:
        raise ValueError("name is required")
    repo.insert(values)
    row = get_library(ident)
    return row or _row_from(values)


def update_library(ident: str, body: dict[str, Any]) -> dict[str, Any]:
    name = str(ident or "").strip()
    existing = repo.get_by_id(name)
    if not name or not existing:
        raise KeyError("gallery not found")
    values = _values(body, name, existing=existing)
    if not values["name"]:
        raise ValueError("name is required")
    repo.update(name, values)
    row = get_library(name)
    return row or _row_from(values)


def delete_library(ident: str) -> bool:
    name = str(ident or "").strip()
    row = repo.get_by_id(name) if name else None
    if not row:
        return False
    kids = _descendants(name)
    repo.delete_ids([item["id"] for item in kids] + [name])
    return True


def order_libraries(parent_id: Any, ids: Any) -> list[dict[str, Any]]:
    parent = _clean_parent(parent_id)
    if parent:
        folder = repo.get_by_id(parent)
        if not folder or str(folder["kind"] or "library") != "folder":
            raise ValueError("parent must be a folder")
    wanted = [str(item).strip() for item in ids or [] if str(item).strip()]
    if not wanted:
        raise ValueError("ids are required")
    seen: set[str] = set()
    ordered: list[str] = []
    for ident in wanted:
        if ident in seen:
            continue
        seen.add(ident)
        ordered.append(ident)
    for ident in ordered:
        row = repo.get_by_id(ident)
        if not row:
            raise KeyError("gallery not found")
        if parent and _is_descendant(parent, ident):
            raise ValueError("cannot move a folder into itself")
        if ident == parent:
            raise ValueError("cannot move a folder into itself")
    repo.replace_order(parent, ordered)
    return list_libraries()


def folder_unions(folder_id: str) -> list[dict[str, Any]] | None:
    ident = str(folder_id or "").strip()
    if not ident:
        return None
    row = repo.get_by_id(ident)
    if not row or str(row["kind"] or "library") != "folder":
        raise ValueError("folder not found")
    out: list[dict[str, Any]] = []
    for item in _descendants(ident):
        if str(item.get("kind") or "library") != "library":
            continue
        out.append(
            {
                "query": str(item.get("query") or ""),
                "scopes": item.get("scopes") if isinstance(item.get("scopes"), list) else [],
                "models": item.get("models") if isinstance(item.get("models"), list) else [],
                "loras": item.get("loras") if isinstance(item.get("loras"), list) else [],
                "wildcards": item.get("wildcards") if isinstance(item.get("wildcards"), list) else [],
            }
        )
    return out


def _descendants(ident: str) -> list[dict[str, Any]]:
    rows = [_row(item, previews=False) for item in repo.list_rows()]
    by_parent: dict[str | None, list[dict[str, Any]]] = {}
    for item in rows:
        by_parent.setdefault(item["parent_id"], []).append(item)
    out: list[dict[str, Any]] = []

    def walk(parent: str) -> None:
        for child in by_parent.get(parent, []):
            out.append(child)
            if child["kind"] == "folder":
                walk(child["id"])

    walk(ident)
    return out


def _is_descendant(maybe_child: str, ancestor: str) -> bool:
    return any(item["id"] == maybe_child for item in _descendants(ancestor))


def _folder_previews(ident: str, by_parent: dict[str | None, list[dict[str, Any]]]) -> list[dict[str, str]]:
    unions: list[dict[str, Any]] = []

    def walk(parent: str) -> None:
        for child in by_parent.get(parent, []):
            if child["kind"] == "library":
                unions.append(child)
            else:
                walk(child["id"])

    walk(ident)
    if not unions:
        return []
    return gallery_search.previews_for_library({"unions": unions})


def _clean_parent(raw: Any) -> str | None:
    ident = str(raw or "").strip()
    return ident or None


def _values(body: dict[str, Any], ident: str, existing: Any | None) -> dict[str, Any]:
    kind = str(body.get("kind") or "").strip()
    if kind not in KINDS:
        kind = str(existing["kind"] or "library") if existing and "kind" in existing.keys() else "library"
    if kind not in KINDS:
        kind = "library"
    if existing:
        parent_id = existing["parent_id"] if "parent_id" in existing.keys() else None
        position = int(existing["position"] or 0) if "position" in existing.keys() else 0
        created = str(existing["created_at"] or "")
    else:
        parent_id = _clean_parent(body.get("parent_id"))
        if parent_id:
            folder = repo.get_by_id(parent_id)
            if not folder or str(folder["kind"] or "library") != "folder":
                raise ValueError("parent must be a folder")
        position = repo.next_position(parent_id)
        created = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    query = "" if kind == "folder" else str(body.get("query") or "").strip()[:200]
    scopes = [] if kind == "folder" else _strings(body.get("scopes"))
    models = [] if kind == "folder" else _strings(body.get("models"))
    loras = [] if kind == "folder" else _strings(body.get("loras"))
    wildcards = [] if kind == "folder" else _strings(body.get("wildcards"))
    return {
        "id": ident,
        "name": str(body.get("name") or "").strip()[:80],
        "query": query,
        "scopes_json": json.dumps(scopes, ensure_ascii=False),
        "models_json": json.dumps(models, ensure_ascii=False),
        "loras_json": json.dumps(loras, ensure_ascii=False),
        "wildcards_json": json.dumps(wildcards, ensure_ascii=False),
        "created_at": created,
        "kind": kind,
        "parent_id": parent_id,
        "position": position,
    }


def _strings(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = str(item or "").strip()
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        out.append(name[:200])
    return out


def _json_strings(row: Any, key: str) -> list[str]:
    keys = row.keys() if hasattr(row, "keys") else []
    if key not in keys:
        return []
    try:
        value = json.loads(row[key] or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return value if isinstance(value, list) else []


def _row(row: Any, previews: bool = True) -> dict[str, Any]:
    scopes = _json_strings(row, "scopes_json")
    models = _json_strings(row, "models_json")
    loras = _json_strings(row, "loras_json")
    wildcards = _json_strings(row, "wildcards_json")
    keys = row.keys() if hasattr(row, "keys") else []
    kind = str(row["kind"] or "library") if "kind" in keys else "library"
    if kind not in KINDS:
        kind = "library"
    parent_raw = row["parent_id"] if "parent_id" in keys else None
    packed = {
        "id": str(row["id"]),
        "name": str(row["name"] or ""),
        "query": str(row["query"] or ""),
        "scopes": scopes,
        "models": models,
        "loras": loras,
        "wildcards": wildcards,
        "created_at": str(row["created_at"] or ""),
        "kind": kind,
        "parent_id": str(parent_raw) if parent_raw else None,
        "position": int(row["position"] or 0) if "position" in keys else 0,
        "previews": [],
    }
    if previews and kind == "library":
        packed["previews"] = gallery_search.previews_for_library(packed)
    return packed


def _row_from(values: dict[str, Any]) -> dict[str, Any]:
    return _row(
        {
            "id": values["id"],
            "name": values["name"],
            "query": values["query"],
            "scopes_json": values["scopes_json"],
            "models_json": values["models_json"],
            "loras_json": values["loras_json"],
            "wildcards_json": values["wildcards_json"],
            "created_at": values["created_at"],
            "kind": values["kind"],
            "parent_id": values["parent_id"],
            "position": values["position"],
        }
    )
