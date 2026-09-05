from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from shared import dirs
from features.models.scripts import catalog
from features.models.scripts import hashes
from features.models.scripts import model_meta
from features.models.scripts import models
from config import wildcards_root
from features.wildcards.scripts.wildcards import YAML_EXTS, drop_yaml_cache, load_yaml, load_yaml_text, mixed_sections

TXT_EXT = ".txt"
WILDCARD_EXTS = {TXT_EXT, *YAML_EXTS}
_SKIP = {".gitkeep", "desktop.ini"}
_FILE_NAME = re.compile(r"^[A-Za-z0-9._ -]+$")


def _leaf_stem(name: str) -> str:
    path = Path(name)
    if path.suffix.lower() in WILDCARD_EXTS:
        return path.stem.casefold()
    return name.casefold()


def _same_entry(left: Path, right: Path) -> bool:
    try:
        return left.resolve() == right.resolve()
    except OSError:
        return False


def _require_unique(parent: Path, leaf: str, skip: Path | None = None) -> None:
    stem = _leaf_stem(leaf)
    if not stem:
        return
    try:
        entries = list(parent.iterdir())
    except OSError:
        return
    for entry in entries:
        if skip is not None and _same_entry(entry, skip):
            continue
        if entry.name in _SKIP or entry.name.startswith("."):
            continue
        if _leaf_stem(entry.name) == stem:
            raise WildcardError(f"{entry.name} already exists")


