from __future__ import annotations

from typing import Any

from infrastructure.storage import cache


def load_all() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in cache.query(
        "SELECT path, mtime, size, sha256, autov1, autov2, autov3 FROM model_hashes"
    ):
        out[str(row["path"])] = {
            "mtime": int(row["mtime"]),
            "size": int(row["size"]),
            "sha256": str(row["sha256"]),
            "autov1": str(row["autov1"] or ""),
            "autov2": str(row["autov2"] or ""),
            "autov3": str(row["autov3"] or ""),
        }
    return out


def replace_all(data: dict[str, Any]) -> None:
    def write(conn) -> None:
        conn.execute("DELETE FROM model_hashes")
        for key, raw in data.items():
            if not isinstance(raw, dict):
                continue
            conn.execute(
                """
                INSERT INTO model_hashes (path, mtime, size, sha256, autov1, autov2, autov3)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(key),
                    int(raw.get("mtime") or 0),
                    int(raw.get("size") or 0),
                    str(raw.get("sha256") or ""),
                    str(raw.get("autov1") or ""),
                    str(raw.get("autov2") or ""),
                    str(raw.get("autov3") or ""),
                ),
            )

    cache.transaction(write)
