#!/usr/bin/env bash

# Optional overrides
# PYTHON=
# GIT=
# VENV_DIR=
# COMFYUI_PATH=
# MODELS_ROOT=
# OUTPUTS_ROOT=
# WILDCARDS_ROOT=

COMMANDLINE_ARGS="--uv --hot_reload_vite"

# --uv -> use uv for the project environment and backend dependencies.
# --comfyui-window -> start ComfyUI in a separate process.
# --port N -> BlomboUI UI port (default 5173).
#
# --dev_debug -> show ComfyUI setup and startup logs in this console.
# --api-pings -> show backend access logs (status polls and other API hits).
# --hot_reload_vite -> reload the frontend when UI files change.

COMFYUI_ARGS=""

# Extra arguments forwarded to ComfyUI (main.py).

export COMMANDLINE_ARGS COMFYUI_ARGS
export PYTHON GIT VENV_DIR COMFYUI_PATH MODELS_ROOT OUTPUTS_ROOT WILDCARDS_ROOT
if [ "${BLOMBO_LOAD_SETTINGS_ONLY:-}" = 1 ]; then
  return 0 2>/dev/null || exit 0
fi
"$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/install/webui.sh" "$@"
printf 'Press any key to continue . . . '
read -r -n 1
echo
