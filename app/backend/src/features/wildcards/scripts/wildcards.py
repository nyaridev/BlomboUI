from __future__ import annotations

import os
import random
import re
from pathlib import Path
from typing import Any

from shared import dirs as app_dirs
from config import wildcards_root

# Tags are `__name__` tokens. Surrounding commas are optional.
TAG = re.compile(r"__(\S+?)__")
DEPTH = 20
YAML_EXTS = {".yaml", ".yml"}
TXT_EXT = ".txt"

YamlNode = dict[str, "YamlNode"] | list[str]
_SKIP = {".gitkeep", "desktop.ini"}
_yaml_cache: dict[str, tuple[int, int, dict[str, YamlNode]]] = {}


def iter_tiles(path: Path, rel: str, claimed: dict[str, str] | None = None) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    rel = rel.replace("\\", "/")
    if suffix == TXT_EXT:
        stem = rel[: -len(path.suffix)] if path.suffix else rel
        return [{"tag": stem, "dir": False, "source": rel}]
    if suffix not in YAML_EXTS:
        return []
    parent = rel.rpartition("/")[0]
    out: list[dict[str, Any]] = []
    for name, node in _yaml_tree(path).items():
        key = name.lower()
        if claimed is not None:
            owner = claimed.get(key)
            if owner and owner != rel:
                continue
            claimed[key] = rel
        base = f"{parent}/{name}" if parent else name
        out.extend(_flatten_tiles(base, node, rel))
    return out


def expand(text: str, rng: random.Random, missing: list[str] | None = None) -> str:
    found = missing if missing is not None else []
    index = _index()
    return _expand(text, rng, index, found, 0)


def apply(values: dict[str, Any], rng: random.Random) -> None:
    missing: list[str] = []
    values["prompt_expanded"] = expand(str(values.get("prompt") or ""), rng, missing)
    values["negative_prompt_expanded"] = expand(str(values.get("negative_prompt") or ""), rng, missing)
    values["wildcard_missing"] = missing


def _flatten_tiles(tag: str, node: YamlNode, source: str) -> list[dict[str, Any]]:
    rows = [{"tag": tag, "dir": isinstance(node, dict) and bool(node), "source": source}]
    if isinstance(node, dict):
        for name, child in node.items():
            if name:
                rows.extend(_flatten_tiles(f"{tag}/{name}", child, source))
    return rows


def _expand(
    text: str,
    rng: random.Random,
    index: dict[str, Any],
    missing: list[str],
    depth: int,
) -> str:
    if depth > DEPTH or "__" not in text:
        return text

    def repl(match: re.Match[str]) -> str:
        tag = match.group(1).strip().replace("\\", "/").strip("/")
        line = _pick(tag, rng, index)
        if line is None:
            if tag not in missing:
                missing.append(tag)
            return match.group(0)
        return _expand(line, rng, index, missing, depth + 1)

    return TAG.sub(repl, text)


def _pick(tag: str, rng: random.Random, index: dict[str, Any]) -> str | None:
    key = tag.strip().replace("\\", "/").strip("/").lower()
    if not key:
        return None
    path = index["txt"].get(key)
    if path:
        return _choice(_txt_lines(path), rng)
    node = index["yaml"].get(key)
    if node is not None:
        return _pick_node(node, rng)
    files = index["dirs"].get(key)
    if files:
        return _file_line(rng.choice(files), rng)
    return None


def _pick_node(node: YamlNode, rng: random.Random) -> str:
    if isinstance(node, list):
        return _choice(node, rng)
    if isinstance(node, dict):
        keys = [name for name, child in node.items() if child]
        if not keys:
            return ""
        return _pick_node(node[rng.choice(keys)], rng)
    return ""


def _file_line(path: Path, rng: random.Random) -> str:
    if path.suffix.lower() in YAML_EXTS:
        tree = _yaml_tree(path)
        if not tree:
            return ""
        return _pick_node(tree, rng)
    return _choice(_txt_lines(path), rng)


def _choice(lines: list[str], rng: random.Random) -> str:
    if not lines:
        return ""
    return rng.choice(lines)


