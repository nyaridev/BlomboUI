#!/usr/bin/env bash

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck source=linux/_ui.sh
. "$ROOT/install/linux/_ui.sh"

PYTHON="${PYTHON:-python3}"
GIT="${GIT:-git}"
VENV_DIR="${VENV_DIR:-$ROOT/runtime/.venv}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-4173}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
COMFYUI_HOST="${COMFYUI_HOST:-127.0.0.1}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"
if [ -n "${MODELS_ROOT:-}" ]; then
  MODELS_DIR="${MODELS_DIR:-$MODELS_ROOT}"
else
  MODELS_DIR="${MODELS_DIR:-$ROOT/user/models}"
fi

ALL_ARGS="${COMMANDLINE_ARGS:-} $*"
case " $ALL_ARGS " in
  *" --comfyui-window "*) COMFYUI_SEPARATE_WINDOW=1 ;;
esac
case " $ALL_ARGS " in
  *" --dev_debug "*) DEV_DEBUG=1 ;;
esac
case " $ALL_ARGS " in
  *" --api-pings "*) API_PINGS=1 ;;
esac
case " $ALL_ARGS " in
  *" --hot_reload_vite "*) HOT_RELOAD_VITE=1 ;;
esac
case " $ALL_ARGS " in
  *" --hot_reload_python "*) HOT_RELOAD_PYTHON=1 ;;
esac

flag_value() {
  local dest="$1"
  local flag="$2"
  shift 2
  local take=""
  local arg
  for arg in "$@"; do
    if [ -n "$take" ]; then
      eval "$dest=\$arg"
      return 0
    fi
    if [ "$arg" = "$flag" ]; then
      take=1
      continue
    fi
    case "$arg" in
      "$flag"=*)
        eval "$dest=\${arg#"$flag"=}"
        return 0
        ;;
    esac
  done
}

# shellcheck disable=SC2086
flag_value FRONTEND_PORT --port $ALL_ARGS
# shellcheck disable=SC2086
flag_value COMFYUI_PORT --port $COMFYUI_ARGS
# shellcheck disable=SC2086
flag_value COMFYUI_HOST --listen $COMFYUI_ARGS
case "${COMFYUI_HOST:-}" in
  0.0.0.0|::|"[::]") COMFYUI_HOST=127.0.0.1 ;;
esac
export COMFYUI_HOST COMFYUI_PORT COMFYUI_ARGS

COMFYUI_URL="http://$COMFYUI_HOST:$COMFYUI_PORT"
COMFYUI_LOG="$ROOT/runtime/tmp/comfyui.log"
VENV_PYTHON="$VENV_DIR/bin/python"
COMFY_ROOT="$ROOT/runtime/comfyui"
YAML="$ROOT/runtime/data/extra_model_paths.yaml"
COMFY_OUT="$ROOT/runtime/tmp/comfy-output"
RESTART_FLAG="$ROOT/runtime/tmp/restart"
COMFY_RESTART_FLAG="$ROOT/runtime/tmp/comfy-restart"

if [ -n "${COMFYUI_PATH:-}" ]; then
  COMFY_DIR="$COMFYUI_PATH"
else
  COMFY_DIR="$COMFY_ROOT/ComfyUI"
fi

resolve_comfy_python() {
  COMFY_PYTHON=""
  if [ -x "$COMFY_DIR/../python_embeded/python" ]; then
    COMFY_PYTHON="$(CDPATH= cd -- "$COMFY_DIR/../python_embeded" && pwd)/python"
  elif [ -x "$COMFY_DIR/venv/bin/python" ]; then
    COMFY_PYTHON="$COMFY_DIR/venv/bin/python"
  elif [ -x "$COMFY_DIR/.venv/bin/python" ]; then
    COMFY_PYTHON="$COMFY_DIR/.venv/bin/python"
  elif [ -x "$COMFY_ROOT/python_embeded/python" ]; then
    COMFY_PYTHON="$COMFY_ROOT/python_embeded/python"
  fi
}

