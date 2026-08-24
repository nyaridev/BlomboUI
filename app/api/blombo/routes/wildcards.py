from __future__ import annotations

from fastapi import APIRouter

from blombo.wildcards import files as wildcard_files
from .common import (
    ApiError,
    WildcardCreateIn,
    WildcardFileIn,
    WildcardMoveIn,
    WildcardPathIn,
    WildcardRenameIn,
)

api = APIRouter()

@api.get("/user-wildcards/tree")
def get_wildcard_tree() -> dict:
    return wildcard_files.tree()


@api.get("/user-wildcards/file")
def get_wildcard_file(path: str) -> dict:
    try:
        return wildcard_files.read_file(path)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.put("/user-wildcards/file")
def put_wildcard_file(path: str, body: WildcardFileIn) -> dict:
    try:
        return wildcard_files.write_file(path, body.model_dump())
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/file")
def post_wildcard_file(body: WildcardCreateIn) -> dict:
    try:
        return wildcard_files.create_file(body.folder, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/folder")
def post_wildcard_folder(body: WildcardCreateIn) -> dict:
    try:
        return wildcard_files.create_folder(body.folder, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/open")
def open_wildcard_file(body: WildcardPathIn) -> dict:
    try:
        wildcard_files.reveal(body.path)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
    return {"ok": True}


@api.post("/user-wildcards/move")
def move_wildcard_file(body: WildcardMoveIn) -> dict:
    try:
        return wildcard_files.move_entry(body.path, body.folder)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/rename")
def rename_wildcard_file(body: WildcardRenameIn) -> dict:
    try:
        return wildcard_files.rename_entry(body.path, body.name)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/format")
def format_wildcard_file(body: WildcardFileIn) -> dict:
    try:
        return wildcard_files.format_editor(body.tree, body.text)
    except wildcard_files.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
