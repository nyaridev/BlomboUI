"""Write launcher-env.json and extra_model_paths.yaml for the bat/sh launchers."""

from __future__ import annotations

from bootstrap.env import ensure_dirs, resolve, write_extra_model_paths, write_launcher_env


def main() -> int:
    ensure_dirs()
    settings = resolve()
    write_launcher_env(settings)
    write_extra_model_paths()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
