#!/usr/bin/env bash

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=_ui.sh
. "$ROOT/install/linux/_ui.sh"

PYTHON="${PYTHON:-python3}"
GIT="${GIT:-git}"
if [ -z "${VENV_DIR:-}" ]; then
  VENV_DIR="$ROOT/runtime/.venv"
fi

if ! command -v uv >/dev/null 2>&1; then
  ui_error "uv was not found on PATH."
  ui_info "Install uv before creating the project environment."
  exit 1
fi

export UV_PROJECT_ENVIRONMENT="$VENV_DIR"

if ! cd "$ROOT/app/api"; then
  ui_error "Backend project directory was not found."
  exit 1
fi

if [ -f "$VENV_DIR/pyvenv.cfg" ] && grep -qi "python_embedded" "$VENV_DIR/pyvenv.cfg"; then
  ui_info "Replacing the previous embedded Python environment..."
  if ! uv venv --no-project --clear --python "$PYTHON" "$VENV_DIR"; then
    ui_error "Project environment setup failed."
    exit 1
  fi
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  ui_info "Creating the project environment with $PYTHON..."
  if ! uv venv --no-project --python "$PYTHON" "$VENV_DIR"; then
    ui_error "Project environment setup failed."
    exit 1
  fi
else
  ui_ok "Existing virtual environment found."
fi

ui_info "Installing locked backend dependencies..."
if ! uv sync --frozen; then
  ui_error "Project environment setup failed."
  exit 1
fi

cd "$ROOT" || exit 1

ui_info "Installing frontend dependencies..."
if [ ! -f "$ROOT/app/web/package.json" ]; then
  ui_error "Frontend is missing: app/web/package.json"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  ui_error "Node.js / npm was not found on PATH."
  ui_info "Install Node.js LTS and run again."
  exit 1
fi
if [ ! -d "$ROOT/app/web/node_modules" ]; then
  if ! (cd "$ROOT/app/web" && npm install); then
    ui_error "Frontend dependency installation failed."
    exit 1
  fi
else
  ui_ok "Frontend dependencies already installed."
fi

echo
ui_ok "Project environment is ready at $VENV_DIR"
exit 0
