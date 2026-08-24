from __future__ import annotations

from infrastructure.storage import user


def get_json() -> str | None:
    row = user.query_one("SELECT data_json FROM app_settings WHERE id = 1")
    return None if row is None else str(row["data_json"])


def put_json(data_json: str) -> None:
    user.execute(
        """
        INSERT INTO app_settings (id, data_json) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json
        """,
        (data_json,),
    )
