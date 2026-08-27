from __future__ import annotations

import random
from typing import Any

from features.gallery.scripts import cache as gallery_cache
from features.models.scripts import thumbnail_scopes
from features.settings import service as settings
from infrastructure.storage.repositories import gallery as gallery_repo

HOME_LIMIT = 24
HOME_SHELF = 12
TAG_LIMIT = 12
PAGE = 200
PAGE_MIN = 20
PAGE_MAX = 500
BROWSE_PREVIEW = 6
BROWSE_KINDS = {"checkpoints": "checkpoint", "loras": "lora", "wildcards": "wildcard"}


def _hide() -> bool:
    return bool(settings.load().get("galleryHideInterrupted", True))


def _base_where(hide_interrupted: bool, media: str) -> tuple[str, list[Any]]:
    clauses = ["asset_kind != 'grid'"]
    params: list[Any] = []
    if hide_interrupted:
        clauses.append("asset_kind != 'interrupted'")
    kind = str(media or "all").strip().lower()
    if kind in {"image", "video"}:
        clauses.append("media_kind = ?")
        params.append(kind)
    return " AND ".join(clauses), params


def _dim(raw: object) -> int | None:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _page_size(limit: int = 0) -> int:
    if limit:
        try:
            return max(1, min(PAGE_MAX, int(limit)))
        except (TypeError, ValueError):
            pass
    try:
        raw = int(settings.load().get("galleryPageSize") or PAGE)
    except (TypeError, ValueError):
        raw = PAGE
    return max(PAGE_MIN, min(PAGE_MAX, raw))


def _public(row: Any) -> dict[str, Any]:
    keys = row.keys() if hasattr(row, "keys") else ()
    return {
        "id": str(row["id"]),
        "created_at": str(row["created_at"]),
        "media_kind": str(row["media_kind"] or "image") if "media_kind" in keys else "image",
        "asset_kind": str(row["asset_kind"] or "image"),
        "checkpoint": str(row["checkpoint_name"] or ""),
        "width": _dim(row["width"] if "width" in keys else None),
        "height": _dim(row["height"] if "height" in keys else None),
    }


def _cursor_clause(cursor: str) -> tuple[str, list[Any]]:
    raw = str(cursor or "").strip()
    if not raw:
        return "", []
    stamp, _, ident = raw.partition("|")
    if not stamp or not ident:
        return "", []
    return "(created_at < ? OR (created_at = ? AND id < ?))", [stamp, stamp, ident]


def _next_cursor(rows: list[Any], limit: int) -> str:
    if len(rows) <= limit:
        return ""
    last = rows[limit - 1]
    return f"{last['created_at']}|{last['id']}"


def _scope_ids(scope_ids: list[str]) -> set[str] | None:
    wanted = [item for item in (str(item or "").strip().lower() for item in scope_ids) if item]
    scopes = []
    for ident in wanted:
        row = thumbnail_scopes.get_scope(ident)
        if row and row["id"] != thumbnail_scopes.GLOBAL_ID:
            scopes.append(row)
    if not scopes:
        return None
    rows = gallery_repo.query("SELECT item_id, tag FROM gallery_item_tags")
    grouped: dict[str, set[str]] = {}
    for row in rows:
        grouped.setdefault(str(row["item_id"]), set()).add(str(row["tag"]))
    hits: set[str] = set()
    for item_id, tags in grouped.items():
        if any(thumbnail_scopes.match_scope(scope, tags) for scope in scopes):
            hits.add(item_id)
    return hits


def _like(value: str) -> str:
    return f"%{value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')}%"


def _words(query: str) -> list[str]:
    return [part for part in query.replace(",", " ").split() if part]


