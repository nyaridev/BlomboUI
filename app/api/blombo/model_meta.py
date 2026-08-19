from __future__ import annotations

import json
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


def _row(raw: object) -> dict:
    if isinstance(raw, list):
        return {"types": _clean_types(raw), "modified": 0}
    if isinstance(raw, dict):
        try:
            stamp = int(raw.get("modified") or 0)
        except (TypeError, ValueError):
            stamp = 0
        return {"types": _clean_types(raw.get("types")), "modified": max(0, stamp)}
    return {"types": [], "modified": 0}


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
            if row["types"] or row["modified"]:
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
        if out:
            packed[key] = out
    path.write_text(json.dumps(packed, indent=2) + "\n", encoding="utf-8")


def _name(rel: str) -> str:
    return Path(rel).name.lower()


def _hits(idents: list[str] | dict[str, object], name: str) -> list[str]:
    keys = idents if isinstance(idents, list) else list(idents)
    return [key for key in keys if _name(key) == name]


def get_types(kind: str, rel: str) -> list[str]:
    ident = _ident(rel)
    if not ident:
        return []
    return list(_load(kind).get(ident, {}).get("types", []))


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
    ident = _ident(rel)
    if not ident:
        return []
    clean = _clean_types(types)
    data = _load(kind)
    row = data.get(ident) or {"types": [], "modified": 0}
    row["types"] = clean
    row["modified"] = int(time.time())
    data[ident] = row
    _write(kind, data)
    return clean


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
        if ident:
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


def _copy_thumb(kind: str, old: str, new: str) -> None:
    src = _thumb_at(kind, old)
    if not src or _thumb_at(kind, new):
        return
    dest = Path(str(THUMBS / kind / new) + src.suffix)
    if dest.resolve() == src.resolve():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(src.read_bytes())


def reconcile(kind: str, present: list[str]) -> None:
    here = {item.replace("\\", "/").strip().lstrip("/") for item in present}
    data = _load(kind)
    stale = {key for key in data if key not in here}
    stale.update(ident for ident in _iter_thumb_idents(kind) if ident not in here)
    need = [rel for rel in sorted(here) if rel not in data and not _thumb_at(kind, rel)]
    if not stale or not need:
        return

    changed = False
    for new in need:
        olds = _hits(sorted(stale), _name(new))
        if len(olds) != 1:
            continue
        if len(_hits(need, _name(new))) != 1:
            continue
        old = olds[0]
        if old in data:
            data[new] = {
                "types": list(data[old].get("types", [])),
                "modified": int(data[old].get("modified") or 0),
            }
            changed = True
        _copy_thumb(kind, old, new)

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
    ext = _FORMATS.get((image.format or "").upper())
    if not ext:
        raise ValueError("use png, jpg, or webp")
    dest = Path(str(THUMBS / kind / ident) + ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for old in _thumb_paths(kind, ident):
        if old != dest and old.is_file():
            old.unlink()
    dest.write_bytes(data)
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
