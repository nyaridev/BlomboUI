from __future__ import annotations

from typing import Any

from infrastructure.storage import cache_gallery as cache


def _search_text(prompt: object, negative: object, tags: list[str] | None) -> str:
    parts = [str(prompt or ""), str(negative or "")]
    parts.extend(str(tag) for tag in tags or [] if tag)
    return " ".join(part for part in parts if part)


def upsert_search(conn: Any, item_id: str, prompt: object, negative: object, tags: list[str] | None) -> None:
    try:
        conn.execute("DELETE FROM gallery_fts WHERE item_id = ?", (item_id,))
        conn.execute(
            "INSERT INTO gallery_fts(item_id, text) VALUES (?, ?)",
            (item_id, _search_text(prompt, negative, tags)),
        )
    except Exception:
        return


def rebuild_search(conn: Any) -> None:
    try:
        conn.execute("DELETE FROM gallery_fts")
    except Exception:
        return
    rows = conn.execute(
        """
        SELECT i.id AS id, i.prompt AS prompt, i.negative_prompt AS negative_prompt,
               GROUP_CONCAT(t.tag, ' ') AS tags
        FROM gallery_items i
        LEFT JOIN gallery_item_tags t ON t.item_id = i.id
        GROUP BY i.id
        """
    )
    payload = []
    for row in rows:
        tags = [part for part in str(row["tags"] or "").split() if part]
        payload.append((str(row["id"]), _search_text(row["prompt"], row["negative_prompt"], tags)))
    if payload:
        conn.executemany("INSERT INTO gallery_fts(item_id, text) VALUES (?, ?)", payload)


def purge_search(conn: Any) -> None:
    try:
        conn.execute("DELETE FROM gallery_fts WHERE item_id NOT IN (SELECT id FROM gallery_items)")
    except Exception:
        return


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


PUBLIC_SELECT = "id, created_at, media_kind, asset_kind, checkpoint_name, width, height, favorite"


def list_items(where_sql: str, params: tuple | list) -> list[Any]:
    return cache.query(
        f"SELECT {PUBLIC_SELECT} FROM gallery_items WHERE {where_sql} ORDER BY created_at DESC, id DESC LIMIT ?",
        params,
    )


def list_locations() -> list[Any]:
    return cache.query("SELECT id, path, root FROM gallery_items")


def latest_non_grid() -> Any | None:
    return cache.query_one(
        "SELECT * FROM gallery_items WHERE asset_kind != 'grid' AND asset_kind != 'temp' "
        "ORDER BY created_at DESC LIMIT 1"
    )


def set_favorite(ident: str, favorite: bool) -> Any | None:
    def write(conn: Any) -> Any | None:
        conn.execute(
            "UPDATE gallery_items SET favorite = ? WHERE id = ?",
            (1 if favorite else 0, ident),
        )
        return conn.execute("SELECT * FROM gallery_items WHERE id = ?", (ident,)).fetchone()

    return cache.transaction(write)


def rewrite_location(ident: str, old_path: str, new_path: str, new_root: str) -> bool:
    if not ident:
        return False
    if old_path == new_path:
        def touch(conn: Any) -> bool:
            conn.execute("UPDATE gallery_items SET root = ? WHERE id = ?", (new_root, ident))
            return True

        return bool(cache.transaction(touch))

    def write(conn: Any) -> bool:
        clash = conn.execute(
            "SELECT id FROM gallery_items WHERE path = ? AND id != ?",
            (new_path, ident),
        ).fetchone()
        if clash:
            return False
        conn.execute(
            "UPDATE gallery_items SET path = ?, root = ? WHERE id = ?",
            (new_path, new_root, ident),
        )
        conn.execute("DELETE FROM gallery_seen WHERE path = ?", (old_path,))
        return True

    return bool(cache.transaction(write))


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
    tags = list(links.get("tags") or [])
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_tags (item_id, tag) VALUES (?, ?)",
        [(item_id, tag) for tag in tags],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_loras (item_id, name) VALUES (?, ?)",
        [(item_id, name) for name in links.get("loras") or []],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO gallery_item_wildcards (item_id, name) VALUES (?, ?)",
        [(item_id, name) for name in links.get("wildcards") or []],
    )
    row = conn.execute(
        "SELECT prompt, negative_prompt FROM gallery_items WHERE id = ?",
        (item_id,),
    ).fetchone()
    prompt = row["prompt"] if row else ""
    negative = row["negative_prompt"] if row else ""
    upsert_search(conn, item_id, prompt, negative, tags)


def rename_checkpoint(conn: Any, aliases: list[str], name: str) -> None:
    if not aliases or not name:
        return
    marks = ",".join("?" for _ in aliases)
    conn.execute(
        f"UPDATE gallery_items SET checkpoint_name = ? WHERE checkpoint_name IN ({marks})",
        (name, *aliases),
    )


def rename_loras(conn: Any, aliases: list[str], name: str) -> None:
    if not aliases or not name:
        return
    marks = ",".join("?" for _ in aliases)
    conn.execute(
        f"""
        DELETE FROM gallery_item_loras
        WHERE name IN ({marks})
          AND item_id IN (SELECT item_id FROM (SELECT item_id FROM gallery_item_loras WHERE name = ?))
        """,
        (*aliases, name),
    )
    conn.execute(
        f"UPDATE gallery_item_loras SET name = ? WHERE name IN ({marks})",
        (name, *aliases),
    )


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
    try:
        conn.execute("DELETE FROM gallery_fts")
    except Exception:
        pass


def delete_stale(conn: Any, root_keys: list[str], seen: set[str]) -> None:
    marks = ",".join("?" for _ in root_keys)
    if seen:
        seen_marks = ",".join("?" for _ in seen)
        conn.execute(
            f"DELETE FROM gallery_items WHERE root NOT IN ({marks}) OR "
            f"(root IN ({marks}) AND path NOT IN ({seen_marks}))",
            (*root_keys, *root_keys, *seen),
        )
        purge_search(conn)
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
        purge_search(conn)

    cache.transaction(write)
