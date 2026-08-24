from __future__ import annotations

import hashlib
import os
import re
import tarfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.request import Request, urlopen

from blombo import dirs, settings
from blombo.civitai import civitai
from blombo.models import model_meta, model_thumbs

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
        raise CivitaiDownloadError("Download directory is not available.") from exc
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
    if kind not in {"checkpoints", "loras", "vae", "controlnet", "embeddings"}:
        raise CivitaiDownloadError("Downloaded model path is invalid.")
    return kind


def _model_kind(model_type: object) -> str:
    key = str(model_type or "").replace("_", "").replace("-", "").replace(" ", "").lower()
    kind = _MODEL_KINDS.get(key)
    if kind:
        return kind
    if key in {"wildcard", "wildcards"}:
        return "wildcards"
    raise CivitaiDownloadError(f"Unsupported CivitAI model type: {model_type or 'unknown'}.")


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

    images = version.get("images")
    image_url = ""
    if isinstance(images, list):
        image_url = next(
            (str(item.get("url") or "").strip() for item in images if isinstance(item, dict) and item.get("url")),
            "",
        )
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


def _write_download(url: str, target: Path) -> None:
    key = str(settings.load().get("civitaiApiKey") or "").strip()
    if not key:
        raise CivitaiDownloadError("Set a CivitAI API key in Settings first.")
    request = Request(
        url,
        headers={"Authorization": f"Bearer {key}", "User-Agent": "BlomboUI"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=30) as response, target.open("wb") as output:
            while chunk := response.read(_CHUNK):
                output.write(chunk)
    except Exception as exc:
        raise CivitaiDownloadError("CivitAI file download failed.") from exc


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
        raise CivitaiDownloadError("Could not save the downloaded file.") from exc


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
        raise CivitaiDownloadError("Could not unpack the wildcard archive.") from exc
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
    kind = _model_kind(model.get("type"))
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


def download(body: dict[str, Any]) -> dict[str, Any]:
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
    if _model_kind(model.get("type")) == "wildcards":
        folder, filename = _wildcard_destination(model, file, config)
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
            raise CivitaiDownloadError("Could not save the downloaded wildcard.") from exc
        kind = "wildcards"
    else:
        folder, filename = _model_destination(model, version, file, config, str(body.get("modelName") or ""), alias)
        destination = _install_download(
            str(file["downloadUrl"]),
            folder,
            filename,
            _expected_sha256(file),
        )
        paths = [destination]
        kind = _model_kind(model.get("type"))
        _refresh_model_info(kind, destination, model, version, config)
    return {
        "modelId": model_id,
        "versionId": version_id,
        "kind": kind,
        "paths": [str(path) for path in paths],
        "creator": creator,
        "creatorAlias": alias,
    }
