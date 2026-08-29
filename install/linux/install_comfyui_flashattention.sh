#!/usr/bin/env bash

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=_ui.sh
. "$ROOT/install/linux/_ui.sh"

PYTHON_EXE="${COMFY_PYTHON:-$ROOT/runtime/comfyui/python_embeded/python}"
PIP_ARGS="--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10 --use-pep517"
FLASH_BASE="https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.7.13"

if [ ! -x "$PYTHON_EXE" ]; then
  ui_error "ComfyUI's embedded Python was not found."
  ui_info "Run install/linux/install_comfyui.sh first."
  exit 1
fi

if "$PYTHON_EXE" -I -c "import flash_attn" >/dev/null 2>&1; then
  ui_ok "FlashAttention is already installed."
  exit 0
fi

PYTHON_VERSION="$("$PYTHON_EXE" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
TORCH_INFO="$("$PYTHON_EXE" -I -c "import torch; v=torch.__version__.split('+')[0]; cv=torch.version.cuda or 'N'; print(v.rsplit('.',1)[0], cv, sep='|')" 2>/dev/null || true)"
TORCH_VERSION="${TORCH_INFO%%|*}"
CUDA_VERSION="${TORCH_INFO#*|}"

ui_info "Python ${PYTHON_VERSION:-unknown}, Torch ${TORCH_VERSION:-unknown}, CUDA ${CUDA_VERSION:-unknown}"

FLASH_WHL=""
if [ "$PYTHON_VERSION" = "3.12" ] && [ "$TORCH_VERSION" = "2.7" ] && [ "$CUDA_VERSION" = "12.8" ]; then
  FLASH_WHL="$FLASH_BASE/flash_attn-2.8.3+cu128torch2.7-cp312-cp312-linux_x86_64.whl"
elif [ "$PYTHON_VERSION" = "3.12" ] && [ "$TORCH_VERSION" = "2.8" ] && [ "$CUDA_VERSION" = "12.8" ]; then
  FLASH_WHL="$FLASH_BASE/flash_attn-2.8.3+cu128torch2.8-cp312-cp312-linux_x86_64.whl"
elif [ "$PYTHON_VERSION" = "3.12" ] && [ "$TORCH_VERSION" = "2.9" ] && [ "$CUDA_VERSION" = "13.0" ]; then
  FLASH_WHL="$FLASH_BASE/flash_attn-2.8.3+cu130torch2.9-cp312-cp312-linux_x86_64.whl"
elif [ "$PYTHON_VERSION" = "3.12" ] && [ "$TORCH_VERSION" = "2.10" ] && [ "$CUDA_VERSION" = "13.0" ]; then
  FLASH_WHL="$FLASH_BASE/flash_attn-2.8.3+cu130torch2.10-cp312-cp312-linux_x86_64.whl"
fi

if [ -z "$FLASH_WHL" ]; then
  ui_error "No FlashAttention wheel for Python ${PYTHON_VERSION:-unknown}, Torch ${TORCH_VERSION:-unknown}, CUDA ${CUDA_VERSION:-unknown}."
  ui_info "Supported: Python 3.12 with Torch 2.7/2.8 + CUDA 12.8, or Torch 2.9/2.10 + CUDA 13.0."
  exit 1
fi

ui_section "FlashAttention"
if ! "$PYTHON_EXE" -I -c "import triton" >/dev/null 2>&1; then
  ui_info "Installing Triton..."
  if ! "$PYTHON_EXE" -I -m pip install triton $PIP_ARGS; then
    ui_error "Triton installation failed."
    exit 1
  fi
fi

ui_info "Installing FlashAttention 2.8.3..."
"$PYTHON_EXE" -I -m pip uninstall flash-attn -y >/dev/null 2>&1 || true
if ! "$PYTHON_EXE" -I -m pip install "$FLASH_WHL" $PIP_ARGS; then
  ui_error "FlashAttention installation failed."
  exit 1
fi

echo
ui_ok "FlashAttention is installed."
exit 0