def _index() -> dict[str, Any]:
    txt: dict[str, Path] = {}
    yaml_nodes: dict[str, YamlNode] = {}
    dirs: dict[str, list[Path]] = {}
    empty: dict[str, Any] = {"txt": txt, "yaml": yaml_nodes, "dirs": dirs}
    claimed: dict[str, str] = {}
    roots = [wildcards_root(), *app_dirs.extra_named("wildcardDirs").values()]
    for root in roots:
        if not root.is_dir():
            continue
        for path, rel in iter_sources(root):
            suffix = path.suffix.lower()
            stem = rel[: -len(path.suffix)] if path.suffix else rel
            parent = stem.rpartition("/")[0]
            if parent:
                dirs.setdefault(parent.lower(), []).append(path)
            if suffix == TXT_EXT:
                txt.setdefault(stem.lower(), path)
                continue
            tree = _yaml_tree(path)
            if not tree:
                continue
            for name, node in tree.items():
                key = name.lower()
                owner = claimed.get(key)
                if owner and owner != rel:
                    continue
                claimed[key] = rel
                _index_yaml(yaml_nodes, name, node, parent)
    return empty


def iter_sources(root: Path | None = None) -> list[tuple[Path, str]]:
    folder = root or wildcards_root()
    if not folder.is_dir():
        return []
    items: list[tuple[Path, str]] = []
    for current, dirnames, filenames in os.walk(folder):
        dirnames[:] = [name for name in dirnames if name not in _SKIP and not name.startswith(".") and not name.endswith("_data")]
        for name in filenames:
            if name in _SKIP or name.startswith("."):
                continue
            path = Path(current) / name
            if path.suffix.lower() not in {TXT_EXT, *YAML_EXTS}:
                continue
            items.append((path, path.relative_to(folder).as_posix()))
    items.sort(key=lambda row: (row[1].count("/"), row[1].lower()))
    return items


def _index_yaml(out: dict[str, YamlNode], name: str, node: YamlNode, parent: str) -> None:
    bases = [name.lower()]
    if parent:
        bases.append(f"{parent.lower()}/{name.lower()}")

    def walk(prefix: str, current: YamlNode) -> None:
        for base in bases:
            key = f"{base}/{prefix}" if prefix else base
            out[key] = current
        if isinstance(current, dict):
            for child_name, child in current.items():
                next_prefix = f"{prefix}/{child_name.lower()}" if prefix else child_name.lower()
                walk(next_prefix, child)

    walk("", node)


def _txt_lines(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    out: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def drop_yaml_cache(path: Path | None = None) -> None:
    if path is None:
        _yaml_cache.clear()
        return
    _yaml_cache.pop(str(path), None)


def _yaml_tree(path: Path) -> dict[str, YamlNode]:
    try:
        st = path.stat()
        key = str(path)
        hit = _yaml_cache.get(key)
        if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
            return hit[2]
    except OSError:
        st = None
        key = str(path)
    data, err = load_yaml(path)
    if err or mixed_sections(data):
        out: dict[str, YamlNode] = {}
    elif not isinstance(data, dict):
        out = {}
    else:
        out = {}
        for raw_name, body in data.items():
            node = _yaml_node(body)
            if node:
                out[str(raw_name)] = node
    if st is not None:
        _yaml_cache[key] = (st.st_mtime_ns, st.st_size, out)
    return out


def load_yaml(path: Path) -> tuple[object | None, str | None]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return None, str(exc)
    return load_yaml_text(text)


def load_yaml_text(text: str) -> tuple[object | None, str | None]:
    try:
        import yaml
    except ImportError:
        return None, "PyYAML is not installed"
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        msg = str(exc).strip() or "invalid YAML"
        return None, msg.replace('in "<unicode string>", ', "in ")
    return data, None


def yaml_headers(path: Path) -> list[str]:
    if path.suffix.lower() not in YAML_EXTS:
        return []
    return list(_yaml_tree(path))


def file_error(path: Path) -> str | None:
    if path.suffix.lower() not in YAML_EXTS:
        return None
    data, err = load_yaml(path)
    if err:
        return None if err == "PyYAML is not installed" else err
    if data is None:
        return None
    if not isinstance(data, dict):
        return "root value must be a mapping of tag names"
    return mixed_sections(data)


def mixed_sections(data: object, name: str = "root") -> str | None:
    if isinstance(data, list):
        if any(isinstance(item, (dict, list)) for item in data):
            return f"{name} mixes entries and nested sections"
        return None
    if isinstance(data, dict):
        for key, value in data.items():
            err = mixed_sections(value, str(key))
            if err:
                return err
        return None
    return None


def _yaml_node(body: object) -> YamlNode | None:
    if isinstance(body, list):
        lines = _lines(body)
        return lines or None
    if isinstance(body, str):
        line = body.strip()
        return [line] if line else None
    if not isinstance(body, dict):
        return None
    out: dict[str, YamlNode] = {}
    for raw_name, raw in body.items():
        child = _yaml_node(raw)
        if child:
            out[str(raw_name)] = child
    return out or None


def _lines(items: list[object]) -> list[str]:
    out: list[str] = []
    for item in items:
        if item is None:
            continue
        line = str(item).strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out
