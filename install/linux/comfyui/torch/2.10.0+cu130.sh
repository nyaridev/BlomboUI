#!/usr/bin/env bash
# Torch 2.10.0 + CUDA 13.0 (slot default)

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.10.0 0.25.0 2.10.0 cu130
