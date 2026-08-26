from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any

from infrastructure.storage.repositories import user_galleries as repo
from features.gallery.scripts import search as gallery_search


def list_libraries() -> list[dict[str, Any]]:
    return [_row(item) for item in repo.list_rows()]


def get_library(ident: str) -> dict[str, Any] | None:
    row = repo.get_by_id(str(ident or "").strip())
    return _row(row) if row else None


def create_library(body: dict[str, Any]) -> dict[str, Any]:
    ident = secrets.token_hex(6)
    values = _values(body, ident)
    if not values["name"]:
        raise ValueError("name is required")
    repo.insert(values)
    row = get_library(ident)
    return row or _row_from(values)


def update_library(ident: str, body: dict[str, Any]) -> dict[str, Any]:
    name = str(ident or "").strip()
    if not name or not repo.get_by_id(name):
        raise KeyError("gallery not found")
    values = _values(body, name)
    if not values["name"]:
        raise ValueError("name is required")
    repo.update(name, values)
    row = get_library(name)
    return row or _row_from(values)


def delete_library(ident: str) -> bool:
    name = str(ident or "").strip()
    return bool(name) and repo.delete(name)


def _values(body: dict[str, Any], ident: str) -> dict[str, Any]:
    return {
        "id": ident,
        "name": str(body.get("name") or "").strip()[:80],
        "query": str(body.get("query") or "").strip()[:200],
        "scopes_json": json.dumps(_strings(body.get("scopes")), ensure_ascii=False),
        "models_json": json.dumps(_strings(body.get("models")), ensure_ascii=False),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
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


def _row(row: Any) -> dict[str, Any]:
    try:
        scopes = json.loads(row["scopes_json"] or "[]")
    except (TypeError, json.JSONDecodeError):
        scopes = []
    try:
        models = json.loads(row["models_json"] or "[]")
    except (TypeError, json.JSONDecodeError):
        models = []
    return {
        "id": str(row["id"]),
        "name": str(row["name"] or ""),
        "query": str(row["query"] or ""),
        "scopes": scopes if isinstance(scopes, list) else [],
        "models": models if isinstance(models, list) else [],
        "created_at": str(row["created_at"] or ""),
        "previews": gallery_search.previews_for_library(
            {
                "query": str(row["query"] or ""),
                "scopes": scopes if isinstance(scopes, list) else [],
                "models": models if isinstance(models, list) else [],
            }
        ),
    }


def _row_from(values: dict[str, Any]) -> dict[str, Any]:
    return _row(
        {
            "id": values["id"],
            "name": values["name"],
            "query": values["query"],
            "scopes_json": values["scopes_json"],
            "models_json": values["models_json"],
            "created_at": values["created_at"],
        }
    )
