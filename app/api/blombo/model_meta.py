from __future__ import annotations

import json
import math
import time
from io import BytesIO
from pathlib import Path

from blombo.paths import USER

OPTIONS = (
    "Anima",
    "AuraFlow",
    "Chroma",
    "CogVideoX",
    "Ernie",
    "Flux.1 S",
    "Flux.1 D",
    "Flux.1 Krea",
    "Flux.1 Kontext",
    "Flux.2 D",
    "Flux.2 Klein 9B",
    "Flux.2 Klein 9B-base",
    "Flux.2 Klein 4B",
    "Flux.2 Klein 4B-base",
    "Flux 3 Video",
    "Grok",
    "HappyHorse",
    "HiDream",
    "HiDream-O1",
    "Hunyuan 1",
    "Hunyuan Video",
    "Ideogram 4.0",
    "Boogu",
    "Illustrious",
    "NoobAI",
    "Kolors",
    "Krea 2",
    "LTXV",
    "LTXV2",
    "LTXV 2.3",
    "LTXV 2.5",
    "Lens",
    "Lumina",
    "MageFlow",
    "MAI",
    "Mochi",
    "PixArt a",
    "PixArt E",
    "Pony",
    "Pony V7",
    "Qwen",
    "Qwen 2",
    "Qwen 3",
    "Wan Video 1.3B t2v",
    "Wan Video 14B t2v",
    "Wan Video 14B i2v 480p",
    "Wan Video 14B i2v 720p",
    "Wan Video 2.2 TI2V-5B",
    "Wan Video 2.2 I2V-A14B",
    "Wan Video 2.2 T2V-A14B",
    "Wan Video 2.5 T2V",
    "Wan Video 2.5 I2V",
    "Wan Image 2.7",
    "Wan Video 2.7",
    "SD 1.4",
    "SD 1.5",
    "SD 1.5 LCM",
    "SD 1.5 Hyper",
    "SD 2.0",
    "SD 2.1",
    "SDXL 1.0",
    "SDXL Lightning",
    "SDXL Hyper",
    "Reve",
    "ZImageTurbo",
    "ZImageBase",
    "MiniMax H3",
    "ACE Audio",
    "SDXL",
    "Flux",
    "SD3",
)

ROOT = USER / "model_meta"
DATA = ROOT / "data"
THUMBS = ROOT / "thumbnails"
THUMB_EXTS = (".png", ".jpg", ".jpeg", ".webp")
THUMB_MAX = 512
_ALLOWED = frozenset(OPTIONS)
_FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
_MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
_migrated = False


def _ident(rel: str) -> str | None:
    ident = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if not ident or ".." in Path(ident).parts:
        return None
    return ident


def _migrate() -> None:
    global _migrated
    if _migrated:
        return
    DATA.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    if ROOT.is_dir():
        keep = {"data", "thumbnails", ".gitkeep"}
        for path in list(ROOT.iterdir()):
            if path.name in keep:
                continue
            if path.is_file() and path.suffix.lower() == ".json":
                dest = DATA / path.name
            elif path.is_dir():
                dest = THUMBS / path.name
            else:
                continue
            if dest.exists():
                continue
            try:
                path.rename(dest)
            except OSError:
                continue
    _migrated = True


def _info_file(kind: str) -> Path:
    return DATA / f"{kind}.json"


def _legacy_info_files(kind: str) -> tuple[Path, Path]:
    return ROOT / f"{kind}.json", USER / "model_types" / f"{kind}.json"


