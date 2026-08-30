#!/usr/bin/env bash
# Torch 2.7.1 + CUDA 12.8

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$SCRIPT_DIR/_switch.sh" 2.7.1 0.22.1 2.7.1 cu128
