#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Configuration
# JamePeng vision wheels: https://github.com/JamePeng/llama-cpp-python/releases
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
# shellcheck source=../_ui.sh
. "$ROOT/install/linux/_ui.sh"
# shellcheck source=_pick_slot.sh
. "$ROOT/install/linux/comfyui/_pick_slot.sh"
pick_comfy_slot || exit 1

PYTHON_EXE="${COMFY_PYTHON:-$ROOT/runtime/comfyui/$COMFY_SLOT/python_embeded/python}"
PIP_ARGS="--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10 --use-pep517"

if [ ! -x "$PYTHON_EXE" ]; then
  ui_error "ComfyUI's embedded Python was not found."
  ui_info "Run install/linux/comfyui/install_comfyui.sh first."
  exit 1
fi

if "$PYTHON_EXE" -I -c "from llama_cpp.llama_chat_format import Qwen3VLChatHandler" >/dev/null 2>&1 \
  || "$PYTHON_EXE" -I -c "from llama_cpp.llama_multimodal import Qwen3VLChatHandler" >/dev/null 2>&1; then
  ui_ok "QwenVL GGUF llama-cpp-python is already installed."
  exit 0
fi

PYTHON_VERSION="$("$PYTHON_EXE" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
TORCH_INFO="$("$PYTHON_EXE" -I -c "import torch; v=torch.__version__.split('+')[0]; cv=torch.version.cuda or 'N'; print(v.rsplit('.',1)[0], cv, sep='|')" 2>/dev/null || true)"
TORCH_VERSION="${TORCH_INFO%%|*}"
CUDA_VERSION="${TORCH_INFO#*|}"

ui_info "Python ${PYTHON_VERSION:-unknown}, Torch ${TORCH_VERSION:-unknown}, CUDA ${CUDA_VERSION:-unknown}"

LLAMA_WHL=""
if [ "$PYTHON_VERSION" = "3.12" ] && [ "$CUDA_VERSION" = "12.8" ]; then
  LLAMA_WHL="https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu128-linux-20260831/llama_cpp_python-0.3.49%2Bcu128-cp312-cp312-linux_x86_64.whl"
elif [ "$PYTHON_VERSION" = "3.12" ] && [ "$CUDA_VERSION" = "13.0" ]; then
  LLAMA_WHL="https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu131-linux-20260831/llama_cpp_python-0.3.49%2Bcu131-cp312-cp312-linux_x86_64.whl"
elif [ "$PYTHON_VERSION" = "3.12" ] && [ "$CUDA_VERSION" = "13.1" ]; then
  LLAMA_WHL="https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu131-linux-20260831/llama_cpp_python-0.3.49%2Bcu131-cp312-cp312-linux_x86_64.whl"
fi

if [ -z "$LLAMA_WHL" ]; then
  ui_error "No QwenVL GGUF llama-cpp-python wheel for Python ${PYTHON_VERSION:-unknown}, CUDA ${CUDA_VERSION:-unknown}."
  ui_info "Supported: Python 3.12 with CUDA 12.8, 13.0, or 13.1."
  exit 1
fi

# -----------------------------------------------------------------------------
# Install
# -----------------------------------------------------------------------------

ui_section "QwenVL GGUF"
ui_info "Installing llama-cpp-python with vision handlers..."
"$PYTHON_EXE" -I -m pip uninstall llama-cpp-python -y >/dev/null 2>&1 || true
if ! "$PYTHON_EXE" -I -m pip install --upgrade --force-reinstall --no-deps "$LLAMA_WHL" $PIP_ARGS; then
  ui_error "llama-cpp-python wheel installation failed."
  exit 1
fi
if ! "$PYTHON_EXE" -I -m pip install diskcache typing-extensions jinja2 $PIP_ARGS; then
  ui_error "llama-cpp-python runtime dependencies failed."
  exit 1
fi

if ! "$PYTHON_EXE" -I -c "from llama_cpp.llama_chat_format import Qwen3VLChatHandler" >/dev/null 2>&1 \
  && ! "$PYTHON_EXE" -I -c "from llama_cpp.llama_multimodal import Qwen3VLChatHandler" >/dev/null 2>&1; then
  ui_error "Installed llama-cpp-python is missing Qwen3VLChatHandler."
  exit 1
fi

echo
ui_ok "QwenVL GGUF llama-cpp-python is installed."
exit 0
