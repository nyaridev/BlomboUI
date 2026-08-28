from __future__ import annotations

from typing import Any

from infrastructure.storage import cache_gallery as cache


def transaction(callback):
    return cache.transaction(callback)


def query(sql: str, params: tuple | list = ()) -> list[Any]:
    return cache.query(sql, params)


def query_one(sql: str, params: tuple | list = ()) -> Any | None:
    return cache.query_one(sql, params)


def get_by_id(ident: str) -> Any | None:
    return cache.query_one("SELECT * FROM gallery_items WHERE id = ?", (ident,))


def get_by_path(path: str) -> Any | None:
    return cache.query_one("SELECT * FROM gallery_items WHERE path = ?", (str(path),))


def fetch_by_path(conn: Any, path: str) -> Any | None:
    return conn.execute("SELECT * FROM gallery_items WHERE path = ?", (path,)).fetchone()


def list_items(where_sql: str, params: tuple | list) -> list[Any]:
    return cache.query(
        f"SELECT * FROM gallery_items WHERE {where_sql} ORDER BY created_at DESC, id DESC LIMIT ?",
        params,
    )


def latest_non_grid() -> Any | None:
    return cache.query_one(
        "SELECT * FROM gallery_items WHERE asset_kind != 'grid' AND asset_kind != 'temp' "
        "ORDER BY created_at DESC LIMIT 1"
    )


def upsert(conn: Any, values: dict[str, Any], existing: Any) -> None:
    if existing:
        conn.execute(
            """
            UPDATE gallery_items SET
                root = ?, asset_kind = ?, media_kind = ?, size = ?, mtime_ns = ?,
                width = ?, height = ?, seed = ?, checkpoint_name = ?,
                prompt = ?, negative_prompt = ?, params_json = ?, created_at = ?
            WHERE path = ?
            """,
            (
                values["root"],
                values["asset_kind"],
                values["media_kind"],
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
            id, path, root, asset_kind, media_kind, size, mtime_ns,
            width, height, seed, checkpoint_name, prompt,
            negative_prompt, params_json, created_at, favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        tuple(
            values[key]
            for key in (
                "id",
                "path",
                "root",
                "asset_kind",
                "media_kind",
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


def replace_links(conn: Any, item_id: str, links: dict[str, list[str]]) -> None:
    conn.execute("DELETE FROM gallery_item_tags WHERE item_id = ?", (item_id,))
    conn.execute("DELETE FROM gallery_item_loras WHERE item_id = ?", (item_id,))
    conn.execute("DELETE FROM gallery_item_wildcards WHERE item_id = ?", (item_id,))
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_tags (item_id, tag) VALUES (?, ?)",
        [(item_id, tag) for tag in links.get("tags") or []],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_loras (item_id, name) VALUES (?, ?)",
        [(item_id, name) for name in links.get("loras") or []],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_wildcards (item_id, name) VALUES (?, ?)",
        [(item_id, name) for name in links.get("wildcards") or []],
    )


def has_links(conn: Any, item_id: str) -> bool:
    for table in ("gallery_item_tags", "gallery_item_loras", "gallery_item_wildcards"):
        if conn.execute(f"SELECT 1 FROM {table} WHERE item_id = ? LIMIT 1", (item_id,)).fetchone():
            return True
    return False


def tags_for_items(item_ids: list[str]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {ident: set() for ident in item_ids}
    if not item_ids:
        return out
    marks = ",".join("?" for _ in item_ids)
    rows = cache.query(
        f"SELECT item_id, tag FROM gallery_item_tags WHERE item_id IN ({marks})",
        item_ids,
    )
    for row in rows:
        out.setdefault(str(row["item_id"]), set()).add(str(row["tag"]))
    return out


def delete_all(conn: Any) -> None:
    conn.execute("DELETE FROM gallery_item_tags")
    conn.execute("DELETE FROM gallery_item_loras")
    conn.execute("DELETE FROM gallery_item_wildcards")
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
    delete_all(conn)


def fetch_seen(conn: Any, path: str) -> Any | None:
    return conn.execute("SELECT path, size, mtime_ns, ok FROM gallery_seen WHERE path = ?", (path,)).fetchone()


def upsert_seen(conn: Any, path: str, size: int, mtime_ns: int, ok: bool) -> None:
    conn.execute(
        """
        INSERT INTO gallery_seen (path, size, mtime_ns, ok) VALUES (?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime_ns = excluded.mtime_ns, ok = excluded.ok
        """,
        (path, int(size), int(mtime_ns), 1 if ok else 0),
    )


def delete_stale_seen(conn: Any, disk: set[str]) -> None:
    if not disk:
        conn.execute("DELETE FROM gallery_seen")
        return
    marks = ",".join("?" for _ in disk)
    conn.execute(f"DELETE FROM gallery_seen WHERE path NOT IN ({marks})", tuple(disk))


def delete_paths(paths: list[str]) -> None:
    if not paths:
        return

    def write(conn: Any) -> None:
        for path in paths:
            conn.execute("DELETE FROM gallery_items WHERE path = ?", (path,))
            conn.execute("DELETE FROM gallery_seen WHERE path = ?", (path,))

    cache.transaction(write)