class WildcardError(ValueError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def tree() -> dict[str, Any]:
    roots: list[dict[str, Any]] = []
    for item in dirs.listed_dirs("wildcardDirs"):
        name = item["name"]
        if item["id"] == dirs.LOCAL_ID:
            folder = wildcards_root()
            prefix = ""
        else:
            folder = Path(item["path"]) if item["path"] else None
            prefix = name
        children = _walk(folder, prefix) if folder is not None else []
        roots.append({"name": name, "path": prefix, "kind": "dir", "children": children})
    return {"roots": roots}


def read_file(rel: str) -> dict[str, Any]:
    path = _existing_file(rel)
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8", errors="replace")
    if suffix == TXT_EXT:
        return {"path": rel, "format": "txt", "lines": text.splitlines()}
    if suffix not in YAML_EXTS:
        raise WildcardError("unsupported file type")
    data, err = load_yaml(path)
    if err:
        return {"path": rel, "format": "yaml", "error": err, "text": text}
    if data is None:
        return {"path": rel, "format": "yaml", "tree": {}, "text": text}
    if not isinstance(data, dict):
        return {"path": rel, "format": "yaml", "error": "root value must be a mapping of tag names", "text": text}
    mix = mixed_sections(data)
    if mix:
        return {"path": rel, "format": "yaml", "error": mix, "text": text}
    return {"path": rel, "format": "yaml", "tree": _editor_map(data), "text": text}


def write_file(rel: str, body: dict[str, Any]) -> dict[str, Any]:
    path = _existing_file(rel)
    suffix = path.suffix.lower()
    if suffix == TXT_EXT:
        lines = body.get("lines")
        if not isinstance(lines, list) or any(not isinstance(item, str) for item in lines):
            raise WildcardError("txt files need a list of lines")
        _write_text(path, "\n".join(lines))
    elif suffix in YAML_EXTS:
        raw = body.get("text")
        if isinstance(raw, str):
            _write_text(path, raw)
        else:
            node = body.get("tree")
            if not isinstance(node, dict) or not _valid_node(node):
                raise WildcardError("yaml files need a mapping of sections")
            _write_text(path, _dump_yaml(node))
    else:
        raise WildcardError("unsupported file type")
    drop_yaml_cache(path)
    models.reload_kind("wildcards")
    return read_file(rel)


def create_file(folder: str, name: str) -> dict[str, Any]:
    filename = str(name or "").strip()
    if not _FILE_NAME.match(filename) or Path(filename).suffix.lower() not in WILDCARD_EXTS:
        raise WildcardError("name must be a .txt, .yaml, or .yml file")
    parent = _resolve(folder)
    if parent is None or not parent.is_dir():
        raise WildcardError("folder not found", 404)
    path = parent / filename
    _require_unique(parent, filename)
    if path.exists():
        raise WildcardError("file already exists")
    rel = _join(folder, filename)
    if path.suffix.lower() in YAML_EXTS:
        stem = path.stem or "wildcard"
        _write_text(path, _dump_yaml({stem: {}}))
    else:
        path.write_text("", encoding="utf-8")
    models.reload_kind("wildcards")
    return {"path": rel, **read_file(rel)}


def create_folder(folder: str, name: str) -> dict[str, str]:
    leaf = str(name or "").strip()
    if not _FILE_NAME.match(leaf):
        raise WildcardError("invalid name")
    if Path(leaf).suffix.lower() in WILDCARD_EXTS:
        leaf = Path(leaf).stem
    parent = _resolve(folder)
    if parent is None or not parent.is_dir():
        raise WildcardError("folder not found", 404)
    path = parent / leaf
    _require_unique(parent, leaf)
    if path.exists():
        raise WildcardError("already exists")
    path.mkdir()
    return {"path": _join(folder, leaf), "kind": "dir"}


def reveal(rel: str) -> None:
    path = _entry(rel)
    if sys.platform != "win32":
        raise WildcardError("open folder is only supported on Windows")
    resolved = str(path.resolve())
    if path.is_file():
        subprocess.Popen(["explorer", "/select,", resolved])
        return
    os.startfile(resolved)


def move_entry(rel: str, folder: str) -> dict[str, str]:
    if _is_root(rel):
        raise WildcardError("cannot move a root folder")
    source = _entry(rel)
    dest_parent = _resolve(folder)
    if dest_parent is None or not dest_parent.is_dir():
        raise WildcardError("folder not found", 404)
    if source.is_dir():
        try:
            dest_parent.resolve().relative_to(source.resolve())
        except ValueError:
            pass
        else:
            raise WildcardError("cannot move a folder into itself")
    dest = dest_parent / source.name
    _require_unique(dest_parent, source.name, source)
    sidecar_src = source if source.is_file() else None
    pairs = hashes.move_pairs(source, dest)
    _relocate(source, dest)
    if sidecar_src is not None and dest.is_file():
        from features.models.scripts import model_sidecar

        model_sidecar.relocate_sidecar(sidecar_src, dest)
    nxt = _join(folder, source.name)
    if nxt != rel:
        model_meta.remap_ident("wildcards", rel, nxt)
        hashes.remap_moved(source, dest, pairs)
        catalog.relocate("wildcards", rel, nxt)
    return {"path": nxt, "kind": "dir" if dest.is_dir() else "file"}


def rename_entry(rel: str, name: str) -> dict[str, str]:
    if _is_root(rel):
        raise WildcardError("cannot rename a root folder")
    source = _entry(rel)
    leaf = _clean_name(name, source.is_file(), source.suffix)
    dest = source.with_name(leaf)
    _require_unique(source.parent, leaf, source)
    sidecar_src = source if source.is_file() else None
    pairs = hashes.move_pairs(source, dest)
    _relocate(source, dest)
    if sidecar_src is not None and dest.is_file():
        from features.models.scripts import model_sidecar

        model_sidecar.relocate_sidecar(sidecar_src, dest)
    nxt = _join(_parent_rel(rel), leaf)
    if nxt != rel:
        model_meta.remap_ident("wildcards", rel, nxt)
        hashes.remap_moved(source, dest, pairs)
        catalog.relocate("wildcards", rel, nxt)
    return {"path": nxt, "kind": "dir" if dest.is_dir() else "file"}


def format_editor(tree: dict[str, Any] | None, text: str | None) -> dict[str, Any]:
    if text is not None:
        data, err = load_yaml_text(text)
        if err:
            return {"error": err, "text": text}
        if data is None:
            return {"tree": {}, "text": text}
        if not isinstance(data, dict):
            return {"error": "root value must be a mapping of tag names", "text": text}
        mix = mixed_sections(data)
        if mix:
            return {"error": mix, "text": text}
        return {"tree": _editor_map(data), "text": text}
    if tree is None or not _valid_node(tree):
        raise WildcardError("yaml files need a mapping of sections")
    return {"text": _dump_yaml(tree), "tree": tree}


def _walk(folder: Path | None, prefix: str) -> list[dict[str, Any]]:
    if folder is None or not folder.is_dir():
        return []
    try:
        entries = list(folder.iterdir())
    except OSError:
        return []
    dirs_out: list[dict[str, Any]] = []
    files_out: list[dict[str, Any]] = []
    for entry in entries:
        name = entry.name
        if name in _SKIP or name.startswith(".") or name.endswith("_data"):
            continue
        rel = _join(prefix, name)
        if entry.is_dir():
            dirs_out.append({"name": name, "path": rel, "kind": "dir", "children": _walk(entry, rel)})
        elif entry.is_file() and entry.suffix.lower() in WILDCARD_EXTS:
            files_out.append({"name": name, "path": rel, "kind": "file"})
    dirs_out.sort(key=lambda node: node["name"].casefold())
    files_out.sort(key=lambda node: node["name"].casefold())
    return dirs_out + files_out


def _existing_file(rel: str) -> Path:
    path = _entry(rel)
    if not path.is_file() or path.suffix.lower() not in WILDCARD_EXTS:
        raise WildcardError("file not found", 404)
    return path


def _entry(rel: str) -> Path:
    path = _resolve(rel)
    if path is None or not path.exists():
        raise WildcardError("not found", 404)
    if path.name in _SKIP or path.name.startswith("."):
        raise WildcardError("unsupported")
    return path


def _is_root(rel: str) -> bool:
    name = str(rel or "").replace("\\", "/").strip("/")
    if not name:
        return True
    if not name:
        return True
    return dirs.extra_root("wildcardDirs", name) is not None and "/" not in name


def _parent_rel(rel: str) -> str:
    name = str(rel or "").replace("\\", "/").strip("/")
    if "/" not in name:
        return ""
    return name.rpartition("/")[0]


def _clean_name(raw: str, is_file: bool, suffix: str) -> str:
    name = str(raw or "").strip()
    if not _FILE_NAME.match(name):
        raise WildcardError("invalid name")
    if is_file:
        if Path(name).suffix.lower() not in WILDCARD_EXTS:
            name = f"{name}{suffix}"
        if Path(name).suffix.lower() not in WILDCARD_EXTS:
            raise WildcardError("name must be a .txt, .yaml, or .yml file")
    return name


def _relocate(source: Path, dest: Path) -> None:
    if dest.exists():
        try:
            same = dest.resolve() == source.resolve()
        except OSError:
            same = False
        if not same:
            raise WildcardError("already exists")
        if source.name == dest.name:
            return
        tmp = source.with_name(f".{source.name}.tmp")
        n = 0
        while tmp.exists():
            n += 1
            tmp = source.with_name(f".{source.name}.{n}.tmp")
        source.rename(tmp)
        tmp.rename(dest)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(dest))


