from __future__ import annotations

from typing import Any

from infrastructure.storage import cache


def get(job_id: str) -> Any | None:
    return cache.query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))


def payload_json(job_id: str) -> str | None:
    row = cache.query_one("SELECT payload_json FROM jobs WHERE id = ?", (job_id,))
    return None if row is None else str(row["payload_json"])


def latest_completed() -> Any | None:
    return cache.query_one(
        "SELECT * FROM jobs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1"
    )


def insert_queued(job_id: str, payload_json: str, created_at: str) -> None:
    cache.execute(
        """
        INSERT INTO jobs (id, status, mode, payload_json, created_at)
        VALUES (?, 'queued', 'txt2img', ?, ?)
        """,
        (job_id, payload_json, created_at),
    )


def set_payload(job_id: str, payload_json: str) -> None:
    cache.execute("UPDATE jobs SET payload_json = ? WHERE id = ?", (payload_json, job_id))


def set_running(job_id: str, prompt_id: str, started_at: str) -> None:
    cache.execute(
        "UPDATE jobs SET status = 'running', comfy_prompt_id = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
        (prompt_id, started_at, job_id),
    )


def finish(job_id: str, status: str, finished_at: str, payload_json: str | None = None, error: str | None = None) -> None:
    if error is not None:
        cache.execute(
            "UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
            (status, error, finished_at, job_id),
        )
        return
    cache.execute(
        "UPDATE jobs SET status = ?, finished_at = ?, payload_json = ? WHERE id = ?",
        (status, finished_at, payload_json, job_id),
    )


def prune(keep_limit: int) -> None:
    rows = cache.query(
        "SELECT id FROM jobs WHERE status IN ('completed', 'failed', 'canceled') "
        "ORDER BY COALESCE(finished_at, created_at) DESC LIMIT ?",
        (keep_limit,),
    )
    keep = {str(row["id"]) for row in rows}
    if not keep:
        return
    marks = ",".join("?" for _ in keep)
    cache.execute(
        "DELETE FROM jobs WHERE status IN ('completed', 'failed', 'canceled') "
        f"AND id NOT IN ({marks})",
        tuple(keep),
    )
