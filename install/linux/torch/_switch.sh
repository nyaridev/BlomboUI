#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
# shellcheck source=../_ui.sh
. "$ROOT/install/linux/_ui.sh"

PYTHON_EXE="${COMFY_PYTHON:-$ROOT/runtime/comfyui/python_embeded/python}"
PIP_ARGS="--no-cache-dir --no-warn-script-location --no-deps --timeout=1000 --retries 10"

# -----------------------------------------------------------------------------
# Arguments
# -----------------------------------------------------------------------------

if [ -z "${4:-}" ]; then
  ui_error "Usage: _switch.sh torch-version torchvision-version torchaudio-version cuda-tag"
  exit 1
fi

TORCH_VERSION="$1"
TORCHVISION_VERSION="$2"
TORCHAUDIO_VERSION="$3"
CUDA_TAG="$4"

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------

if [ ! -x "$PYTHON_EXE" ]; then
  ui_error "ComfyUI's embedded Python was not found."
  ui_info "Run install/linux/install_comfyui.sh first."
  exit 1
fi

# -----------------------------------------------------------------------------
# Install
# -----------------------------------------------------------------------------

ui_section "Torch $TORCH_VERSION $CUDA_TAG"
ui_info "Installing Torch $TORCH_VERSION with CUDA $CUDA_TAG..."

if ! "$PYTHON_EXE" -I -m pip uninstall torch torchvision torchaudio -y; then
  ui_error "Existing Torch packages could not be removed."
  exit 1
fi

if ! "$PYTHON_EXE" -I -m pip install \
  "torch==$TORCH_VERSION" \
  "torchvision==$TORCHVISION_VERSION" \
  "torchaudio==$TORCHAUDIO_VERSION" \
  --index-url "https://download.pytorch.org/whl/$CUDA_TAG" \
  $PIP_ARGS; then
  ui_error "Torch installation failed."
  exit 1
fi

# -----------------------------------------------------------------------------
# Completion
# -----------------------------------------------------------------------------

echo
ui_ok "Torch $TORCH_VERSION with CUDA $CUDA_TAG is installed."
exit 0