def _resolve(rel: str) -> Path | None:
    name = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if ".." in Path(name).parts:
        return None
    if ".." in Path(name).parts:
        return None
    if not name:
        return wildcards_root()
    first, _, rest = name.partition("/")
    extra = dirs.extra_root("wildcardDirs", first)
    if extra is not None:
        return extra / rest if rest else extra
    return wildcards_root() / name


def _join(prefix: str, name: str) -> str:
    return f"{prefix}/{name}" if prefix else name


def _write_text(path: Path, text: str) -> None:
    if text and not text.endswith("\n"):
        text += "\n"
    path.write_text(text, encoding="utf-8")


def _dump_yaml(tree: dict[str, Any]) -> str:
    try:
        import yaml
    except ImportError as exc:
        raise WildcardError("PyYAML is not installed") from exc

    class IndentDumper(yaml.SafeDumper):
        def increase_indent(self, flow=False, indentless=False):
            return super().increase_indent(flow, False)

    return yaml.dump(
        tree,
        Dumper=IndentDumper,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=4096,
    )


def _editor_map(data: dict[object, object]) -> dict[str, Any]:
    return {str(key): _editor_node(value) for key, value in data.items()}


def _editor_node(body: object) -> Any:
    if body is None:
        return {}
    if isinstance(body, list):
        return ["" if item is None else str(item) for item in body]
    if isinstance(body, dict):
        return _editor_map(body)
    return [str(body)]


def _valid_node(node: object) -> bool:
    if isinstance(node, list):
        return all(isinstance(item, str) for item in node)
    if isinstance(node, dict):
        return all(isinstance(key, str) and _valid_node(value) for key, value in node.items())
    return False
