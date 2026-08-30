#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=_ui.sh
. "$ROOT/install/linux/_ui.sh"

GIT="${GIT:-git}"
COMFY_DIR="${COMFY_DIR:-$ROOT/runtime/comfyui/ComfyUI}"
PYTHON_EXE="${COMFY_PYTHON:-$ROOT/runtime/comfyui/python_embeded/python}"
UV_ARGS="--no-cache --link-mode=copy"

export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=echo
export GIT_LFS_SKIP_SMUDGE=1

# -----------------------------------------------------------------------------
# Node installer
# -----------------------------------------------------------------------------

install_node() {
  local NODE_NAME="$1"
  local NODE_URL="$2"
  local NODE_DIR="$COMFY_DIR/custom_nodes/$NODE_NAME"

  if [ -d "$NODE_DIR" ]; then
    ui_ok "$NODE_NAME already exists. Skipping."
    return 0
  fi

  ui_info "Downloading $NODE_NAME..."
  if ! "$GIT" clone "$NODE_URL" "$NODE_DIR"; then
    ui_error "$NODE_NAME download failed."
    return 1
  fi

  if [ -s "$NODE_DIR/requirements.txt" ]; then
    ui_info "Installing $NODE_NAME requirements..."
    if ! "$PYTHON_EXE" -I -m uv pip install -r "$NODE_DIR/requirements.txt" $UV_ARGS; then
      ui_error "$NODE_NAME dependency installation failed."
      return 1
    fi
  fi

  if [ -f "$NODE_DIR/install.py" ]; then
    ui_info "Running $NODE_NAME installer..."
    if ! (
      cd "$COMFY_DIR" || exit 1
      "$PYTHON_EXE" -I "custom_nodes/$NODE_NAME/install.py"
    ); then
      ui_error "$NODE_NAME installer failed."
      return 1
    fi
  fi

  return 0
}

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------

if [ ! -d "$COMFY_DIR" ]; then
  ui_error "ComfyUI was not found."
  ui_info "Run install/linux/install_comfyui.sh first."
  exit 1
fi

if [ ! -x "$PYTHON_EXE" ]; then
  ui_error "ComfyUI's embedded Python was not found."
  ui_info "Run install/linux/install_comfyui.sh first."
  exit 1
fi

mkdir -p "$COMFY_DIR/custom_nodes" || {
  ui_error "Could not create the ComfyUI custom_nodes directory."
  exit 1
}

"$ROOT/install/linux/install_git.sh" quiet || exit 1
if ! command -v "$GIT" >/dev/null 2>&1; then
  ui_error "Git was not found. Install Git or set GIT to its executable path."
  exit 1
fi

# -----------------------------------------------------------------------------
# Custom nodes
# Add another node by adding one call below.
# -----------------------------------------------------------------------------

install_node "comfyui-manager" "https://github.com/Comfy-Org/ComfyUI-Manager" || exit 1
install_node "rgthree-comfy" "https://github.com/rgthree/rgthree-comfy" || exit 1
install_node "ComfyUI-KJNodes" "https://github.com/kijai/ComfyUI-KJNodes" || exit 1
install_node "ComfyUI-Easy-Use" "https://github.com/yolain/Comfyui-Easy-Use" || exit 1
install_node "ComfyUI-Impact-Pack" "https://github.com/ltdrdata/ComfyUI-Impact-Pack" || exit 1
install_node "ComfyUI-Impact-Subpack" "https://github.com/ltdrdata/ComfyUI-Impact-Subpack" || exit 1
install_node "ComfyUI-RMBG" "https://github.com/1038lab/ComfyUI-RMBG" || exit 1
install_node "ComfyUI-SeedVR2_VideoUpscaler" "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler" || exit 1
install_node "ComfyUI-GGUF" "https://github.com/city96/ComfyUI-GGUF" || exit 1

# -----------------------------------------------------------------------------
# Completion
# -----------------------------------------------------------------------------

echo
ui_ok "ComfyUI custom nodes are ready."
exit 0
