from __future__ import annotations

from typing import Any

from infrastructure.storage import user as db


def list_rows() -> list[Any]:
    return db.query("SELECT * FROM user_galleries ORDER BY position ASC, id ASC")


def get_by_id(ident: str) -> Any | None:
    return db.query_one("SELECT * FROM user_galleries WHERE id = ?", (ident,))


def next_position(parent_id: str | None) -> int:
    if parent_id:
        row = db.query_one(
            "SELECT COALESCE(MAX(position), -1) AS n FROM user_galleries WHERE parent_id = ?",
            (parent_id,),
        )
    else:
        row = db.query_one(
            "SELECT COALESCE(MAX(position), -1) AS n FROM user_galleries WHERE parent_id IS NULL",
        )
    return int(row["n"] if row is not None else -1) + 1


def insert(values: dict[str, Any]) -> None:
    db.execute(
        """
        INSERT INTO user_galleries (
            id, name, query, scopes_json, models_json, loras_json, wildcards_json, created_at, kind, parent_id, position
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            values["id"],
            values["name"],
            values["query"],
            values["scopes_json"],
            values["models_json"],
            values["loras_json"],
            values["wildcards_json"],
            values["created_at"],
            values["kind"],
            values["parent_id"],
            values["position"],
        ),
    )


def update(ident: str, values: dict[str, Any]) -> bool:
    cur = db.execute(
        """
        UPDATE user_galleries SET name = ?, query = ?, scopes_json = ?, models_json = ?, loras_json = ?, wildcards_json = ?
        WHERE id = ?
        """,
        (
            values["name"],
            values["query"],
            values["scopes_json"],
            values["models_json"],
            values["loras_json"],
            values["wildcards_json"],
            ident,
        ),
    )
    return bool(cur.rowcount)


def delete(ident: str) -> bool:
    cur = db.execute("DELETE FROM user_galleries WHERE id = ?", (ident,))
    return bool(cur.rowcount)


def delete_ids(idents: list[str]) -> None:
    if not idents:
        return

    def run(conn: Any) -> None:
        conn.executemany("DELETE FROM user_galleries WHERE id = ?", [(item,) for item in idents])

    db.transaction(run)


def replace_order(parent_id: str | None, ids: list[str]) -> None:
    def run(conn: Any) -> None:
        for index, ident in enumerate(ids):
            conn.execute(
                "UPDATE user_galleries SET parent_id = ?, position = ? WHERE id = ?",
                (parent_id, index, ident),
            )

    db.transaction(run)
