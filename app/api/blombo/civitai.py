from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from blombo import settings

HASH_RE = re.compile(r"^[0-9a-fA-F]{8,64}$")
UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.I,
)
VERSION_URL = "https://civitai.com/api/v1/model-versions/by-hash/"
IMAGES_URL = "https://civitai.com/api/v1/images"
MODELS_URL = "https://civitai.com/api/v1/models"
IMAGE_PREFIXES = ("https://image.civitai.com/", "https://image.civitai.red/")


class CivitaiRequestError(RuntimeError):
    pass


def valid_hash(value: str) -> bool:
    return bool(HASH_RE.fullmatch(value))


def _get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    request_headers = {"User-Agent": "BlomboUI", "Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    req = Request(
        url,
        headers=request_headers,
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


def list_models(
    query: str = "",
    types: list[str] | None = None,
    base_models: list[str] | None = None,
    sort: str = "Newest",
    period: str = "AllTime",
    page: int = 1,
    limit: int = 20,
    cursor: str = "",
    early_access: bool | None = None,
    supports_generation: bool | None = None,
    from_platform: bool | None = None,
    nsfw: bool = True,
    tag: str = "",
) -> dict[str, Any]:
    key = str(settings.load().get("civitaiApiKey") or "").strip()
    if not key:
        raise CivitaiRequestError("Set a CivitAI API key in Settings first.")
    params: dict[str, str | list[str]] = {
        "query": query.strip(),
        "sort": sort,
        "period": period,
        "limit": str(max(1, min(100, limit))),
        "nsfw": "true" if nsfw else "false",
    }
    if cursor:
        params["cursor"] = cursor
    elif not query.strip():
        params["page"] = str(max(1, page))
    clean_types = [str(item).strip() for item in (types or []) if str(item).strip()]
    if clean_types:
        params["types"] = clean_types
    clean_base_models = [str(item).strip() for item in (base_models or []) if str(item).strip()]
    if clean_base_models:
        params["baseModels"] = clean_base_models
    if tag.strip():
        params["tag"] = tag.strip()
    for name, value in (
        ("earlyAccess", early_access),
        ("supportsGeneration", supports_generation),
        ("fromPlatform", from_platform),
    ):
        if value is not None:
            params[name] = "true" if value else "false"
    try:
        data = _get_json(MODELS_URL + "?" + urlencode(params, doseq=True), {"Authorization": f"Bearer {key}"})
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise CivitaiRequestError("CivitAI rejected the API key.") from exc
        raise CivitaiRequestError("CivitAI model search failed.") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise CivitaiRequestError("CivitAI model search failed.") from exc
    if not isinstance(data, dict):
        raise CivitaiRequestError("CivitAI returned an invalid model list.")
    return data


def _image_nsfw(image: dict[str, Any]) -> bool:
    nsfw = bool(image.get("nsfw"))
    try:
        nsfw = nsfw or int(image.get("nsfwLevel") or 0) >= 4
    except (TypeError, ValueError):
        pass
    return nsfw


def _trim_images(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    images: list[dict[str, Any]] = []
    for image in raw:
        if not isinstance(image, dict):
            continue
        if image.get("type") == "video":
            continue
        url = str(image.get("url") or "").strip()
        if not url:
            continue
        images.append({"url": url, "nsfw": _image_nsfw(image)})
    return images


def _trim_version(raw: dict[str, Any]) -> dict[str, Any] | None:
    try:
        version_id = int(raw["id"])
    except (KeyError, TypeError, ValueError):
        return None
    words = raw.get("trainedWords")
    trained = [str(word).strip() for word in words] if isinstance(words, list) else []
    paid, buzz = download_cost([raw])
    return {
        "id": version_id,
        "name": str(raw.get("name") or "").strip(),
        "baseModel": str(raw.get("baseModel") or "").strip(),
        "description": str(raw.get("description") or ""),
        "trainedWords": [word for word in trained if word],
        "paid": paid,
        "buzz": buzz,
        "images": _trim_images(raw.get("images")),
    }


def _trim_stats(raw: object) -> dict[str, int | float]:
    if not isinstance(raw, dict):
        return {}
    stats: dict[str, int | float] = {}
    for key in ("downloadCount", "favoriteCount", "thumbsUpCount"):
        try:
            stats[key] = int(raw.get(key) or 0)
        except (TypeError, ValueError):
            pass
    try:
        rating = float(raw.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    if rating:
        stats["rating"] = rating
    return stats


def trim_model(raw: dict[str, Any]) -> dict[str, Any] | None:
    try:
        model_id = int(raw["id"])
    except (KeyError, TypeError, ValueError):
        return None
    creator = raw.get("creator")
    creator_name = creator.get("username") if isinstance(creator, dict) else str(creator or "")
    versions: list[dict[str, Any]] = []
    raw_versions = raw.get("modelVersions")
    if isinstance(raw_versions, list):
        for candidate in raw_versions:
            if not isinstance(candidate, dict):
                continue
            version = _trim_version(candidate)
            if version:
                versions.append(version)
    return {
        "id": model_id,
        "name": str(raw.get("name") or ""),
        "type": str(raw.get("type") or ""),
        "creator": str(creator_name or ""),
        "nsfw": bool(raw.get("nsfw")),
        "description": str(raw.get("description") or ""),
        "stats": _trim_stats(raw.get("stats")),
        "versions": versions,
    }


def get_model(model_id: int) -> dict[str, Any]:
    key = str(settings.load().get("civitaiApiKey") or "").strip()
    if not key:
        raise CivitaiRequestError("Set a CivitAI API key in Settings first.")
    try:
        data = _get_json(f"{MODELS_URL}/{int(model_id)}", {"Authorization": f"Bearer {key}"})
    except HTTPError as exc:
        if exc.code == 404:
            raise CivitaiRequestError("CivitAI model not found.") from exc
        if exc.code in {401, 403}:
            raise CivitaiRequestError("CivitAI rejected the API key.") from exc
        raise CivitaiRequestError("CivitAI model lookup failed.") from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError, ValueError) as exc:
        raise CivitaiRequestError("CivitAI model lookup failed.") from exc
    if not isinstance(data, dict):
        raise CivitaiRequestError("CivitAI returned an invalid model.")
    trimmed = trim_model(data)
    if not trimmed:
        raise CivitaiRequestError("CivitAI returned an invalid model.")
    return trimmed


def download_cost(versions: object) -> tuple[bool, int]:
    paid = False
    price = 0
    if not isinstance(versions, list):
        return paid, price
    for row in versions:
        if not isinstance(row, dict):
            continue
        config = row.get("earlyAccessConfig")
        charge = False
        amount = 0
        if isinstance(config, dict):
            charge = bool(config.get("chargeForDownload"))
            try:
                amount = int(config.get("downloadPrice") or 0)
            except (TypeError, ValueError):
                amount = 0
        if charge or amount > 0:
            paid = True
            if amount > price:
                price = amount
    return paid, price


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
