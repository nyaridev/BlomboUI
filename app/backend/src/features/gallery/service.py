from __future__ import annotations

from features.gallery.scripts.gallery import (
    disk_image,
    disk_thumb,
    item_image,
    item_thumb,
    list_items,
    list_since,
    set_favorite,
)
from features.gallery.scripts.cache import ingest, start_sync, sync
from features.gallery.scripts.search import browse, home, search
from features.gallery.scripts.libraries import (
    create_library,
    delete_library,
    folder_unions,
    get_library,
    list_libraries,
    order_libraries,
    update_library,
)
from features.gallery.scripts.removed import (
    RemovedError,
    list_items as list_removed,
    purge_all,
    purge_expired,
    purge_permanent,
    remove_entry,
    remove_gallery_item,
    restore,
    reveal,
    thumb_file,
    thumb_meta,
)

__all__ = [
    "RemovedError",
    "browse",
    "create_library",
    "delete_library",
    "disk_image",
    "disk_thumb",
    "folder_unions",
    "get_library",
    "home",
    "ingest",
    "item_image",
    "item_thumb",
    "list_items",
    "list_libraries",
    "list_removed",
    "list_since",
    "order_libraries",
    "purge_all",
    "purge_expired",
    "purge_permanent",
    "remove_entry",
    "remove_gallery_item",
    "restore",
    "reveal",
    "search",
    "set_favorite",
    "start_sync",
    "sync",
    "thumb_file",
    "thumb_meta",
    "update_library",
]
