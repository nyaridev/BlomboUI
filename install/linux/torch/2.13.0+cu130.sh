#!/usr/bin/env bash
# Torch 2.13.0 + CUDA 13.0

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.13.0 0.28.0 2.13.0 cu130
