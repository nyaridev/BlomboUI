#!/usr/bin/env bash
# Torch 2.11.0 + CUDA 13.0 (default)

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.11.0 0.26.0 2.11.0 cu130
