from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response

from api.errors import ApiError
from features.civitai.schemas import CivitaiDownloadIn
from features.civitai.service import client as civitai
from features.civitai.service import downloads as civitai_downloads
from features.downloads import service as download_jobs
from features.issues.service import record_log
from features.models import service as models

api = APIRouter()

@api.get("/civitai/by-hash/{hash}")
def civitai_by_hash(hash: str) -> dict:
    if not civitai.valid_hash(hash):
        raise ApiError("bad_request", "invalid hash", 400)
    data = civitai.by_hash(hash)
    if not data:
        raise ApiError("not_found", "no matching resource")
    return data


@api.get("/civitai/models")
def civitai_models(
    query: str = "",
    type: Literal["all", "Checkpoint", "LORA"] = "all",
    types: list[str] | None = Query(default=None),
    base_models: list[str] | None = Query(default=None, alias="baseModels"),
    sort: Literal[
        "Highest Rated",
        "Most Downloaded",
        "Most Liked",
        "Most Discussed",
        "Most Collected",
        "Most Images",
        "Newest",
        "Oldest",
    ] = "Most Downloaded",
    period: Literal["AllTime", "Year", "Month", "Week", "Day"] = "AllTime",
    page: int = 1,
    limit: int = 20,
    cursor: str = "",
    early_access: bool | None = Query(default=None, alias="earlyAccess"),
    supports_generation: bool | None = Query(default=None, alias="supportsGeneration"),
    from_platform: bool | None = Query(default=None, alias="fromPlatform"),
    nsfw: bool = True,
    tag: str = "",
) -> dict:
    try:
        payload = civitai.list_models(
            query=query,
            types=types if types else ([] if type == "all" else [type]),
            base_models=base_models,
            sort=sort,
            period=period,
            page=max(1, page),
            limit=max(1, min(100, limit)),
            cursor=cursor,
            early_access=early_access,
            supports_generation=supports_generation,
            from_platform=from_platform,
            nsfw=nsfw,
            tag=tag,
        )
    except civitai.CivitaiRequestError as exc:
        status = 400 if "Set a CivitAI API key" in str(exc) else 502
        raise ApiError("civitai_error", str(exc), status) from exc
    raw_items = payload.get("items")
    items: list[dict[str, Any]] = []
    if isinstance(raw_items, list):
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            try:
                model_id = int(raw["id"])
            except (KeyError, TypeError, ValueError):
                continue
            creator = raw.get("creator")
            creator_name = creator.get("username") if isinstance(creator, dict) else str(creator or "")
            versions = raw.get("modelVersions")
            version = versions[0] if isinstance(versions, list) and versions and isinstance(versions[0], dict) else {}
            base_models: list[str] = []
            version_refs: list[dict[str, Any]] = []
            download_hashes: list[str] = []
            download_names: list[str] = [str(raw.get("name") or "").strip()]
            if isinstance(versions, list):
                for candidate in versions:
                    if not isinstance(candidate, dict):
                        continue
                    base_model = str(candidate.get("baseModel") or "").strip()
                    if base_model and base_model not in base_models:
                        base_models.append(base_model)
                    version_name = str(candidate.get("name") or "").strip()
                    if version_name and version_name not in download_names:
                        download_names.append(version_name)
                    try:
                        version_id = int(candidate["id"])
                    except (KeyError, TypeError, ValueError):
                        version_id = 0
                    if version_id:
                        version_refs.append({"id": version_id, "baseModel": base_model})
                    files = candidate.get("files")
                    if isinstance(files, list):
                        for file in files:
                            if not isinstance(file, dict):
                                continue
                            file_name = str(file.get("name") or "").strip()
                            if file_name and file_name not in download_names:
                                download_names.append(file_name)
                            file_hashes = file.get("hashes")
                            if isinstance(file_hashes, dict):
                                for value in file_hashes.values():
                                    digest = str(value or "").strip().lower()
                                    if digest and digest not in download_hashes:
                                        download_hashes.append(digest)
            images = version.get("images")
            preview = ""
            preview_nsfw = False
            if isinstance(images, list):
                for image in images:
                    if not isinstance(image, dict) or not image.get("url"):
                        continue
                    preview = str(image.get("url"))
                    preview_nsfw = bool(image.get("nsfw"))
                    try:
                        preview_nsfw = preview_nsfw or int(image.get("nsfwLevel") or 0) >= 4
                    except (TypeError, ValueError):
                        pass
                    break
            paid, buzz = civitai.download_cost(versions)
            items.append(
                {
                    "id": model_id,
                    "name": str(raw.get("name") or ""),
                    "type": str(raw.get("type") or ""),
                    "creator": str(creator_name),
                    "nsfw": bool(raw.get("nsfw")) or preview_nsfw,
                    "baseModel": base_models[0] if base_models else "",
                    "baseModels": base_models,
                    "versions": version_refs,
                    "preview": preview,
                    "downloadNames": download_names,
                    "downloadHashes": download_hashes,
                    "paid": paid,
                    "buzz": buzz,
                }
            )
    metadata = payload.get("metadata")
    next_cursor = metadata.get("nextCursor") if isinstance(metadata, dict) else None
    has_next = bool(next_cursor or (metadata.get("nextPage") if isinstance(metadata, dict) else None))
    return {"items": items, "page": max(1, page), "hasNext": has_next, "nextCursor": next_cursor or ""}


@api.get("/civitai/models/{model_id}")
def civitai_model(model_id: int) -> dict:
    try:
        return civitai.get_model(model_id)
    except civitai.CivitaiRequestError as exc:
        message = str(exc)
        if "not found" in message:
            raise ApiError("not_found", message, 404) from exc
        status = 400 if "Set a CivitAI API key" in message else 502
        raise ApiError("civitai_error", message, status) from exc


@api.post("/civitai/download")
def civitai_download(body: CivitaiDownloadIn) -> dict:
    try:
        result = download_jobs.submit_civitai(body.model_dump())
    except civitai_downloads.CivitaiDownloadError as exc:
        record_log(
            "civitai",
            "download_failed",
            str(body.modelName or "").strip() or f"model {body.modelId}",
            str(exc),
            [f"model {body.modelId}", f"version {body.versionId}"],
        )
        raise ApiError("civitai_download_error", str(exc), 400) from exc
    if result.get("queued"):
        return result
    try:
        models.refresh_models(result["kind"])
    except Exception:
        pass
    return result


@api.get("/civitai/image")
def civitai_image(url: str) -> Response:
    hit = civitai.fetch_image(url)
    if not hit:
        raise ApiError("not_found", "image not found")
    data, media = hit
    return Response(content=data, media_type=media)
