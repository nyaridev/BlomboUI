from __future__ import annotations

from typing import Any

from infrastructure.storage import user


def connect() -> None:
    user.connect()


def delete(ident: str) -> None:
    user.execute("DELETE FROM thumb_scopes WHERE id = ?", (ident,))


def list_rows() -> list[Any]:
    return user.query(
        "SELECT id, name, group_name, any_groups_json, exclude_json, priority "
        "FROM thumb_scopes ORDER BY rowid"
    )


def insert(
    ident: str,
    name: str,
    group: str,
    any_groups_json: str,
    exclude_json: str,
    priority: int,
) -> None:
    def write(conn) -> None:
        conn.execute(
            """
            INSERT INTO thumb_scopes (
                id, name, group_name, required_json, optional_json,
                any_groups_json, exclude_json, priority
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (ident, name, group, "[]", "[]", any_groups_json, exclude_json, priority),
        )

    user.transaction(write)


def update(
    ident: str,
    name: str,
    group: str,
    any_groups_json: str,
    exclude_json: str,
    priority: int,
) -> None:
    def write(conn) -> None:
        conn.execute(
            """
            UPDATE thumb_scopes
            SET name = ?, group_name = ?, required_json = ?, optional_json = ?,
                any_groups_json = ?, exclude_json = ?, priority = ?
            WHERE id = ?
            """,
            (name, group, "[]", "[]", any_groups_json, exclude_json, priority, ident),
        )

    user.transaction(write)
