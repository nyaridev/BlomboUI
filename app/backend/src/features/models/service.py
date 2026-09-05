from __future__ import annotations

from features.models.scripts.hashes import start, stop, warm
from features.models.scripts.model_meta import delete_thumb, save_thumb, set_info, thumb_media, thumb_mtime
from features.models.scripts.model_thumbs import drop_scope, list_saved, resolved_file
from features.models.scripts.model_sidecar import restore_all
from features.models.scripts.manager_catalog import CatalogError as ManagerCatalogError
from features.models.scripts.manager_catalog import install as install_manager_model
from features.models.scripts.manager_catalog import list_models as list_manager_models
from features.models.scripts.model_files import (
    ModelFileError,
    create_folder,
    move_entry,
    rename_entry,
    reveal,
    tree,
)
from features.models.scripts.models import (
    ALL_KINDS,
    KINDS,
    hash_files,
    list_models,
    model_file,
    model_info,
    refresh_models,
)
from features.models.scripts.safetensors_meta import read as read_safetensors
from features.models.scripts.thumbnail_embed import read_file as read_thumb_meta
from features.models.scripts.thumbnail_scopes import (
    GLOBAL_ID,
    auto_ids,
    context_key,
    create_scope,
    delete_scope,
    list_scopes,
    parse_context,
    update_scope,
)

__all__ = [
    "ManagerCatalogError",
    "ModelFileError",
    "ALL_KINDS",
    "GLOBAL_ID",
    "KINDS",
    "auto_ids",
    "context_key",
    "create_folder",
    "create_scope",
    "delete_scope",
    "delete_thumb",
    "drop_scope",
    "hash_files",
    "install_manager_model",
    "list_manager_models",
    "list_models",
    "list_saved",
    "list_scopes",
    "model_file",
    "model_info",
    "move_entry",
    "rename_entry",
    "reveal",
    "parse_context",
    "read_safetensors",
    "read_thumb_meta",
    "refresh_models",
    "resolved_file",
    "restore_all",
    "save_thumb",
    "set_info",
    "start",
    "stop",
    "thumb_media",
    "thumb_mtime",
    "tree",
    "update_scope",
    "warm",
]
