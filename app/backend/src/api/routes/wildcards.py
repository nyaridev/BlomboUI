from __future__ import annotations

from fastapi import APIRouter

from api.errors import ApiError
from features.wildcards import service as wildcards
from features.wildcards.schemas import (
    WildcardCreateIn,
    WildcardFileIn,
    WildcardMoveIn,
    WildcardPathIn,
    WildcardRenameIn,
)

api = APIRouter()


@api.get("/user-wildcards/tree")
def get_wildcard_tree() -> dict:
    return wildcards.tree()


@api.get("/user-wildcards/file")
def get_wildcard_file(path: str) -> dict:
    try:
        return wildcards.read_file(path)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.put("/user-wildcards/file")
def put_wildcard_file(path: str, body: WildcardFileIn) -> dict:
    try:
        return wildcards.write_file(path, body.model_dump())
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/file")
def post_wildcard_file(body: WildcardCreateIn) -> dict:
    try:
        return wildcards.create_file(body.folder, body.name)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/folder")
def post_wildcard_folder(body: WildcardCreateIn) -> dict:
    try:
        return wildcards.create_folder(body.folder, body.name)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/open")
def open_wildcard_file(body: WildcardPathIn) -> dict:
    try:
        wildcards.reveal(body.path)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
    return {"ok": True}


@api.post("/user-wildcards/move")
def move_wildcard_file(body: WildcardMoveIn) -> dict:
    try:
        return wildcards.move_entry(body.path, body.folder)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/rename")
def rename_wildcard_file(body: WildcardRenameIn) -> dict:
    try:
        return wildcards.rename_entry(body.path, body.name)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc


@api.post("/user-wildcards/format")
def format_wildcard_file(body: WildcardFileIn) -> dict:
    try:
        return wildcards.format_editor(body.tree, body.text)
    except wildcards.WildcardError as exc:
        raise ApiError("not_found" if exc.status == 404 else "bad_request", str(exc), exc.status) from exc