def _clean_types(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    seen: list[str] = []
    for item in raw:
        if item in _ALLOWED and item not in seen:
            seen.append(item)
    return seen


def _blank_row() -> dict:
    return {
        "types": [],
        "modified": 0,
        "prompt": "",
        "negative_prompt": "",
        "notes": "",
        "strength": 1.0,
        "slider": False,
    }


def _strength(raw: object) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 1.0
    if not math.isfinite(value):
        return 1.0
    return value


def _info_out(row: dict) -> dict[str, object]:
    return {
        "types": list(row.get("types") or []),
        "prompt": str(row.get("prompt") or ""),
        "negative_prompt": str(row.get("negative_prompt") or ""),
        "notes": str(row.get("notes") or ""),
        "strength": _strength(row["strength"]) if "strength" in row else 1.0,
        "slider": bool(row.get("slider")),
    }


def _row(raw: object) -> dict:
    if isinstance(raw, list):
        return {**_blank_row(), "types": _clean_types(raw)}
    if isinstance(raw, dict):
        try:
            stamp = int(raw.get("modified") or 0)
        except (TypeError, ValueError):
            stamp = 0
        return {
            "types": _clean_types(raw.get("types")),
            "modified": max(0, stamp),
            "prompt": str(raw.get("prompt") or ""),
            "negative_prompt": str(raw.get("negative_prompt") or ""),
            "notes": str(raw.get("notes") or ""),
            "strength": _strength(raw["strength"]) if "strength" in raw else 1.0,
            "slider": bool(raw.get("slider")),
        }
    return _blank_row()


def _load(kind: str) -> dict[str, dict]:
    _migrate()
    for path in (_info_file(kind), *_legacy_info_files(kind)):
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(data, dict):
            return {}
        out: dict[str, dict] = {}
        for key, raw in data.items():
            ident = _ident(str(key))
            if not ident:
                continue
            row = _row(raw)
            if (
                row["types"]
                or row["modified"]
                or row["prompt"]
                or row["negative_prompt"]
                or row["notes"]
                or row["slider"]
                or row["strength"] != 1.0
            ):
                out[ident] = row
        return out
    return {}


def _write(kind: str, data: dict[str, dict]) -> None:
    _migrate()
    path = _info_file(kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    packed: dict[str, dict] = {}
    for key, row in data.items():
        out: dict = {}
        if row.get("types"):
            out["types"] = row["types"]
        if row.get("modified"):
            out["modified"] = int(row["modified"])
        if str(row.get("prompt") or "").strip():
            out["prompt"] = str(row["prompt"])
        if str(row.get("negative_prompt") or "").strip():
            out["negative_prompt"] = str(row["negative_prompt"])
        if str(row.get("notes") or "").strip():
            out["notes"] = str(row["notes"])
        if row.get("slider"):
            out["slider"] = True
        try:
            strength = float(row.get("strength") if row.get("strength") is not None else 1)
        except (TypeError, ValueError):
            strength = 1.0
        if strength != 1.0:
            out["strength"] = strength
        if out:
            packed[key] = out
    path.write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")


def _name(rel: str) -> str:
    return Path(rel).name.lower()


def _hits(idents: list[str] | dict[str, object], name: str) -> list[str]:
    keys = idents if isinstance(idents, list) else list(idents)
    return [key for key in keys if _name(key) == name]


def get_types(kind: str, rel: str) -> list[str]:
    return get_info(kind, rel)["types"]


def get_info(kind: str, rel: str) -> dict[str, object]:
    ident = _ident(rel)
    if not ident:
        return _info_out({})
    return _info_out(_load(kind).get(ident) or {})


def all_info(kind: str) -> dict[str, dict]:
    return _load(kind)


def user_mtime(kind: str, rel: str) -> int:
    ident = _ident(rel)
    if not ident:
        return 0
    row = _load(kind).get(ident) or {}
    return max(int(row.get("modified") or 0), thumb_mtime(kind, rel))


def user_stamps(kind: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for ident, row in _load(kind).items():
        out[ident] = int(row.get("modified") or 0)
    return out


def touch(kind: str, rel: str) -> int:
    ident = _ident(rel)
    if not ident:
        return 0
    now = int(time.time())
    data = _load(kind)
    row = data.get(ident) or {"types": [], "modified": 0}
    row["modified"] = now
    data[ident] = row
    _write(kind, data)
    return now


def set_types(kind: str, rel: str, types: list[str]) -> list[str]:
    return list(set_info(kind, rel, types)["types"])


def set_info(
    kind: str,
    rel: str,
    types: list[str],
    prompt: str | None = None,
    negative_prompt: str | None = None,
    notes: str | None = None,
    strength: float | None = None,
    slider: bool | None = None,
) -> dict[str, object]:
    ident = _ident(rel)
    if not ident:
        return _info_out({})
    data = _load(kind)
    row = data.get(ident) or _blank_row()
    row["types"] = _clean_types(types)
    if prompt is not None:
        row["prompt"] = str(prompt).strip()
    if negative_prompt is not None:
        row["negative_prompt"] = str(negative_prompt).strip()
    if notes is not None:
        row["notes"] = str(notes).strip()
    if strength is not None:
        row["strength"] = _strength(strength)
    if slider is not None:
        row["slider"] = bool(slider)
    row["modified"] = int(time.time())
    data[ident] = row
    _write(kind, data)
    return _info_out(row)


def _thumb_paths(kind: str, ident: str) -> list[Path]:
    _migrate()
    base = THUMBS / kind / ident
    return [Path(str(base) + ext) for ext in THUMB_EXTS]


def _iter_thumb_idents(kind: str) -> list[str]:
    folder = THUMBS / kind
    if not folder.is_dir():
        return []
    out: list[str] = []
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(folder).as_posix()
        lower = rel.lower()
        ext = next((item for item in THUMB_EXTS if lower.endswith(item)), "")
        if not ext:
            continue
        ident = _ident(rel[: -len(ext)])
        if ident and ident not in out:
            out.append(ident)
    return out


def _thumb_at(kind: str, ident: str) -> Path | None:
    for path in _thumb_paths(kind, ident):
        if path.is_file():
            return path
    return None


def thumb_file(kind: str, rel: str) -> Path | None:
    ident = _ident(rel)
    if not ident:
        return None
    return _thumb_at(kind, ident)


def _prune_empty(path: Path, stop: Path) -> None:
    try:
        current = path if path.is_dir() else path.parent
        limit = stop.resolve()
        while current.is_dir() and current.resolve() != limit:
            parent = current.parent
            try:
                current.rmdir()
            except OSError:
                return
            current = parent
    except OSError:
        return


def _move_thumb(kind: str, old: str, new: str) -> None:
    src = _thumb_at(kind, old)
    if not src:
        return
    dest = _thumb_at(kind, new)
    if dest is None:
        dest = Path(str(THUMBS / kind / new) + src.suffix)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.resolve() != src.resolve():
            try:
                src.rename(dest)
            except OSError:
                dest.write_bytes(src.read_bytes())
                src.unlink(missing_ok=True)
    elif dest.resolve() != src.resolve():
        src.unlink(missing_ok=True)
    _prune_empty(src.parent, THUMBS / kind)


def reconcile(kind: str, present: list[str]) -> None:
    here = {item.replace("\\", "/").strip().lstrip("/") for item in present}
    here.discard("")
    data = _load(kind)
    stale_thumbs = [ident for ident in _iter_thumb_idents(kind) if ident not in here]
    stale_meta = [key for key in data if key not in here]
    unique = {name for name in {_name(item) for item in here} if len(_hits(sorted(here), name)) == 1}
    if not unique or (not stale_thumbs and not stale_meta):
        return

    changed = False
    for new in sorted(here):
        name = _name(new)
        if name not in unique:
            continue
        old_thumbs = _hits(stale_thumbs, name)
        old_meta = _hits(stale_meta, name)
        if len(old_thumbs) == 1:
            _move_thumb(kind, old_thumbs[0], new)
        if len(old_meta) != 1:
            continue
        old = old_meta[0]
        if old == new:
            continue
        if new not in data:
            data[new] = dict(data[old])
        del data[old]
        changed = True

    if changed:
        _write(kind, data)


def thumb_mtime(kind: str, rel: str) -> int:
    path = thumb_file(kind, rel)
    if not path:
        return 0
    try:
        return int(path.stat().st_mtime)
    except OSError:
        return 0


def thumb_media(path: Path) -> str:
    return _MEDIA.get(path.suffix.lower(), "application/octet-stream")


def save_thumb(kind: str, rel: str, data: bytes) -> int:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    _migrate()
    from PIL import Image

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception as exc:
        raise ValueError("could not read image") from exc
    fmt = (image.format or "").upper()
    ext = _FORMATS.get(fmt)
    if not ext:
        raise ValueError("use png, jpg, or webp")
    if max(image.size) > THUMB_MAX:
        image.thumbnail((THUMB_MAX, THUMB_MAX))
    if fmt == "JPEG" and image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    dest = Path(str(THUMBS / kind / ident) + ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for old in _thumb_paths(kind, ident):
        if old != dest and old.is_file():
            old.unlink()
    out = BytesIO()
    if fmt == "JPEG":
        image.save(out, format=fmt, quality=85)
    else:
        image.save(out, format=fmt)
    dest.write_bytes(out.getvalue())
    touch(kind, rel)
    return int(dest.stat().st_mtime)


def delete_thumb(kind: str, rel: str) -> None:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    for path in _thumb_paths(kind, ident):
        if path.is_file():
            path.unlink()
    touch(kind, rel)
