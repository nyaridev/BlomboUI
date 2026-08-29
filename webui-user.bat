@echo off

:: -----------------------------------------------------------------------------
:: Optional overrides
:: -----------------------------------------------------------------------------

:: set PYTHON=
:: set GIT=
:: set VENV_DIR=
:: set COMFYUI_PATH=
:: set MODELS_ROOT=
:: set OUTPUTS_ROOT=
:: set WILDCARDS_ROOT=

set COMMANDLINE_ARGS=--uv --hot_reload_vite

:: --uv -> use uv for the project environment and backend dependencies.
:: --comfyui-window -> open ComfyUI in a separate console.
:: --port N -> BlomboUI UI port (default 5173).

:: --dev_debug -> show ComfyUI setup and startup logs in this console.
:: --api-pings -> show backend access logs (status polls and other API hits).
:: --hot_reload_vite -> reload the frontend when UI files change.

:: -----------------------------------------------------------------------------
:: ComfyUI
:: -----------------------------------------------------------------------------

:: COMFYUI_REF is a git tag, branch, or commit for the bundled clone (empty = latest). Example: v0.3.60
set COMFYUI_REF=

:: Extra arguments forwarded to ComfyUI (main.py).
set COMFYUI_ARGS=

:: -----------------------------------------------------------------------------
:: Launch
:: -----------------------------------------------------------------------------

if defined BLOMBO_LOAD_SETTINGS_ONLY exit /b 0
call "%~dp0install\webui.bat"
PAUSE