resolve_comfy_python

BACKEND_PID=""
FRONTEND_PID=""
COMFY_PID=""
COMFY_OWNED=1

cleanup() {
  trap - INT TERM EXIT
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  if [ -n "$COMFY_PID" ] && [ "$COMFY_OWNED" = 1 ]; then
    kill "$COMFY_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

ui_section "BlomboUI setup"

"$ROOT/install/linux/install_git.sh" || exit $?

ui_section "Project environment"
"$ROOT/install/linux/create_venv.sh" || exit $?

if [ ! -d "$MODELS_DIR" ]; then
  ui_info "Creating models directory..."
  mkdir -p "$MODELS_DIR"
fi
if [ ! -d "$MODELS_DIR" ]; then
  ui_error "Could not create the models directory."
  exit 1
fi
ui_ok "Models directory: $MODELS_DIR"
if [ -z "${MODELS_ROOT:-}" ]; then
  MODELS_ROOT="$MODELS_DIR"
  export MODELS_ROOT
fi

if [ ! -f "$COMFY_DIR/main.py" ]; then
  if [ -n "${COMFYUI_PATH:-}" ]; then
    ui_error "COMFYUI_PATH does not contain ComfyUI."
    ui_info "Missing: $COMFY_DIR/main.py"
    exit 1
  fi
  ui_section "ComfyUI install"
  ui_info "ComfyUI was not found. Installing..."
  "$ROOT/install/linux/install_comfyui.sh" || exit 1
  COMFY_DIR="$COMFY_ROOT/ComfyUI"
  resolve_comfy_python
elif [ -n "${DEV_DEBUG:-}" ]; then
  ui_ok "ComfyUI is already installed."
fi

if [ -z "$COMFY_PYTHON" ]; then
  ui_error "ComfyUI Python was not found."
  ui_info "Run install/linux/install_comfyui.sh, or point COMFYUI_PATH at a portable ComfyUI."
  exit 1
fi

mkdir -p "$ROOT/runtime/tmp" "$COMFY_OUT"
export COMFY_DIR COMFY_PYTHON

if ! "$VENV_PYTHON" "$ROOT/app/launcher/bootstrap.py"; then
  ui_error "Could not write launcher environment files."
  exit 1
fi

if [ -n "${DEV_DEBUG:-}" ]; then
  ui_section "ComfyUI custom nodes"
  "$ROOT/install/linux/install_comfyui_deps.sh" || exit 1
else
  if ! "$ROOT/install/linux/install_comfyui_deps.sh" > "$COMFYUI_LOG" 2>&1; then
    cat "$COMFYUI_LOG"
    exit 1
  fi
fi

if [ -z "${COMFYUI_PATH:-}" ]; then
  if [ -n "${DEV_DEBUG:-}" ]; then
    ui_section "CUDA Torch"
  fi
  if ! "$COMFY_PYTHON" -I -c "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)" >/dev/null 2>&1; then
    ui_warn "CUDA Torch was not found. Installing the default CUDA Torch..."
    "$ROOT/install/linux/torch/2.10.0+cu130 (default).sh" || exit 1
  elif [ -n "${DEV_DEBUG:-}" ]; then
    ui_ok "CUDA Torch is available."
  fi
fi

free_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti ":$port" | xargs -r kill -9 2>/dev/null || true
  fi
}

