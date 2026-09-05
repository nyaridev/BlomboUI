from __future__ import annotations

import json
from typing import Any

from infrastructure.storage import user as db


def load_info(kind: str) -> dict[str, dict[str, Any]]:
    rows = db.query(
        """
        SELECT ident, types_json, modified, prompt, negative_prompt,
               notes, strength, slider, auto_apply, apply_at
        FROM model_info WHERE kind = ? ORDER BY rowid
        """,
        (kind,),
    )
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        try:
            types = json.loads(row["types_json"])
        except (TypeError, json.JSONDecodeError):
            types = []
        out[str(row["ident"])] = {
            "types": types if isinstance(types, list) else [],
            "modified": int(row["modified"] or 0),
            "prompt": str(row["prompt"] or ""),
            "negative_prompt": str(row["negative_prompt"] or ""),
            "notes": str(row["notes"] or ""),
            "strength": float(row["strength"] if row["strength"] is not None else 1.0),
            "slider": bool(row["slider"]),
            "auto_apply": None if row["auto_apply"] is None else bool(row["auto_apply"]),
            "apply_at": str(row["apply_at"]) if row["apply_at"] in {"start", "end"} else None,
        }
    return out


def replace_info(kind: str, data: dict[str, dict[str, Any]]) -> None:
    def write(conn) -> None:
        conn.execute("DELETE FROM model_info WHERE kind = ?", (kind,))
        for ident, row in data.items():
            conn.execute(
                """
                INSERT INTO model_info (
                    kind, ident, types_json, modified, prompt,
                    negative_prompt, notes, strength, slider, auto_apply, apply_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    kind,
                    str(ident),
                    json.dumps(row.get("types") if isinstance(row.get("types"), list) else []),
                    int(row.get("modified") or 0),
                    str(row.get("prompt") or ""),
                    str(row.get("negative_prompt") or ""),
                    str(row.get("notes") or ""),
                    float(row.get("strength") if row.get("strength") is not None else 1.0),
                    int(bool(row.get("slider"))),
                    None if row.get("auto_apply") is None else int(bool(row.get("auto_apply"))),
                    row.get("apply_at") if row.get("apply_at") in {"start", "end"} else None,
                ),
            )

    db.transaction(write)


def load_thumb_index() -> dict[str, dict[str, dict[str, dict[str, Any]]]]:
    out: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    for row in db.query(
        "SELECT kind, ident, context, mtime, tags_json, file, raw FROM thumbnail_index ORDER BY rowid"
    ):
        try:
            tags = json.loads(row["tags_json"])
        except (TypeError, json.JSONDecodeError):
            tags = []
        out.setdefault(str(row["kind"]), {}).setdefault(str(row["ident"]), {})[
            str(row["context"])
        ] = {
            "mtime": int(row["mtime"] or 0),
            "tags": tags if isinstance(tags, list) else [],
            "file": str(row["file"] or "") if "file" in row.keys() else "",
            "raw": str(row["raw"] or "") if "raw" in row.keys() else "",
        }
    return out


def replace_thumb_index(data: dict[str, Any]) -> None:
    def write(conn) -> None:
        conn.execute("DELETE FROM thumbnail_index")
        for kind, idents in data.items():
            if not isinstance(idents, dict):
                continue
            for ident, contexts in idents.items():
                if not isinstance(contexts, dict):
                    continue
                for context, row in contexts.items():
                    if not isinstance(row, dict):
                        continue
                    tags = row.get("tags") if isinstance(row.get("tags"), list) else []
                    conn.execute(
                        """
                        INSERT INTO thumbnail_index (kind, ident, context, mtime, tags_json, file, raw)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(kind),
                            str(ident),
                            str(context),
                            int(row.get("mtime") or 0),
                            json.dumps(tags),
                            str(row.get("file") or ""),
                            str(row.get("raw") or ""),
                        ),
                    )

    db.transaction(write)
