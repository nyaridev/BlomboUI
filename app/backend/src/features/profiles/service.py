from __future__ import annotations

from typing import Any

from features.profiles.scripts import profiles as scripts

ProfileError = scripts.ProfileError


def list_profiles() -> dict[str, Any]:
    return scripts.list_profiles()


def create(display_name: str) -> dict[str, Any]:
    return scripts.create(display_name)


def rename(ident: str, display_name: str) -> dict[str, Any]:
    return scripts.rename(ident, display_name)


def delete(ident: str) -> None:
    scripts.delete(ident)


def restore(ident: str) -> dict[str, Any]:
    return scripts.restore(ident)


def purge(ident: str) -> None:
    scripts.purge(ident)


def purge_expired() -> None:
    scripts.purge_expired()


def activate(ident: str) -> dict[str, Any]:
    return scripts.activate(ident)


def current() -> dict[str, Any]:
    return scripts.current()
