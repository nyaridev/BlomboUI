#!/usr/bin/env bash

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=linux/_ui.sh
. "$ROOT/install/linux/_ui.sh"

if [ -f "$ROOT/webui-user.sh" ]; then
  BLOMBO_LOAD_SETTINGS_ONLY=1
  # shellcheck source=../webui-user.sh
  . "$ROOT/webui-user.sh"
  unset BLOMBO_LOAD_SETTINGS_ONLY
fi

COMFYUI_HOST="${COMFYUI_HOST:-127.0.0.1}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"

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
flag_value COMFYUI_PORT --port $COMFYUI_ARGS
# shellcheck disable=SC2086
flag_value COMFYUI_HOST --listen $COMFYUI_ARGS
case "${COMFYUI_HOST:-}" in
  0.0.0.0|::|"[::]") COMFYUI_HOST=127.0.0.1 ;;
esac
if [ -n "${MODELS_ROOT:-}" ]; then
  MODELS_ROOT="${MODELS_ROOT#\"}"
  MODELS_ROOT="${MODELS_ROOT%\"}"
  MODELS_DIR="${MODELS_DIR:-$MODELS_ROOT}"
else
  MODELS_DIR="${MODELS_DIR:-$ROOT/user/models}"
fi
MODELS_DIR="${MODELS_DIR#\"}"
MODELS_DIR="${MODELS_DIR%\"}"
export COMFYUI_MODEL_PATH="$MODELS_DIR"
COMFY_ROOT="${COMFY_ROOT:-$ROOT/runtime/comfyui}"
if [ -z "${COMFY_DIR:-}" ]; then
  # shellcheck source=linux/comfyui/_pick_slot.sh
  . "$ROOT/install/linux/comfyui/_pick_slot.sh"
  pick_comfy_slot selected || exit 1
fi
if [ -z "${COMFY_PYTHON:-}" ]; then
  if [ -x "$COMFY_DIR/../python_embeded/python" ]; then
    COMFY_PYTHON="$(CDPATH= cd -- "$COMFY_DIR/../python_embeded" && pwd)/python"
  elif [ -x "$COMFY_DIR/venv/bin/python" ]; then
    COMFY_PYTHON="$COMFY_DIR/venv/bin/python"
  elif [ -x "$COMFY_DIR/.venv/bin/python" ]; then
    COMFY_PYTHON="$COMFY_DIR/.venv/bin/python"
  else
    COMFY_PYTHON="$COMFY_ROOT/python_embeded/python"
  fi
fi
COMFYUI_URL="http://$COMFYUI_HOST:$COMFYUI_PORT"
YAML="$ROOT/runtime/data/extra_model_paths.yaml"
COMFY_OUT="$ROOT/runtime/tmp/comfy-output"
COMFYUI_LOG=""
COMFYUI_NO_BROWSER=""

for arg in "$@"; do
  case "$arg" in
    --log) COMFYUI_LOG="$ROOT/runtime/tmp/comfyui.log" ;;
    --no-browser) COMFYUI_NO_BROWSER=1 ;;
  esac
done

if [ -n "$COMFYUI_NO_BROWSER" ]; then
  COMFYUI_LAUNCH="--disable-auto-launch"
else
  COMFYUI_LAUNCH="--auto-launch"
fi

if [ ! -x "$COMFY_PYTHON" ]; then
  ui_error "ComfyUI's Python was not found."
  ui_info "Run webui-user.sh first, or install/linux/comfyui/install_comfyui.sh."
  exit 1
fi

if [ ! -f "$COMFY_DIR/main.py" ]; then
  ui_error "ComfyUI was not found."
  ui_info "Run webui-user.sh first, or install/linux/comfyui/install_comfyui.sh."
  exit 1
fi

mkdir -p "$MODELS_DIR" "$COMFY_OUT" || {
  ui_error "Could not create the models directory."
  exit 1
}

if [ -z "$COMFYUI_LOG" ]; then
  ui_section "ComfyUI"
  ui_info "Listening on $COMFYUI_URL"
  ui_info "Models directory: $MODELS_DIR"
fi

cd "$COMFY_DIR" || exit 1
COMFY_ARGS=(--listen "$COMFYUI_HOST" --port "$COMFYUI_PORT" $COMFYUI_LAUNCH --preview-method auto --output-directory "$COMFY_OUT" --models-directory "$MODELS_DIR")
if [ -f "$YAML" ]; then
  COMFY_ARGS+=(--extra-model-paths-config "$YAML")
fi
# shellcheck disable=SC2206
if [ -n "${COMFYUI_ARGS:-}" ]; then
  EXTRA=( $COMFYUI_ARGS )
  COMFY_ARGS+=("${EXTRA[@]}")
fi

if [ -n "$COMFYUI_LOG" ]; then
  mkdir -p "$ROOT/runtime/tmp"
  exec "$COMFY_PYTHON" -I -W "ignore::FutureWarning" -u main.py "${COMFY_ARGS[@]}" > "$COMFYUI_LOG" 2>&1
else
  exec "$COMFY_PYTHON" -I -W "ignore::FutureWarning" -u main.py "${COMFY_ARGS[@]}"
fi
