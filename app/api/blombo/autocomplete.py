from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from blombo.paths import USER

RELEASE_API = "https://api.github.com/repos/BetaDoggo/danbooru-tag-list/releases/tags/Model-Tags"
DOWNLOAD = "https://github.com/BetaDoggo/danbooru-tag-list/releases/download/Model-Tags/"
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$")
UA = "BlomboUI"


def csv_root() -> Path:
    path = USER / "autocompletion"
    path.mkdir(parents=True, exist_ok=True)
    old = path / "csv"
    if old.is_dir():
        for item in old.iterdir():
            if item.is_file() and NAME_RE.fullmatch(item.name):
                dest = path / item.name
                if not dest.exists():
                    item.replace(dest)
    return path


def _safe_name(raw: str) -> str:
    name = Path(str(raw or "").strip()).name
    if not NAME_RE.fullmatch(name):
        raise ValueError("invalid csv name")
    return name


def _local() -> dict[str, int]:
    out: dict[str, int] = {}
    for path in csv_root().iterdir():
        if not path.is_file() or not NAME_RE.fullmatch(path.name):
            continue
        try:
            out[path.name] = path.stat().st_size
        except OSError:
            out[path.name] = 0
    return out


def _remote() -> list[dict[str, str | int]]:
    req = Request(RELEASE_API, headers={"User-Agent": UA, "Accept": "application/json"}, method="GET")
    with urlopen(req, timeout=20) as res:
        data = json.loads(res.read().decode("utf-8"))
    assets = data.get("assets") if isinstance(data, dict) else None
    if not isinstance(assets, list):
        return []
    out: list[dict[str, str | int]] = []
    for item in assets:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        if not NAME_RE.fullmatch(name):
            continue
        out.append({"name": name, "size": int(item.get("size") or 0)})
    out.sort(key=lambda row: str(row["name"]).lower())
    return out


def list_csv() -> list[dict[str, str | int | bool]]:
    local = _local()
    try:
        remote = _remote()
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        remote = []
    by_name = {str(row["name"]): row for row in remote}
    names = set(by_name) | set(local)
    files: list[dict[str, str | int | bool]] = []
    for name in sorted(names, key=str.lower):
        remote_size = int(by_name.get(name, {}).get("size") or 0)
        files.append(
            {
                "name": name,
                "size": local.get(name, remote_size),
                "downloaded": name in local,
            }
        )
    return files


def download_csv(raw: str) -> dict[str, str | int | bool]:
    name = _safe_name(raw)
    dest = csv_root() / name
    req = Request(DOWNLOAD + name, headers={"User-Agent": UA}, method="GET")
    try:
        with urlopen(req, timeout=120) as res:
            data = res.read()
    except HTTPError as exc:
        raise ValueError(f"download failed ({exc.code})") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ValueError("download failed") from exc
    if not data:
        raise ValueError("empty file")
    dest.write_bytes(data)
    return {"name": name, "size": len(data), "downloaded": True}
