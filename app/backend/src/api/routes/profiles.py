from __future__ import annotations

from fastapi import APIRouter

from api.errors import ApiError
from features.profiles import service as profiles
from features.profiles.schemas import ProfileCreateIn, ProfileRenameIn

api = APIRouter()


def _raise(exc: profiles.ProfileError) -> None:
    raise ApiError(exc.code, str(exc), exc.status) from exc


@api.get("/profiles")
def get_profiles() -> dict:
    return profiles.list_profiles()


@api.post("/profiles")
def post_profile(body: ProfileCreateIn) -> dict:
    try:
        return profiles.create(body.displayName)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise


@api.patch("/profiles/{ident}")
def patch_profile(ident: str, body: ProfileRenameIn) -> dict:
    try:
        return profiles.rename(ident, body.displayName)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise


@api.delete("/profiles/{ident}")
def delete_profile(ident: str) -> dict:
    try:
        profiles.delete(ident)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise
    return {"ok": True}


@api.post("/profiles/{ident}/restore")
def restore_profile(ident: str) -> dict:
    try:
        return profiles.restore(ident)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise


@api.delete("/profiles/{ident}/purge")
def purge_profile(ident: str) -> dict:
    try:
        profiles.purge(ident)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise
    return {"ok": True}


@api.post("/profiles/{ident}/activate")
def activate_profile(ident: str) -> dict:
    try:
        return profiles.activate(ident)
    except profiles.ProfileError as exc:
        _raise(exc)
        raise
