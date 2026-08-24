from __future__ import annotations

from . import cache, user


def connect() -> None:
    user.connect()
    cache.connect()
