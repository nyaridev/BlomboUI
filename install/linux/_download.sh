#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Download
# Usage: _download.sh URL OUTFILE
# -----------------------------------------------------------------------------

url="$1"
out="$2"

if [ -z "$url" ] || [ -z "$out" ]; then
  echo "Usage: _download.sh URL OUTFILE" >&2
  exit 1
fi

curl -L --retry 5 --retry-delay 2 -o "$out" "$url"
exit $?