def search(
    *,
    q: str = "",
    tags: list[str] | None = None,
    scopes: list[str] | None = None,
    models: list[str] | None = None,
    loras: list[str] | None = None,
    wildcards: list[str] | None = None,
    media: str = "all",
    cursor: str = "",
    limit: int = 0,
    order_random: bool = False,
) -> dict[str, Any]:
    cap = _page_size(limit)
    where, params = _base_where(_hide(), media)
    extra: list[str] = []

    query = str(q or "").strip()
    for word in _words(query.casefold()):
        extra.append(
            "(prompt LIKE ? ESCAPE '\\' OR negative_prompt LIKE ? ESCAPE '\\' OR id IN (SELECT item_id FROM gallery_item_tags WHERE tag LIKE ? ESCAPE '\\'))"
        )
        needle = _like(word)
        params.extend([needle, needle, needle])

    for tag in [thumbnail_scopes.normalize_tag(item) for item in tags or []]:
        if not tag:
            continue
        extra.append("id IN (SELECT item_id FROM gallery_item_tags WHERE tag = ?)")
        params.append(tag)

    names = [str(item).strip() for item in models or [] if str(item).strip()]
    if names:
        marks = ",".join("?" for _ in names)
        extra.append(f"checkpoint_name IN ({marks})")
        params.extend(names)

    for name in [str(item).strip() for item in loras or [] if str(item).strip()]:
        extra.append("id IN (SELECT item_id FROM gallery_item_loras WHERE name = ? OR name LIKE ? ESCAPE '\\')")
        params.extend([name, _like(name)])

    for name in [str(item).strip() for item in wildcards or [] if str(item).strip()]:
        extra.append("id IN (SELECT item_id FROM gallery_item_wildcards WHERE name = ? OR name LIKE ? ESCAPE '\\')")
        params.extend([name, _like(name)])

    hits = _scope_ids(list(scopes or []))
    if hits is not None:
        if not hits:
            return {"items": [], "cursor": ""}
        marks = ",".join("?" for _ in hits)
        extra.append(f"id IN ({marks})")
        params.extend(sorted(hits))

    if extra:
        where = f"{where} AND {' AND '.join(extra)}"
    if order_random:
        rows = gallery_repo.query(
            f"SELECT * FROM gallery_items WHERE {where} ORDER BY RANDOM() LIMIT ?",
            (*params, cap),
        )
        return {"items": [_public(row) for row in rows], "cursor": ""}
    clause, cursor_params = _cursor_clause(cursor)
    if clause:
        where = f"{where} AND {clause}"
        params.extend(cursor_params)
    rows = gallery_repo.list_items(where, (*params, cap + 1))
    next_cursor = _next_cursor(rows, cap)
    return {"items": [_public(row) for row in rows[:cap]], "cursor": next_cursor}


def home() -> dict[str, Any]:
    hide = _hide()
    where, params = _base_where(hide, "all")
    recent = gallery_repo.list_items(where, (*params, HOME_LIMIT))
    interrupted = "AND i.asset_kind != 'interrupted'" if hide else ""
    tags = gallery_repo.query(
        f"""
        SELECT t.tag AS tag, COUNT(*) AS n
        FROM gallery_item_tags t
        JOIN gallery_items i ON i.id = t.item_id
        WHERE i.asset_kind != 'grid' {interrupted}
        GROUP BY t.tag
        ORDER BY n DESC, t.tag ASC
        LIMIT ?
        """,
        (TAG_LIMIT,),
    )
    names = [str(row["tag"]) for row in tags]
    previews = _join_previews("gallery_item_tags", names, hide, "tag")
    return {
        "recent": [_public(row) for row in recent],
        "tags": [
            {
                "tag": str(row["tag"]),
                "count": int(row["n"]),
                "previews": previews.get(str(row["tag"]).casefold(), previews.get(str(row["tag"]), [])),
            }
            for row in tags
        ],
        "checkpoints": browse("checkpoints", "recent", "desc", HOME_SHELF)["items"],
        "loras": browse("loras", "recent", "desc", HOME_SHELF)["items"],
        "wildcards": browse("wildcards", "recent", "desc", HOME_SHELF)["items"],
    }


def previews_for_library(library: dict[str, Any]) -> list[dict[str, str]]:
    result = search(
        q=str(library.get("query") or ""),
        scopes=list(library.get("scopes") or []),
        models=list(library.get("models") or []),
        limit=BROWSE_PREVIEW,
        order_random=True,
    )
    return [{"id": item["id"], "media_kind": str(item.get("media_kind") or "image")} for item in result["items"]]


