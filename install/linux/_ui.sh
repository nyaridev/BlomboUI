# Shared console UI for install/start scripts.
# Source once, then:
#   ui_section "Setup"
#   ui_info "..."
#   ui_ok "..."
#   ui_warn "..."
#   ui_error "..."
#   ui_kv "BlomboUI" "http://..."
#   ui_note "secondary line"

muted=$'\033[38;5;245m'
white=$'\033[38;5;252m'
okc=$'\033[38;5;108m'
warnc=$'\033[38;5;180m'
errc=$'\033[38;5;174m'
reset=$'\033[0m'

ui_section() {
  printf '\n  %s%s%s\n' "$white" "$1" "$reset"
  printf '  %s--------------------------------%s\n' "$muted" "$reset"
}

ui_info() {
  printf '    %s%s%s\n' "$muted" "$1" "$reset"
}

ui_ok() {
  printf '    %s%s%s\n' "$muted" "$1" "$reset"
}

ui_warn() {
  printf '    %swarn%s  %s\n' "$warnc" "$reset" "$1"
}

ui_error() {
  printf '    %serror%s %s\n' "$errc" "$reset" "$1"
}

ui_kv() {
  printf '    %s%-12s%s %s%s%s\n' "$muted" "$1" "$reset" "$white" "$2" "$reset"
}

ui_note() {
  printf '    %s%s%s\n' "$muted" "$1" "$reset"
}
