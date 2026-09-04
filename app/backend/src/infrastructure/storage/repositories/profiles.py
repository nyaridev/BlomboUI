from __future__ import annotations

from typing import Any

from infrastructure.storage import profiles as db


def list_rows() -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT id, display_name, created_at FROM profiles ORDER BY created_at ASC, id ASC"
    )
    return [
        {
            "id": str(row["id"]),
            "display_name": str(row["display_name"]),
            "created_at": int(row["created_at"]),
        }
        for row in rows
    ]


def get(ident: str) -> dict[str, Any] | None:
    row = db.query_one(
        "SELECT id, display_name, created_at FROM profiles WHERE id = ?",
        (ident,),
    )
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "display_name": str(row["display_name"]),
        "created_at": int(row["created_at"]),
    }


def active_id() -> str:
    row = db.query_one("SELECT active_id FROM profile_state WHERE id = 1")
    return str(row["active_id"]) if row is not None else "default"


def insert(ident: str, display_name: str, created_at: int) -> None:
    db.execute(
        "INSERT INTO profiles (id, display_name, created_at) VALUES (?, ?, ?)",
        (ident, display_name, created_at),
    )


def set_display_name(ident: str, display_name: str) -> None:
    db.execute(
        "UPDATE profiles SET display_name = ? WHERE id = ?",
        (display_name, ident),
    )


def set_active(ident: str) -> None:
    db.execute(
        "UPDATE profile_state SET active_id = ? WHERE id = 1",
        (ident,),
    )


def delete(ident: str) -> None:
    db.execute("DELETE FROM profiles WHERE id = ?", (ident,))


def list_removed() -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT id, display_name, created_at, removed_at FROM removed_profiles "
        "ORDER BY removed_at DESC, id ASC"
    )
    return [_removed_row(row) for row in rows]


def get_removed(ident: str) -> dict[str, Any] | None:
    row = db.query_one(
        "SELECT id, display_name, created_at, removed_at FROM removed_profiles WHERE id = ?",
        (ident,),
    )
    if row is None:
        return None
    return _removed_row(row)


def insert_removed(ident: str, display_name: str, created_at: int, removed_at: int) -> None:
    db.execute(
        "INSERT INTO removed_profiles (id, display_name, created_at, removed_at) VALUES (?, ?, ?, ?)",
        (ident, display_name, created_at, removed_at),
    )


def delete_removed(ident: str) -> None:
    db.execute("DELETE FROM removed_profiles WHERE id = ?", (ident,))


def move_to_removed(ident: str, removed_at: int) -> dict[str, Any] | None:
    def work(conn: Any) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT id, display_name, created_at FROM profiles WHERE id = ?",
            (ident,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "INSERT INTO removed_profiles (id, display_name, created_at, removed_at) VALUES (?, ?, ?, ?)",
            (str(row["id"]), str(row["display_name"]), int(row["created_at"]), removed_at),
        )
        conn.execute("DELETE FROM profiles WHERE id = ?", (ident,))
        return {
            "id": str(row["id"]),
            "display_name": str(row["display_name"]),
            "created_at": int(row["created_at"]),
            "removed_at": removed_at,
        }

    return db.transaction(work)


def restore_from_removed(ident: str) -> dict[str, Any] | None:
    def work(conn: Any) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT id, display_name, created_at FROM removed_profiles WHERE id = ?",
            (ident,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "INSERT INTO profiles (id, display_name, created_at) VALUES (?, ?, ?)",
            (str(row["id"]), str(row["display_name"]), int(row["created_at"])),
        )
        conn.execute("DELETE FROM removed_profiles WHERE id = ?", (ident,))
        return {
            "id": str(row["id"]),
            "display_name": str(row["display_name"]),
            "created_at": int(row["created_at"]),
        }

    return db.transaction(work)


def _removed_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "display_name": str(row["display_name"]),
        "created_at": int(row["created_at"]),
        "removed_at": int(row["removed_at"]),
    }


def display_name_taken(name: str, skip_id: str | None = None) -> bool:
    want = name.casefold()
    for row in list_rows():
        if skip_id and row["id"] == skip_id:
            continue
        if str(row["display_name"]).casefold() == want:
            return True
    return False
