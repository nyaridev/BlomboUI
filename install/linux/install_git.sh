#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=_ui.sh
. "$ROOT/install/linux/_ui.sh"

GIT="${GIT:-git}"
GIT_QUIET=""
if [ "${1:-}" = "quiet" ]; then
  GIT_QUIET=1
fi

# -----------------------------------------------------------------------------
# Git check
# -----------------------------------------------------------------------------

if command -v "$GIT" >/dev/null 2>&1; then
  if [ -z "$GIT_QUIET" ]; then
    ui_section "Git"
    ui_ok "Git is already installed."
  fi
  exit 0
fi

# -----------------------------------------------------------------------------
# Install
# -----------------------------------------------------------------------------

ui_section "Git"
ui_error "Git was not found."
ui_info "Install Git with your package manager and run again."
exit 1
