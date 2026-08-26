from __future__ import annotations

import json
from typing import Any

from infrastructure.storage import user as db


def list_rows() -> list[Any]:
    return db.query("SELECT * FROM download_history ORDER BY created_at DESC, id DESC")


def get_by_id(ident: int) -> Any | None:
    return db.query_one("SELECT * FROM download_history WHERE id = ?", (ident,))


def insert(values: dict[str, Any]) -> int:
    cur = db.execute(
        """
        INSERT INTO download_history (
            source, model_id, version_id, file_id, name, version_name,
            kind, creator, file_name, size_bytes, base_model, tags_json,
            trained_words_json, description, search_text, paths_json, image_url, site,
            status, error, request_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(values.get("source") or ""),
            int(values["model_id"]),
            int(values["version_id"]),
            values.get("file_id"),
            str(values.get("name") or ""),
            str(values.get("version_name") or ""),
            str(values.get("kind") or ""),
            str(values.get("creator") or ""),
            str(values.get("file_name") or ""),
            max(0, int(values.get("size_bytes") or 0)),
            str(values.get("base_model") or ""),
            json.dumps(values.get("tags") if isinstance(values.get("tags"), list) else []),
            json.dumps(values.get("trained_words") if isinstance(values.get("trained_words"), list) else []),
            str(values.get("description") or ""),
            str(values.get("search_text") or ""),
            json.dumps(values.get("paths") if isinstance(values.get("paths"), list) else []),
            str(values.get("image_url") or ""),
            str(values.get("site") or ""),
            str(values.get("status") or "done"),
            str(values.get("error") or ""),
            json.dumps(values.get("request") if isinstance(values.get("request"), dict) else {}),
            int(values["created_at"]),
        ),
    )
    return int(cur.lastrowid)


def update(ident: int, values: dict[str, Any]) -> bool:
    cur = db.execute(
        """
        UPDATE download_history SET
            source = ?, model_id = ?, version_id = ?, file_id = ?, name = ?, version_name = ?,
            kind = ?, creator = ?, file_name = ?, size_bytes = ?, base_model = ?, tags_json = ?,
            trained_words_json = ?, description = ?, search_text = ?, paths_json = ?, image_url = ?,
            site = ?, status = ?, error = ?, request_json = ?, created_at = ?
        WHERE id = ?
        """,
        (
            str(values.get("source") or ""),
            int(values["model_id"]),
            int(values["version_id"]),
            values.get("file_id"),
            str(values.get("name") or ""),
            str(values.get("version_name") or ""),
            str(values.get("kind") or ""),
            str(values.get("creator") or ""),
            str(values.get("file_name") or ""),
            max(0, int(values.get("size_bytes") or 0)),
            str(values.get("base_model") or ""),
            json.dumps(values.get("tags") if isinstance(values.get("tags"), list) else []),
            json.dumps(values.get("trained_words") if isinstance(values.get("trained_words"), list) else []),
            str(values.get("description") or ""),
            str(values.get("search_text") or ""),
            json.dumps(values.get("paths") if isinstance(values.get("paths"), list) else []),
            str(values.get("image_url") or ""),
            str(values.get("site") or ""),
            str(values.get("status") or "done"),
            str(values.get("error") or ""),
            json.dumps(values.get("request") if isinstance(values.get("request"), dict) else {}),
            int(values["created_at"]),
            ident,
        ),
    )
    return bool(cur.rowcount)


def bump_retry(ident: int, created_at: int) -> bool:
    cur = db.execute(
        "UPDATE download_history SET error = '', created_at = ? WHERE id = ?",
        (created_at, ident),
    )
    return bool(cur.rowcount)


def delete(ident: int) -> bool:
    cur = db.execute("DELETE FROM download_history WHERE id = ?", (ident,))
    return bool(cur.rowcount)


def delete_all() -> int:
    cur = db.execute("DELETE FROM download_history")
    return int(cur.rowcount or 0)


def ids_beyond(limit: int) -> list[int]:
    if limit < 0:
        return []
    rows = db.query(
        """
        SELECT id FROM download_history
        WHERE status != 'downloading'
        ORDER BY created_at DESC, id DESC
        LIMIT -1 OFFSET ?
        """,
        (max(0, limit),),
    )
    return [int(row["id"]) for row in rows]
