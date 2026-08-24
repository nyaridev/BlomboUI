from __future__ import annotations

from typing import Any

from infrastructure.storage import cache


def transaction(callback):
    return cache.transaction(callback)


def get_by_id(ident: str) -> Any | None:
    return cache.query_one("SELECT * FROM gallery_items WHERE id = ?", (ident,))


def get_by_path(path: str) -> Any | None:
    return cache.query_one("SELECT * FROM gallery_items WHERE path = ?", (str(path),))


def fetch_by_path(conn: Any, path: str) -> Any | None:
    return conn.execute("SELECT * FROM gallery_items WHERE path = ?", (path,)).fetchone()


def list_items(where_sql: str, params: tuple | list) -> list[Any]:
    return cache.query(
        f"SELECT * FROM gallery_items WHERE {where_sql} ORDER BY created_at DESC LIMIT ?",
        params,
    )


def latest_non_grid() -> Any | None:
    return cache.query_one(
        "SELECT * FROM gallery_items WHERE asset_kind != 'grid' "
        "ORDER BY created_at DESC LIMIT 1"
    )


def upsert(conn: Any, values: dict[str, Any], existing: Any) -> None:
    if existing:
        conn.execute(
            """
            UPDATE gallery_items SET
                root = ?, asset_kind = ?, size = ?, mtime_ns = ?,
                width = ?, height = ?, seed = ?, checkpoint_name = ?,
                prompt = ?, negative_prompt = ?, params_json = ?, created_at = ?
            WHERE path = ?
            """,
            (
                values["root"],
                values["asset_kind"],
                values["size"],
                values["mtime_ns"],
                values["width"],
                values["height"],
                values["seed"],
                values["checkpoint_name"],
                values["prompt"],
                values["negative_prompt"],
                values["params_json"],
                values["created_at"],
                values["path"],
            ),
        )
        return
    conn.execute(
        """
        INSERT OR IGNORE INTO gallery_items (
            id, path, root, asset_kind, size, mtime_ns,
            width, height, seed, checkpoint_name, prompt,
            negative_prompt, params_json, created_at, favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        tuple(
            values[key]
            for key in (
                "id",
                "path",
                "root",
                "asset_kind",
                "size",
                "mtime_ns",
                "width",
                "height",
                "seed",
                "checkpoint_name",
                "prompt",
                "negative_prompt",
                "params_json",
                "created_at",
            )
        ),
    )


def delete_all(conn: Any) -> None:
    conn.execute("DELETE FROM gallery_items")


def delete_stale(conn: Any, root_keys: list[str], seen: set[str]) -> None:
    marks = ",".join("?" for _ in root_keys)
    if seen:
        seen_marks = ",".join("?" for _ in seen)
        conn.execute(
            f"DELETE FROM gallery_items WHERE root NOT IN ({marks}) OR "
            f"(root IN ({marks}) AND path NOT IN ({seen_marks}))",
            (*root_keys, *root_keys, *seen),
        )
        return
    conn.execute("DELETE FROM gallery_items")
