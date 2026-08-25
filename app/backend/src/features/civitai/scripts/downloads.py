from __future__ import annotations

import hashlib
import os
import re
import tarfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from shared import dirs

from features.settings import service as settings
from features.civitai.scripts import client as civitai
from features.downloads.scripts import progress as download_progress
from features.models.scripts import model_meta
from features.models.scripts import model_thumbs

_CHUNK = 1024 * 1024
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")
_MODEL_KINDS = {
    "checkpoint": "checkpoints",
    "lora": "loras",
    "locon": "loras",
    "dora": "loras",
    "textualinversion": "embeddings",
    "controlnet": "controlnet",
    "vae": "vae",
}
_CHECKPOINT_BASES = frozenset(
    {
        "sd 1.4",
        "sd 1.5",
        "sd 1.5 lcm",
        "sd 1.5 hyper",
        "sd 2.0",
        "sd 2.1",
        "sdxl 1.0",
        "sdxl lightning",
        "sdxl hyper",
        "sdxl",
        "pony",
        "pony v7",
        "illustrious",
        "noobai",
    }
)
_MODEL_KIND_FOLDERS = frozenset(
    {"checkpoints", "loras", "vae", "controlnet", "embeddings", "diffusion_models", "text_encoders"}
)
_CATEGORY_TAGS = {
    "character",
    "style",
    "concept",
    "clothing",
    "poses",
    "background",
    "object",
    "vehicle",
    "building",
    "animal",
}
_MODEL_TYPE_ALIASES = {
    "sdxl": "SDXL 1.0",
    "sdxl 0.9": "SDXL 1.0",
    "flux.1 dev": "Flux.1 D",
    "flux.1 schnell": "Flux.1 S",
    "illustrious xl": "Illustrious",
    "pony diffusion": "Pony",
    "noobai xl": "NoobAI",
}
_WILDCARD_EXTS = {".txt", ".yaml", ".yml"}
_ARCHIVE_EXTS = {".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz"}


class CivitaiDownloadError(RuntimeError):
    pass


def _cause_detail(exc: BaseException) -> str:
    if isinstance(exc, HTTPError):
        reason = str(exc.reason or "").strip()
        extra = f" {reason}" if reason else ""
        return f"HTTP {exc.code}{extra}."
    if isinstance(exc, URLError):
        reason = str(getattr(exc, "reason", "") or exc).strip()
        if reason and not reason.endswith("."):
            reason = f"{reason}."
        return reason
    if isinstance(exc, TimeoutError):
        return "Timed out."
    text = str(exc).strip()
    if text and not text.endswith("."):
        text = f"{text}."
    return text or type(exc).__name__


def _failed(prefix: str, exc: BaseException) -> CivitaiDownloadError:
    detail = _cause_detail(exc)
    message = f"{prefix} {detail}".strip() if detail else prefix
    error = CivitaiDownloadError(message)
    error.__cause__ = exc
    return error


def _safe_segment(raw: object, fallback: str) -> str:
    value = _SAFE.sub("_", str(raw or "").strip()).strip(" ._")
    return (value or fallback)[:120]


def _safe_stem(raw: object, fallback: str) -> str:
    return _safe_segment(Path(str(raw or "")).stem, fallback)


def _selected_dir(key: str, selected_id: object) -> dict[str, str]:
    wanted = str(selected_id or "local").strip()
    listed = dirs.listed_dirs(key)
    item = next((row for row in listed if row.get("id") == wanted), None)
    if item is None or not str(item.get("path") or "").strip():
        item = next((row for row in listed if row.get("id") == "local"), None)
    if item is None:
        raise CivitaiDownloadError("Download directory is not configured.")
    return item


def _selected_root(key: str, selected_id: object) -> Path:
    item = _selected_dir(key, selected_id)
    raw_path = str((item or {}).get("path") or "").strip()
    if not raw_path:
        raise CivitaiDownloadError("Download directory is not configured.")
    path = Path(raw_path).resolve()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise _failed("Download directory is not available.", exc)
    return path


def _model_rel_path(path: Path, config: dict[str, Any]) -> str:
    root = _selected_root("modelDirs", config.get("modelDirId"))
    relative = path.relative_to(root / _model_kind_from_path(path, root))
    item = _selected_dir("modelDirs", config.get("modelDirId"))
    prefix = "" if item.get("id") == "local" else str(item.get("name") or "").strip()
    return f"{prefix}/{relative.as_posix()}" if prefix else relative.as_posix()


