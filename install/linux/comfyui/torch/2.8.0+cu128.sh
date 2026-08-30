#!/usr/bin/env bash
# Torch 2.8.0 + CUDA 12.8

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.8.0 0.23.0 2.8.0 cu128