wait_port() {
  local host="$1"
  local port="$2"
  local i=0
  while [ "$i" -lt 20 ]; do
    i=$((i + 1))
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

start_backend() {
  ui_info "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
  UVICORN_RELOAD=()
  UVICORN_ACCESS=(--no-access-log)
  if [ -n "${HOT_RELOAD_PYTHON:-}" ]; then
    UVICORN_RELOAD=(--reload)
  fi
  if [ -n "${API_PINGS:-}" ]; then
    export BLOMBO_API_PINGS=1
    UVICORN_ACCESS=()
  else
    export BLOMBO_API_PINGS=0
  fi
  (
    cd "$ROOT/app/api" || exit 1
    exec "$VENV_PYTHON" -m uvicorn blombo.main:app "${UVICORN_RELOAD[@]}" "${UVICORN_ACCESS[@]}" --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) &
  BACKEND_PID=$!
  ui_info "Waiting for the backend..."
  if ! wait_port "$BACKEND_HOST" "$BACKEND_PORT"; then
    ui_error "Backend did not start on port $BACKEND_PORT."
    ui_info "Another program may be holding that port. Close it and try again."
    return 1
  fi
  return 0
}

start_frontend() {
  ui_info "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
  if [ -n "${HOT_RELOAD_VITE:-}" ]; then
    export BLOMBO_HOT_RELOAD_VITE=1
  else
    export BLOMBO_HOT_RELOAD_VITE=0
  fi
  (
    cd "$ROOT/app/web" || exit 1
    exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
  ) &
  FRONTEND_PID=$!
}

start_comfy() {
  if [ -n "${COMFYUI_SEPARATE_WINDOW:-}" ]; then
    if [ -n "${DEV_DEBUG:-}" ]; then
      ui_info "Starting ComfyUI in a separate process at $COMFYUI_URL"
    fi
    nohup "$ROOT/install/comfyui.sh" --no-browser >/dev/null 2>&1 &
    disown || true
    COMFY_OWNED=0
    COMFY_PID=""
  elif [ -n "${DEV_DEBUG:-}" ]; then
    ui_info "Starting ComfyUI in the background at $COMFYUI_URL"
    "$ROOT/install/comfyui.sh" --no-browser &
    COMFY_PID=$!
    COMFY_OWNED=1
  else
    "$ROOT/install/comfyui.sh" --log --no-browser &
    COMFY_PID=$!
    COMFY_OWNED=1
  fi
}

clear 2>/dev/null || true
ui_section "Starting BlomboUI"

free_port "$BACKEND_PORT"
free_port "$FRONTEND_PORT"
if [ -z "${COMFYUI_SEPARATE_WINDOW:-}" ]; then
  free_port "$COMFYUI_PORT"
fi
sleep 0.5

start_backend || exit 1
start_frontend
start_comfy

ui_info "Opening BlomboUI in the browser..."
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://$FRONTEND_HOST:$FRONTEND_PORT/" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://$FRONTEND_HOST:$FRONTEND_PORT/" >/dev/null 2>&1 || true
fi

echo
ui_kv "BlomboUI" "http://$FRONTEND_HOST:$FRONTEND_PORT/"
ui_kv "ComfyUI" "$COMFYUI_URL/"
ui_note "Keep this window open while using the app."
if [ -n "${COMFYUI_SEPARATE_WINDOW:-}" ]; then
  ui_note "Closing this window stops the frontend and backend. Stop ComfyUI separately."
else
  ui_note "Closing this window stops the frontend, backend, and ComfyUI."
fi

while true; do
  if [ -f "$RESTART_FLAG" ]; then
    rm -f "$RESTART_FLAG"
    ui_info "Reloading backend and frontend..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    free_port "$BACKEND_PORT"
    free_port "$FRONTEND_PORT"
    sleep 0.5
    start_backend || exit 1
    start_frontend
  fi
  if [ -f "$COMFY_RESTART_FLAG" ] && [ -z "${COMFYUI_SEPARATE_WINDOW:-}" ]; then
    rm -f "$COMFY_RESTART_FLAG"
    ui_info "Reloading ComfyUI..."
    [ -n "$COMFY_PID" ] && kill "$COMFY_PID" 2>/dev/null || true
    free_port "$COMFYUI_PORT"
    sleep 0.5
    start_comfy
  fi
  sleep 1
done
