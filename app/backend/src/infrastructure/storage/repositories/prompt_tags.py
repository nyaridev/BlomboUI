from __future__ import annotations

from typing import Any

from infrastructure.storage import user


def tag_count() -> int:
    row = user.query_one("SELECT COUNT(*) AS n FROM prompt_tags")
    return int(row["n"]) if row else 0


def get_state() -> tuple[str, str] | None:
    row = user.query_one("SELECT prompt, negative FROM prompt_tag_state WHERE id = 1")
    if not row:
        return None
    return str(row["prompt"]), str(row["negative"])


def bump_tag(tag: str, now: str) -> None:
    user.execute(
        """
        INSERT INTO prompt_tags (tag, count, last_used) VALUES (?, 1, ?)
        ON CONFLICT(tag) DO UPDATE SET count = count + 1, last_used = excluded.last_used
        """,
        (tag, now),
    )


def set_state(prompt: str, negative: str) -> None:
    user.execute(
        """
        INSERT INTO prompt_tag_state (id, prompt, negative) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET prompt = excluded.prompt, negative = excluded.negative
        """,
        (prompt, negative),
    )


def top_tags(limit: int) -> list[Any]:
    return user.query(
        "SELECT tag, count FROM prompt_tags ORDER BY count DESC, tag ASC LIMIT ?",
        (limit,),
    )


def tags_like(pattern: str) -> list[Any]:
    return user.query(
        "SELECT tag, count FROM prompt_tags WHERE tag LIKE ? ESCAPE '\\'",
        (pattern,),
    )


def search_tags(prefix_like: str, compact_like: str, limit: int) -> list[Any]:
    return user.query(
        """
        SELECT tag, count FROM prompt_tags
        WHERE tag LIKE ? ESCAPE '\\'
           OR REPLACE(tag, '_', '') LIKE ? ESCAPE '\\'
        ORDER BY count DESC LIMIT ?
        """,
        (prefix_like, compact_like, limit),
    )
