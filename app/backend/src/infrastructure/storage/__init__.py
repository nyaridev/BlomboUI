from __future__ import annotations

from . import cache, cache_gallery, profiles, user


def connect() -> None:
    profiles.connect()
    user.connect()
    cache.connect()
    cache_gallery.connect()