def browse(kind: str, sort: str = "recent", direction: str = "desc", limit: int = 0) -> dict[str, Any]:
    key = str(kind or "").strip().lower()
    if key not in BROWSE_KINDS:
        raise ValueError("unknown browse kind")
    hide = _hide()
    interrupted = "AND asset_kind != 'interrupted'" if hide else ""
    order = "DESC" if str(direction).lower() != "asc" else "ASC"
    by_works = str(sort).lower() == "works"
    cap = max(0, int(limit or 0))
    if key == "checkpoints":
        rows = gallery_repo.query(
            f"""
            SELECT checkpoint_name AS name, MAX(created_at) AS recent, COUNT(*) AS works
            FROM gallery_items
            WHERE asset_kind != 'grid' {interrupted} AND checkpoint_name != ''
            GROUP BY checkpoint_name
            ORDER BY {'works' if by_works else 'recent'} {order}, name COLLATE NOCASE
            """,
        )
        if cap:
            rows = rows[:cap]
        names = [str(row["name"]) for row in rows]
        previews = _previews_for("checkpoint_name", names, hide)
        return {"items": [_browse_item(row, previews) for row in rows]}
    table = "gallery_item_loras" if key == "loras" else "gallery_item_wildcards"
    rows = gallery_repo.query(
        f"""
        SELECT l.name AS name, MAX(i.created_at) AS recent, COUNT(*) AS works
        FROM {table} l
        JOIN gallery_items i ON i.id = l.item_id
        WHERE i.asset_kind != 'grid' {interrupted}
        GROUP BY l.name
        ORDER BY {'works' if by_works else 'recent'} {order}, name COLLATE NOCASE
        """,
    )
    if cap:
        rows = rows[:cap]
    names = [str(row["name"]) for row in rows]
    previews = _join_previews(table, names, hide)
    return {"items": [_browse_item(row, previews) for row in rows]}


def _browse_item(row: Any, previews: dict[str, list[dict[str, str]]]) -> dict[str, Any]:
    name = str(row["name"])
    return {
        "name": name,
        "recent": str(row["recent"] or ""),
        "works": int(row["works"] or 0),
        "previews": previews.get(name.casefold(), previews.get(name, [])),
    }


def _previews_for(column: str, names: list[str], hide: bool) -> dict[str, list[dict[str, str]]]:
    if not names:
        return {}
    interrupted = "AND asset_kind != 'interrupted'" if hide else ""
    marks = ",".join("?" for _ in names)
    rows = gallery_repo.query(
        f"""
        SELECT {column} AS name, id, media_kind, created_at
        FROM gallery_items
        WHERE asset_kind != 'grid' {interrupted} AND {column} IN ({marks})
        ORDER BY created_at DESC
        """,
        names,
    )
    return _take_previews(rows)


def _join_previews(table: str, names: list[str], hide: bool, column: str = "name") -> dict[str, list[dict[str, str]]]:
    if not names:
        return {}
    interrupted = "AND i.asset_kind != 'interrupted'" if hide else ""
    marks = ",".join("?" for _ in names)
    rows = gallery_repo.query(
        f"""
        SELECT l.{column} AS name, i.id AS id, i.media_kind AS media_kind, i.created_at AS created_at
        FROM {table} l
        JOIN gallery_items i ON i.id = l.item_id
        WHERE i.asset_kind != 'grid' {interrupted} AND l.{column} IN ({marks})
        ORDER BY i.created_at DESC
        """,
        names,
    )
    return _take_previews(rows)


def _take_previews(rows: list[Any]) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    names: dict[str, str] = {}
    for row in rows:
        name = str(row["name"])
        key = name.casefold()
        names[key] = name
        grouped.setdefault(key, []).append({"id": str(row["id"]), "media_kind": str(row["media_kind"] or "image")})
    out: dict[str, list[dict[str, str]]] = {}
    for key, items in grouped.items():
        picked = items if len(items) <= BROWSE_PREVIEW else random.sample(items, BROWSE_PREVIEW)
        out[key] = picked
        out[names[key]] = picked
    return out