def _model_kind_from_path(path: Path, root: Path) -> str:
    relative = path.relative_to(root)
    kind = relative.parts[0] if relative.parts else ""
    if kind not in _MODEL_KIND_FOLDERS:
        raise CivitaiDownloadError("Downloaded model path is invalid.")
    return kind


def _model_kind(model_type: object, base_model: object = "") -> str:
    key = str(model_type or "").replace("_", "").replace("-", "").replace(" ", "").lower()
    kind = _MODEL_KINDS.get(key)
    if kind == "checkpoints" and _is_diffusion_base(base_model):
        return "diffusion_models"
    if kind:
        return kind
    if key in {"wildcard", "wildcards"}:
        return "wildcards"
    raise CivitaiDownloadError(f"Unsupported CivitAI model type: {model_type or 'unknown'}.")


def _is_diffusion_base(base_model: object) -> bool:
    value = str(base_model or "").strip().casefold()
    return bool(value) and value not in _CHECKPOINT_BASES


def _model_type(base_model: object) -> str:
    value = str(base_model or "").strip()
    if not value:
        return ""
    wanted = value.casefold()
    for option in model_meta.OPTIONS:
        if option.casefold() == wanted:
            return option
    return _MODEL_TYPE_ALIASES.get(wanted, "")


def _category(tags: object) -> str:
    if isinstance(tags, list):
        for tag in tags:
            value = str(tag or "").strip().casefold()
            if value in _CATEGORY_TAGS:
                return value.capitalize()
    return "General"


def _preview_kind(item: dict[str, Any]) -> str:
    url = str(item.get("url") or "").split("?", 1)[0].casefold()
    kind = str(item.get("type") or "").strip().casefold()
    if kind == "video" or url.endswith((".mp4", ".webm", ".mkv")):
        return "video"
    if url.endswith(".gif"):
        return "gif"
    return "image"


def _preview_url(version: dict[str, Any]) -> str:
    images = version.get("images")
    if not isinstance(images, list):
        return ""
    ordered: list[tuple[str, str]] = []
    for item in images:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        ordered.append((_preview_kind(item), url))
    if not ordered:
        return ""
    if settings.load().get("saveAnimatedThumbs", True) is not False:
        return ordered[0][1]
    stills = [url for kind, url in ordered if kind == "image"]
    if stills:
        return stills[0]
    gifs = [url for kind, url in ordered if kind == "gif"]
    return gifs[0] if gifs else ""


def _site() -> str:
    value = str(settings.load().get("civitaiSite") or "").strip()
    return value if value in {"civitai", "red"} else "red"


def _file_size(file: dict[str, Any]) -> int:
    try:
        return max(0, int(file.get("sizeBytes") or 0))
    except (TypeError, ValueError):
        return 0


def _paths_size(paths: list[Path]) -> int:
    total = 0
    for path in paths:
        try:
            total += path.stat().st_size
        except OSError:
            pass
    return total


def _str_list(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item).strip()]


def _download_meta(
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    *,
    kind: str,
    creator: str,
    file_name: str,
) -> dict[str, Any]:
    from features.downloads.scripts.history import plain, search_blob

    tags = _str_list(model.get("tags"))
    words = _str_list(version.get("trainedWords"))
    description = plain(" ".join([str(model.get("description") or ""), str(version.get("description") or "")]))
    base_model = str(version.get("baseModel") or "").strip()
    model_type = str(model.get("type") or "").strip()
    return {
        "base_model": base_model,
        "tags": tags,
        "trained_words": words,
        "description": description,
        "model_type": model_type,
        "search_text": search_blob(
            model.get("name"),
            creator,
            file_name,
            file.get("name"),
            version.get("name"),
            kind,
            model_type,
            base_model,
            *tags,
            *words,
            description,
        ),
    }


def _progress_meta(
    key: str,
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    *,
    kind: str,
    creator: str,
    file_name: str,
) -> None:
    extra = _download_meta(model, version, file, kind=kind, creator=creator, file_name=file_name)
    download_progress.set_fields(
        key,
        fileName=file_name,
        kind=kind,
        searchText=extra["search_text"],
    )


