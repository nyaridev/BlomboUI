#!/usr/bin/env bash
# Spawn ComfyUI's Python in a new terminal (same argv as windows/start_comfy_window.ps1).
# Exit 0: a terminal emulator was launched (caller does not own the process).
# Exit 2: no emulator; exec python so the caller can background this script.

python="$1"
comfy_dir="$2"
listen_host="$3"
port="$4"
out_dir="$5"
yaml="$6"
models_dir="$7"
shift 7
extra_args=("$@")

if [ ! -x "$python" ] || [ ! -d "$comfy_dir" ]; then
  exit 1
fi

cmd=(
  "$python" -I -u main.py
  --listen "$listen_host"
  --port "$port"
  --disable-auto-launch
  --preview-method auto
  --output-directory "$out_dir"
)
if [ -n "$yaml" ] && [ -f "$yaml" ]; then
  cmd+=(--extra-model-paths-config "$yaml")
elif [ -n "$models_dir" ]; then
  cmd+=(--models-directory "$models_dir")
fi
if [ "${#extra_args[@]}" -gt 0 ]; then
  cmd+=("${extra_args[@]}")
fi

if command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal --title="BlomboUI ComfyUI" --working-directory="$comfy_dir" -- "${cmd[@]}"
  exit 0
fi
if command -v konsole >/dev/null 2>&1; then
  konsole --workdir "$comfy_dir" -e "${cmd[@]}" &
  exit 0
fi
if command -v xfce4-terminal >/dev/null 2>&1; then
  xfce4-terminal --title="BlomboUI ComfyUI" --working-directory="$comfy_dir" -e "${cmd[*]}" &
  exit 0
fi
if command -v xterm >/dev/null 2>&1; then
  xterm -T "BlomboUI ComfyUI" -e bash -c 'cd "$1" && shift && exec "$@"' bash "$comfy_dir" "${cmd[@]}" &
  exit 0
fi
if command -v x-terminal-emulator >/dev/null 2>&1; then
  x-terminal-emulator -e bash -c 'cd "$1" && shift && exec "$@"' bash "$comfy_dir" "${cmd[@]}" &
  exit 0
fi

cd "$comfy_dir" || exit 1
exec "${cmd[@]}"
