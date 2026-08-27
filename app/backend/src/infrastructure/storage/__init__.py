from __future__ import annotations

from . import cache, cache_gallery, user


def connect() -> None:
    user.connect()
    cache.connect()
    cache_gallery.connect()
