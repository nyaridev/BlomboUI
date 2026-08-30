#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
# shellcheck source=../_ui.sh
. "$ROOT/install/linux/_ui.sh"
# shellcheck source=_pick_slot.sh
. "$ROOT/install/linux/comfyui/_pick_slot.sh"
pick_comfy_slot || exit 1
if [ -z "${COMFY_SLOT:-}" ]; then
  ui_error "No ComfyUI slot was selected."
  exit 1
fi

GIT="${GIT:-git}"
RUNTIME_DIR="$ROOT/runtime"
COMFY_ROOT="$RUNTIME_DIR/comfyui"
COMFY_DIR="$COMFY_ROOT/$COMFY_SLOT/ComfyUI"
PYTHON_DIR="$COMFY_ROOT/$COMFY_SLOT/python_embeded"
PYTHON_CMD="$PYTHON_DIR/python"
UV_ARGS="--no-cache --link-mode=copy"
PIP_ARGS="--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10"

export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=echo
export GIT_LFS_SKIP_SMUDGE=1

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

create_python_wrappers() {
  cat > "$PYTHON_DIR/python" << 'EOL'
#!/usr/bin/env sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -x "$SCRIPT_DIR/bin/python3" ]; then
  exec "$SCRIPT_DIR/bin/python3" "$@"
elif [ -x "$SCRIPT_DIR/bin/python3.12" ]; then
  exec "$SCRIPT_DIR/bin/python3.12" "$@"
else
  echo "Error: No Python binary found in $SCRIPT_DIR/bin" >&2
  exit 1
fi
EOL
  cat > "$PYTHON_DIR/python3" << 'EOL'
#!/usr/bin/env sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -x "$SCRIPT_DIR/bin/python3" ]; then
  exec "$SCRIPT_DIR/bin/python3" "$@"
elif [ -x "$SCRIPT_DIR/bin/python3.12" ]; then
  exec "$SCRIPT_DIR/bin/python3.12" "$@"
else
  echo "Error: No Python binary found in $SCRIPT_DIR/bin" >&2
  exit 1
fi
EOL
  chmod +x "$PYTHON_DIR/python" "$PYTHON_DIR/python3"
}

find_python312() {
  local candidate=""
  local ver=""

  if command -v python3.12 >/dev/null 2>&1; then
    candidate="$(command -v python3.12)"
    ver="$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
    if [ "$ver" = "3.12" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  return 1
}

# -----------------------------------------------------------------------------
# Git
# -----------------------------------------------------------------------------

"$ROOT/install/linux/install_git.sh" quiet || exit 1
if ! command -v "$GIT" >/dev/null 2>&1; then
  ui_error "Git was not found. Install Git or set GIT to its executable path."
  exit 1
fi

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------

mkdir -p "$COMFY_ROOT" || {
  ui_error "Could not create the ComfyUI runtime directory."
  exit 1
}

# -----------------------------------------------------------------------------
# ComfyUI clone
# -----------------------------------------------------------------------------

if [ ! -d "$COMFY_DIR" ]; then
  ui_info "Downloading ComfyUI..."
  if ! "$GIT" clone https://github.com/Comfy-Org/ComfyUI "$COMFY_DIR"; then
    ui_error "ComfyUI download failed."
    exit 1
  fi
  if [ -n "${COMFYUI_REF:-}" ]; then
    ui_info "Checking out ComfyUI $COMFYUI_REF..."
    if ! "$GIT" -C "$COMFY_DIR" fetch --tags origin; then
      ui_error "ComfyUI tag fetch failed."
      exit 1
    fi
    if ! "$GIT" -C "$COMFY_DIR" checkout "$COMFYUI_REF"; then
      ui_error "ComfyUI checkout of $COMFYUI_REF failed."
      exit 1
    fi
  fi
else
  ui_ok "ComfyUI folder already exists. Skipping download."
fi

# -----------------------------------------------------------------------------
# Embedded Python
# -----------------------------------------------------------------------------

if [ -x "$PYTHON_CMD" ]; then
  ui_ok "Embedded Python already exists. Skipping download, requirements, and Torch."
  echo
  ui_ok "ComfyUI files are ready at $COMFY_ROOT"
  ui_info "Other Torch packages can be installed with the scripts in install/linux/comfyui/torch."
  exit 0
fi

BASE_PYTHON312="$(find_python312 || true)"
if [ -z "$BASE_PYTHON312" ]; then
  ui_error "Python 3.12 was not found."
  ui_info "Install Python 3.12 (python3.12 on PATH) and run again."
  exit 1
fi

ui_info "Using existing Python 3.12 for a local venv: $BASE_PYTHON312"
mkdir -p "$PYTHON_DIR"
if ! "$BASE_PYTHON312" -m venv "$PYTHON_DIR"; then
  ui_error "Failed to create Python 3.12 virtual environment."
  exit 1
fi
create_python_wrappers

if [ ! -x "$PYTHON_CMD" ]; then
  ui_error "Embedded Python executable was not found after setup."
  exit 1
fi

ui_info "Installing uv..."
if ! "$PYTHON_CMD" -I -m pip install uv $PIP_ARGS; then
  ui_error "uv installation failed."
  exit 1
fi

# -----------------------------------------------------------------------------
# Requirements
# -----------------------------------------------------------------------------

if [ ! -f "$COMFY_DIR/requirements.txt" ]; then
  ui_error "ComfyUI requirements.txt was not found."
  exit 1
fi

ui_info "Installing ComfyUI requirements..."
if ! "$PYTHON_CMD" -I -m uv pip install -r "$COMFY_DIR/requirements.txt" $UV_ARGS; then
  ui_error "ComfyUI dependency installation failed."
  exit 1
fi

# -----------------------------------------------------------------------------
# Default CUDA Torch
# -----------------------------------------------------------------------------

ui_info "Installing CUDA Torch ${COMFY_TORCH:-2.10.0+cu130}..."
TORCH_SH="$ROOT/install/linux/comfyui/torch/${COMFY_TORCH:-2.10.0+cu130}.sh"
export COMFY_PYTHON="$PYTHON_CMD"
if ! "$TORCH_SH"; then
  ui_error "Default CUDA Torch installation failed."
  exit 1
fi

# -----------------------------------------------------------------------------
# Completion
# -----------------------------------------------------------------------------

echo
ui_ok "ComfyUI files are ready at $COMFY_ROOT"
ui_info "Other Torch packages can be installed with the scripts in install/linux/comfyui/torch."
exit 0
