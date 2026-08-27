from __future__ import annotations

from typing import Any

from infrastructure.storage import user


def connect() -> None:
    user.connect()


def get_apply_json(workflow: str) -> str | None:
    row = user.query_one(
        "SELECT apply_json FROM workflow_template_state WHERE workflow = ?",
        (workflow,),
    )
    return None if row is None else str(row["apply_json"])


def list_rows(workflow: str) -> list[Any]:
    return user.query(
        "SELECT id, name, params_json, icon_json, apply_json, enabled FROM workflow_templates "
        "WHERE workflow = ? ORDER BY position",
        (workflow,),
    )


def replace_workflow(
    workflow: str,
    items: list[tuple[str, str, int, str, str | None, str | None, int]],
    apply_json: str | None,
) -> None:
    def write(conn) -> None:
        if apply_json is None:
            conn.execute("DELETE FROM workflow_template_state WHERE workflow = ?", (workflow,))
        else:
            conn.execute(
                "INSERT INTO workflow_template_state (workflow, apply_json) VALUES (?, ?) "
                "ON CONFLICT(workflow) DO UPDATE SET apply_json = excluded.apply_json",
                (workflow, apply_json),
            )
        conn.execute("DELETE FROM workflow_templates WHERE workflow = ?", (workflow,))
        conn.executemany(
            "INSERT INTO workflow_templates "
            "(workflow, id, name, position, params_json, icon_json, apply_json, enabled) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(workflow, *item) for item in items],
        )

    user.transaction(write)
