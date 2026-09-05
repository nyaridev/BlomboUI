# shellcheck shell=bash
# Source from install scripts. Sets COMFY_SLOT, COMFY_DIR, COMFY_PYTHON, COMFYUI_REF, COMFY_TORCH.
#   pick_comfy_slot            prompt (Enter = last)
#   pick_comfy_slot selected   last slot only; prompt if none

pick_comfy_slot() {
  local mode="${1:-}"
  local versions="${COMFY_VERSIONS:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/versions}"
  local names=()
  local name seen i pick hint chosen

  : "${COMFY_ROOT:=$ROOT/runtime/comfyui}"

  if [ -n "${COMFY_DIR:-}" ] && [ -f "$COMFY_DIR/main.py" ] && [ -n "${COMFY_PYTHON:-}" ] && [ -x "$COMFY_PYTHON" ]; then
    return 0
  fi

  mkdir -p "$COMFY_ROOT" || return 1
  LAST=""
  if [ -f "$COMFY_ROOT/selected" ]; then
    LAST="$(tr -d '\r\n' < "$COMFY_ROOT/selected")"
  fi

  if [ -z "${COMFY_SLOT:-}" ]; then
    if [ "$mode" = "selected" ] && [ -n "$LAST" ]; then
      COMFY_SLOT="$LAST"
    else
      shopt -s nullglob
      if [ -f "$versions/latest.sh" ]; then
        names+=(latest)
        echo "  1. latest"
      fi
      for file in "$versions"/*.sh; do
        name="$(basename "$file" .sh)"
        [ "$name" = "latest" ] && continue
        names+=("$name")
        echo "  ${#names[@]}. $name"
      done
      for dir in "$COMFY_ROOT"/*/; do
        [ -d "$dir" ] || continue
        name="$(basename "$dir")"
        seen=0
        for existing in "${names[@]}"; do
          if [ "$existing" = "$name" ]; then
            seen=1
            break
          fi
        done
        if [ "$seen" = 0 ]; then
          names+=("$name")
          echo "  ${#names[@]}. $name"
        fi
      done
      shopt -u nullglob
      if [ "${#names[@]}" -eq 0 ]; then
        names=(latest 0.28.0)
        echo "  1. latest"
        echo "  2. 0.28.0"
      fi
      hint="${LAST:-${names[0]}}"
      echo
      printf "ComfyUI version [%s]: " "$hint"
      read -r pick || true
      pick="${pick:-$hint}"
      chosen=""
      if [[ "$pick" =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "${#names[@]}" ]; then
        chosen="${names[$((pick - 1))]}"
      else
        chosen="$pick"
      fi
      COMFY_SLOT="$chosen"
    fi
  fi

  if [ -f "$versions/$COMFY_SLOT.sh" ]; then
    # shellcheck disable=SC1090
    . "$versions/$COMFY_SLOT.sh"
  fi
  : "${COMFY_TORCH:=2.10.0+cu130}"
  COMFY_DIR="$COMFY_ROOT/$COMFY_SLOT/ComfyUI"
  COMFY_PYTHON="$COMFY_ROOT/$COMFY_SLOT/python_embeded/python"
  printf '%s\n' "$COMFY_SLOT" > "$COMFY_ROOT/selected"
  export COMFY_SLOT COMFY_DIR COMFY_PYTHON COMFYUI_REF COMFY_TORCH COMFY_ROOT COMFYUI_ARGS
}
