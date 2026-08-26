from __future__ import annotations

from typing import Any

from infrastructure.storage import user as db


def list_rows() -> list[Any]:
    return db.query("SELECT * FROM user_galleries ORDER BY created_at ASC, id ASC")


def get_by_id(ident: str) -> Any | None:
    return db.query_one("SELECT * FROM user_galleries WHERE id = ?", (ident,))


def insert(values: dict[str, Any]) -> None:
    db.execute(
        """
        INSERT INTO user_galleries (id, name, query, scopes_json, models_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            values["id"],
            values["name"],
            values["query"],
            values["scopes_json"],
            values["models_json"],
            values["created_at"],
        ),
    )


def update(ident: str, values: dict[str, Any]) -> bool:
    cur = db.execute(
        """
        UPDATE user_galleries SET name = ?, query = ?, scopes_json = ?, models_json = ?
        WHERE id = ?
        """,
        (
            values["name"],
            values["query"],
            values["scopes_json"],
            values["models_json"],
            ident,
        ),
    )
    return bool(cur.rowcount)


def delete(ident: str) -> bool:
    cur = db.execute("DELETE FROM user_galleries WHERE id = ?", (ident,))
    return bool(cur.rowcount)
