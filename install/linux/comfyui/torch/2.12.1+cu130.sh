#!/usr/bin/env bash
# Torch 2.12.1 + CUDA 13.0

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.12.1 0.27.1 2.12.1 cu130
