from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HASH_RE = re.compile(r"^[0-9a-fA-F]{8,64}$")
UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.I,
)
VERSION_URL = "https://civitai.com/api/v1/model-versions/by-hash/"
IMAGES_URL = "https://civitai.com/api/v1/images"
IMAGE_PREFIXES = ("https://image.civitai.com/", "https://image.civitai.red/")


def valid_hash(value: str) -> bool:
    return bool(HASH_RE.fullmatch(value))


def _get_json(url: str) -> Any:
    req = Request(
        url,
        headers={"User-Agent": "BlomboUI", "Accept": "application/json"},
        method="GET",
    )
    with urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def _image_key(url: str) -> str:
    found = UUID_RE.search(url)
    if found:
        return found.group(0).lower()
    path = url.split("?")[0].rstrip("/")
    name = path.rsplit("/", 1)[-1]
    stem = name.rsplit(".", 1)[0]
    return stem.lower() if stem else path.lower()


def _attach_image_meta(data: dict[str, Any]) -> None:
    vid = data.get("id")
    images = data.get("images")
    if not isinstance(vid, int) or not isinstance(images, list):
        return
    if not any(isinstance(img, dict) and img.get("url") and not img.get("meta") for img in images):
        return
    query: dict[str, str] = {
        "modelVersionId": str(vid),
        "withMeta": "true",
        "limit": "50",
        "nsfw": "true",
    }
    creator = data.get("model")
    if isinstance(creator, dict):
        user = creator.get("creator")
        if isinstance(user, dict) and user.get("username"):
            query["username"] = str(user["username"])
    try:
        payload = _get_json(IMAGES_URL + "?" + urlencode(query))
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError):
        return
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return
    by_key: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        meta = item.get("meta")
        url = item.get("url")
        if isinstance(meta, dict) and isinstance(url, str):
            by_key[_image_key(url)] = meta
    for img in images:
        if not isinstance(img, dict) or img.get("meta"):
            continue
        url = img.get("url")
        if isinstance(url, str):
            meta = by_key.get(_image_key(url))
            if meta:
                img["meta"] = meta


def by_hash(value: str) -> dict[str, Any] | None:
    if not valid_hash(value):
        return None
    try:
        data = _get_json(VERSION_URL + value)
    except HTTPError as exc:
        if exc.code == 404:
            return None
        return None
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    _attach_image_meta(data)
    return data


def fetch_image(url: str) -> tuple[bytes, str] | None:
    if not url.startswith(IMAGE_PREFIXES):
        return None
    req = Request(
        url,
        headers={"User-Agent": "BlomboUI", "Accept": "image/*"},
        method="GET",
    )
    try:
        with urlopen(req, timeout=20) as res:
            data = res.read()
            media = (res.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
    except (HTTPError, URLError, TimeoutError, OSError):
        return None
    if not data or not media.startswith("image/"):
        return None
    return data, media
