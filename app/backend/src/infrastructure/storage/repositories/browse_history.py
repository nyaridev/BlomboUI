from __future__ import annotations

from typing import Any

from infrastructure.storage import user as db


def list_rows() -> list[Any]:
    return db.query("SELECT * FROM browse_history ORDER BY viewed_at DESC, id DESC")


def get_by_id(ident: int) -> Any | None:
    return db.query_one("SELECT * FROM browse_history WHERE id = ?", (ident,))


def get_by_model(model_id: int) -> Any | None:
    return db.query_one("SELECT * FROM browse_history WHERE model_id = ?", (model_id,))


def upsert(values: dict[str, Any]) -> int:
    now = int(values["viewed_at"])
    latest = db.query_one("SELECT MAX(viewed_at) AS n FROM browse_history")
    viewed_at = max(now, int(latest["n"] or 0) + 1) if latest else now
    existing = get_by_model(int(values["model_id"]))
    if existing:
        db.execute(
            """
            UPDATE browse_history SET
                name = ?, type = ?, creator = ?, image_url = ?, site = ?, search_text = ?, viewed_at = ?
            WHERE model_id = ?
            """,
            (
                str(values.get("name") or ""),
                str(values.get("type") or ""),
                str(values.get("creator") or ""),
                str(values.get("image_url") or ""),
                str(values.get("site") or ""),
                str(values.get("search_text") or ""),
                viewed_at,
                int(values["model_id"]),
            ),
        )
        return int(existing["id"])
    cur = db.execute(
        """
        INSERT INTO browse_history (
            model_id, name, type, creator, image_url, site, search_text, viewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            int(values["model_id"]),
            str(values.get("name") or ""),
            str(values.get("type") or ""),
            str(values.get("creator") or ""),
            str(values.get("image_url") or ""),
            str(values.get("site") or ""),
            str(values.get("search_text") or ""),
            viewed_at,
        ),
    )
    return int(cur.lastrowid)


def delete(ident: int) -> bool:
    cur = db.execute("DELETE FROM browse_history WHERE id = ?", (ident,))
    return bool(cur.rowcount)


def delete_all() -> int:
    cur = db.execute("DELETE FROM browse_history")
    return int(cur.rowcount or 0)


def ids_beyond(limit: int) -> list[int]:
    if limit < 0:
        return []
    rows = db.query(
        """
        SELECT id FROM browse_history
        ORDER BY viewed_at DESC, id DESC
        LIMIT -1 OFFSET ?
        """,
        (max(0, limit),),
    )
    return [int(row["id"]) for row in rows]
