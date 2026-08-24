#!/usr/bin/env bash
# Torch 2.9.1 + CUDA 13.0

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.9.1 0.24.1 2.9.1 cu130