def _request_body(body: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {}
    return {
        key: body[key]
        for key in ("modelId", "versionId", "fileId", "customNaming", "modelName", "creatorAlias")
        if key in body
    }


def _begin_history(
    body: dict[str, Any],
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    model_id: int,
    version_id: int,
    creator: str,
    extra: dict[str, Any],
    history_id: int | None,
) -> int:
    from features.downloads.scripts import history as download_history
    from features.downloads.scripts import thumbs as download_thumbs

    if not history_id:
        raw_file_id = file.get("id")
        try:
            file_id = int(raw_file_id) if raw_file_id is not None else None
        except (TypeError, ValueError):
            file_id = None
        history_id = download_history.record(
            source="civitai",
            model_id=model_id,
            version_id=version_id,
            file_id=file_id,
            name=str(model.get("name") or ""),
            version_name=str(version.get("name") or ""),
            kind="",
            creator=creator,
            file_name=str(file.get("name") or ""),
            size_bytes=_file_size(file),
            paths=[],
            image_url=_preview_url(version),
            site=_site(),
            base_model=str(extra["base_model"]),
            tags=list(extra["tags"]),
            trained_words=list(extra["trained_words"]),
            description=str(extra["description"]),
            search_text=str(extra["search_text"]),
            model_type=str(extra["model_type"]),
            status="downloading",
            request=_request_body(body),
        )
    download_thumbs.prefetch(int(history_id))
    return int(history_id)


def _fail_history(
    body: dict[str, Any],
    exc: BaseException,
    history_id: int | None,
    extra: dict[str, Any],
) -> None:
    try:
        from features.downloads.scripts import history as download_history

        download_history.record_failed(body=body, error=str(exc), history_id=history_id, extra=extra)
    except Exception:
        pass


def _record_download(
    *,
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    model_id: int,
    version_id: int,
    kind: str,
    creator: str,
    paths: list[Path],
    request: dict[str, Any] | None = None,
    history_id: int | None = None,
) -> None:
    try:
        from features.downloads.scripts import history as download_history

        raw_file_id = file.get("id")
        try:
            file_id = int(raw_file_id) if raw_file_id is not None else None
        except (TypeError, ValueError):
            file_id = None
        file_name = paths[0].name if paths else str(file.get("name") or "")
        extra = _download_meta(model, version, file, kind=kind, creator=creator, file_name=file_name)
        download_history.record(
            source="civitai",
            model_id=model_id,
            version_id=version_id,
            file_id=file_id,
            name=str(model.get("name") or ""),
            version_name=str(version.get("name") or ""),
            kind=kind,
            creator=creator,
            file_name=file_name,
            size_bytes=_paths_size(paths) or _file_size(file),
            paths=[str(path) for path in paths],
            image_url=_preview_url(version),
            site=_site(),
            base_model=str(extra["base_model"]),
            tags=list(extra["tags"]),
            trained_words=list(extra["trained_words"]),
            description=str(extra["description"]),
            search_text=str(extra["search_text"]),
            model_type=str(extra["model_type"]),
            request=_request_body(request if isinstance(request, dict) else {}),
            history_id=history_id,
        )
    except Exception:
        pass


def _refresh_model_info(kind: str, destination: Path, model: dict[str, Any], version: dict[str, Any], config: dict[str, Any]) -> None:
    if not config.get("updateModelInfo", True) or kind == "wildcards":
        return
    try:
        relative = _model_rel_path(destination, config)
    except (CivitaiDownloadError, ValueError):
        return
    try:
        current = model_meta.get_info(kind, relative)
    except Exception:
        current = {"types": [], "prompt": ""}
    model_type = _model_type(version.get("baseModel"))
    types = [model_type] if model_type else list(current.get("types") or [])
    raw_words = version.get("trainedWords")
    words = (
        [str(word or "").strip() for word in raw_words if str(word or "").strip()]
        if isinstance(raw_words, list)
        else []
    )
    prompt = ", ".join(words) if kind == "loras" and words else str(current.get("prompt") or "")
    try:
        model_meta.set_info(kind, relative, types, prompt=prompt if kind == "loras" else None)
    except Exception:
        pass

    image_url = _preview_url(version)
    if not image_url:
        return
    try:
        image = civitai.fetch_image(image_url)
        if not image:
            return
        data, media = image
        model_meta.save_thumb(
            kind,
            relative,
            data,
            model_thumbs.GLOBAL,
            {
                "origin": "civitai",
                "civitai": {
                    "id": version.get("id"),
                    "modelId": model.get("id"),
                    "name": model.get("name"),
                    "baseModel": version.get("baseModel"),
                    "image": image_url,
                    "trainedWords": words,
                },
            },
            media,
        )
    except Exception:
        pass


def _unique_path(folder: Path, filename: str) -> Path:
    candidate = folder / filename
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(2, 10000):
        candidate = folder / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
    raise CivitaiDownloadError("Could not find an unused download filename.")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _expected_sha256(file: dict[str, Any]) -> str:
    hashes = file.get("hashes")
    if not isinstance(hashes, dict):
        return ""
    for key, value in hashes.items():
        if str(key).casefold() == "sha256":
            return str(value or "").strip().casefold()
    return ""


def _token_url(url: str, token: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["token"] = token
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _content_length(response: object) -> int:
    headers = getattr(response, "headers", None)
    if headers is None:
        return 0
    raw = headers.get("Content-Length")
    try:
        return max(0, int(raw or 0))
    except (TypeError, ValueError):
        return 0


def _write_download(url: str, target: Path) -> None:
    key = str(settings.load().get("civitaiApiKey") or "").strip()
    if not key:
        raise CivitaiDownloadError("Set a CivitAI API key in Settings first.")
    request = Request(
        _token_url(url, key),
        headers={"User-Agent": "BlomboUI"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=60) as response, target.open("wb") as output:
            expected = _content_length(response)
            done = 0
            while chunk := response.read(_CHUNK):
                output.write(chunk)
                done += len(chunk)
                download_progress.bump(done, expected)
    except Exception as exc:
        raise _failed("CivitAI file download failed.", exc)


def _install_download(url: str, folder: Path, filename: str, expected_hash: str = "") -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    destination = _unique_path(folder, filename)
    temporary = folder / f".{destination.name}.{uuid.uuid4().hex}.part"
    try:
        _write_download(url, temporary)
        if expected_hash and _sha256(temporary).casefold() != expected_hash:
            raise CivitaiDownloadError("Downloaded file failed SHA256 verification.")
        os.replace(temporary, destination)
        return destination
    except CivitaiDownloadError:
        temporary.unlink(missing_ok=True)
        raise
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise _failed("Could not save the downloaded file.", exc)


def _relative_member(raw: str) -> PurePosixPath | None:
    value = raw.replace("\\", "/").strip("/")
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts:
        return None
    return path


def _extract_zip(source: Path, folder: Path) -> list[Path]:
    extracted: list[Path] = []
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            if info.is_dir() or Path(info.filename).suffix.casefold() not in _WILDCARD_EXTS:
                continue
            member = _relative_member(info.filename)
            if member is None:
                continue
            destination = _unique_path(folder / member.parent, member.name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.part"
            try:
                with archive.open(info) as input_stream, temporary.open("wb") as output:
                    while chunk := input_stream.read(_CHUNK):
                        output.write(chunk)
                os.replace(temporary, destination)
                extracted.append(destination)
            finally:
                temporary.unlink(missing_ok=True)
    return extracted


def _extract_tar(source: Path, folder: Path) -> list[Path]:
    extracted: list[Path] = []
    with tarfile.open(source) as archive:
        for info in archive.getmembers():
            if not info.isfile() or Path(info.name).suffix.casefold() not in _WILDCARD_EXTS:
                continue
            member = _relative_member(info.name)
            input_stream = archive.extractfile(info)
            if member is None or input_stream is None:
                continue
            destination = _unique_path(folder / member.parent, member.name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.part"
            try:
                with input_stream, temporary.open("wb") as output:
                    while chunk := input_stream.read(_CHUNK):
                        output.write(chunk)
                os.replace(temporary, destination)
                extracted.append(destination)
            finally:
                temporary.unlink(missing_ok=True)
    return extracted


def _extract_archive(source: Path, folder: Path) -> list[Path]:
    try:
        if zipfile.is_zipfile(source):
            return _extract_zip(source, folder)
        if tarfile.is_tarfile(source):
            return _extract_tar(source, folder)
    except (OSError, tarfile.TarError, zipfile.BadZipFile) as exc:
        raise _failed("Could not unpack the wildcard archive.", exc)
    raise CivitaiDownloadError("The downloaded wildcard archive format is not supported.")


def _version(model: dict[str, Any], version_id: int) -> dict[str, Any]:
    versions = model.get("versions")
    if isinstance(versions, list):
        for version in versions:
            if isinstance(version, dict) and int(version.get("id") or 0) == version_id:
                return version
    raise CivitaiDownloadError("CivitAI model version was not found.")


def _primary_file(version: dict[str, Any], file_id: int | None = None) -> dict[str, Any]:
    files = version.get("files")
    if isinstance(files, list):
        rows = [item for item in files if isinstance(item, dict) and item.get("downloadUrl")]
        if rows:
            if file_id is not None:
                selected = next((item for item in rows if int(item.get("id") or 0) == file_id), None)
                if selected is not None:
                    return selected
            return next((item for item in rows if item.get("primary")), rows[0])
    url = str(version.get("downloadUrl") or "").strip()
    if url:
        return {"name": "", "downloadUrl": url, "hashes": {}}
    raise CivitaiDownloadError("This CivitAI version has no downloadable file.")


def _alias(config: dict[str, Any], creator: str, requested: str, custom: bool) -> str:
    aliases = config.get("authorAliases")
    aliases = aliases if isinstance(aliases, dict) else {}
    value = requested.strip() if custom else ""
    if not value:
        for author, alias in aliases.items():
            if str(author).casefold() == creator.casefold():
                value = str(alias).strip()
                break
    if not value or value.casefold() == creator.casefold():
        return ""
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", value):
        raise CivitaiDownloadError("Creator filename prefix contains invalid characters.")
    for author, alias in aliases.items():
        if str(author).casefold() != creator.casefold() and str(alias).casefold() == value.casefold():
            raise CivitaiDownloadError("That creator filename prefix is already assigned to another creator.")
    return value


def _model_destination(
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    config: dict[str, Any],
    custom_name: str,
    creator_alias: str,
) -> tuple[Path, str]:
    kind = _model_kind(model.get("type"), version.get("baseModel"))
    root = _selected_root("modelDirs", config.get("modelDirId")) / kind
    if config.get("modelIntelligent", True):
        if config.get("modelSortBaseModel", True):
            root /= _safe_segment(version.get("baseModel"), "UnknownBase")
        if config.get("modelSortCategory", True):
            root /= _category(model.get("tags"))
        if config.get("modelSortCreator", True):
            root /= _safe_segment(model.get("creator"), "UnknownCreator")
    source_name = str(file.get("name") or "").strip()
    suffix = Path(source_name).suffix or ".bin"
    stem = _safe_stem(custom_name or model.get("name"), "model")
    prefix = _safe_segment(creator_alias, "") if creator_alias else ""
    filename = f"{prefix}_{stem}{suffix}" if prefix else f"{stem}{suffix}"
    return root, filename


def _wildcard_destination(model: dict[str, Any], file: dict[str, Any], config: dict[str, Any]) -> tuple[Path, str]:
    root = _selected_root("wildcardDirs", config.get("wildcardDirId"))
    source_name = str(file.get("name") or "").strip()
    suffix = Path(source_name).suffix or ".zip"
    stem = _safe_stem(model.get("name"), "wildcard") if config.get("wildcardIntelligent", True) else _safe_stem(source_name, "wildcard")
    return root, f"{stem}{suffix}"


def download(body: dict[str, Any], history_id: int | None = None) -> dict[str, Any]:
    try:
        model_id = int(body.get("modelId"))
        version_id = int(body.get("versionId"))
    except (TypeError, ValueError) as exc:
        raise CivitaiDownloadError("Invalid CivitAI model or version.") from exc
    if model_id <= 0 or version_id <= 0:
        raise CivitaiDownloadError("Invalid CivitAI model or version.")
    try:
        model = civitai.get_model(model_id)
    except civitai.CivitaiRequestError as exc:
        raise CivitaiDownloadError(str(exc)) from exc
    version = _version(model, version_id)
    if version.get("paid"):
        raise CivitaiDownloadError("This CivitAI version requires Buzz or purchase before downloading.")
    requested_file_id = body.get("fileId")
    try:
        file_id = int(requested_file_id) if requested_file_id is not None else None
    except (TypeError, ValueError):
        file_id = None
    file = _primary_file(version, file_id)
    config = settings.load().get("civitaiDownload")
    config = config if isinstance(config, dict) else {}
    custom = bool(body.get("customNaming"))
    creator = str(model.get("creator") or "").strip()
    alias = _alias(config, creator, str(body.get("creatorAlias") or ""), custom)
    progress_key = uuid.uuid4().hex
    extra = _download_meta(
        model,
        version,
        file,
        kind="",
        creator=creator,
        file_name=str(file.get("name") or ""),
    )
    download_progress.start(
        progress_key,
        {
            "modelId": model_id,
            "versionId": version_id,
            "fileId": file_id,
            "name": str(model.get("name") or ""),
            "versionName": str(version.get("name") or ""),
            "kind": "",
            "creator": creator,
            "fileName": str(file.get("name") or ""),
            "sizeBytes": _file_size(file),
            "imageUrl": _preview_url(version),
            "site": _site(),
            "baseModel": extra["base_model"],
            "tags": extra["tags"],
            "trainedWords": extra["trained_words"],
            "description": extra["description"],
            "searchText": extra["search_text"],
            "historyId": history_id,
        },
    )
    try:
        history_id = _begin_history(
            body,
            model,
            version,
            file,
            model_id,
            version_id,
            creator,
            extra,
            history_id,
        )
        download_progress.set_fields(progress_key, historyId=history_id)
        return _run_download(
            body, model, version, file, model_id, version_id, config, creator, alias, progress_key, history_id
        )
    except Exception as exc:
        _fail_history(
            body,
            exc,
            history_id,
            {
                "name": str(model.get("name") or ""),
                "versionName": str(version.get("name") or ""),
                "creator": creator,
                "fileName": str(file.get("name") or ""),
                "sizeBytes": _file_size(file),
                "imageUrl": _preview_url(version),
                "site": _site(),
                "baseModel": extra["base_model"],
                "tags": extra["tags"],
                "trainedWords": extra["trained_words"],
                "description": extra["description"],
                "searchText": extra["search_text"],
            },
        )
        if isinstance(exc, CivitaiDownloadError):
            raise
        raise CivitaiDownloadError(str(exc)) from exc
    finally:
        download_progress.finish(progress_key)


def _run_download(
    body: dict[str, Any],
    model: dict[str, Any],
    version: dict[str, Any],
    file: dict[str, Any],
    model_id: int,
    version_id: int,
    config: dict[str, Any],
    creator: str,
    alias: str,
    progress_key: str,
    history_id: int | None = None,
) -> dict[str, Any]:
    if _model_kind(model.get("type")) == "wildcards":
        folder, filename = _wildcard_destination(model, file, config)
        _progress_meta(progress_key, model, version, file, kind="wildcards", creator=creator, file_name=filename)
        source = folder / f".{filename}.{uuid.uuid4().hex}.download"
        try:
            _write_download(str(file["downloadUrl"]), source)
            expected = _expected_sha256(file)
            if expected and _sha256(source).casefold() != expected:
                raise CivitaiDownloadError("Downloaded file failed SHA256 verification.")
            suffix = Path(filename).suffix.casefold()
            if config.get("wildcardUnpack", True) and suffix in _ARCHIVE_EXTS:
                paths = _extract_archive(source, folder)
                if not paths:
                    raise CivitaiDownloadError("The archive contained no supported wildcard files.")
                source.unlink(missing_ok=True)
            else:
                destination = _unique_path(folder, filename)
                os.replace(source, destination)
                paths = [destination]
        except CivitaiDownloadError:
            source.unlink(missing_ok=True)
            raise
        except OSError as exc:
            source.unlink(missing_ok=True)
            raise _failed("Could not save the downloaded wildcard.", exc)
        kind = "wildcards"
    else:
        folder, filename = _model_destination(model, version, file, config, str(body.get("modelName") or ""), alias)
        kind = _model_kind(model.get("type"), version.get("baseModel"))
        _progress_meta(progress_key, model, version, file, kind=kind, creator=creator, file_name=filename)
        destination = _install_download(
            str(file["downloadUrl"]),
            folder,
            filename,
            _expected_sha256(file),
        )
        paths = [destination]
        _refresh_model_info(kind, destination, model, version, config)
    _record_download(
        model=model,
        version=version,
        file=file,
        model_id=model_id,
        version_id=version_id,
        kind=kind,
        creator=creator,
        paths=paths,
        request=body,
        history_id=history_id,
    )
    return {
        "modelId": model_id,
        "versionId": version_id,
        "kind": kind,
        "paths": [str(path) for path in paths],
        "creator": creator,
        "creatorAlias": alias,
    }
