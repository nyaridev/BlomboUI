from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Sequence

import yaml


DEFAULT_INPUT = (
    Path(__file__).resolve().parents[3] / "user" / "wildcards" / "anima_styles.yaml"
)


def normalize_key(artist: str) -> str:
    """Convert an artist name into a section key with single underscores."""
    return re.sub(r"_+", "_", re.sub(r"\s+", "_", artist.strip()))


def read_entries(path: Path) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    seen: dict[str, int] = {}

    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8-sig").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line:
            continue
        if not line.startswith("@"):
            raise ValueError(
                f"{path}:{line_number}: expected an artist entry beginning with '@'"
            )

        artist = line[1:].strip()
        if not artist:
            raise ValueError(f"{path}:{line_number}: artist name is empty")

        key = normalize_key(artist)
        if not key:
            raise ValueError(f"{path}:{line_number}: normalized section key is empty")
        if key in seen:
            raise ValueError(
                f"{path}:{line_number}: normalized key {key!r} duplicates "
                f"line {seen[key]}"
            )

        seen[key] = line_number
        entries.append((key, line))

    if not entries:
        raise ValueError(f"{path}: no artist entries found")
    return entries


def render_yaml(entries: list[tuple[str, str]]) -> str:
    data = {
        "anima_styles": {
            key: [value]
            for key, value in entries
        }
    }

    class IndentDumper(yaml.SafeDumper):
        def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
            return super().increase_indent(flow, False)

    return yaml.dump(
        data,
        Dumper=IndentDumper,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=4096,
    )


def convert(input_path: Path, output_path: Path) -> int:
    entries = read_entries(input_path)
    output_path.write_text(render_yaml(entries), encoding="utf-8")
    return len(entries)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert a flat anima_styles artist list into nested YAML."
    )
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT,
        help="flat source file; defaults to user/wildcards/anima_styles.yaml",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="destination file; defaults to replacing the input file",
    )
    args = parser.parse_args(argv)

    input_path = args.input.resolve()
    output_path = (args.output or args.input).resolve()
    try:
        count = convert(input_path, output_path)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"Converted {count} anima styles to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
