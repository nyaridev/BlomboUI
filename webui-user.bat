@echo off

:: -----------------------------------------------------------------------------
:: Optional overrides
:: -----------------------------------------------------------------------------

:: set PYTHON=
:: set GIT=
:: set MODELS_ROOT=
:: set WILDCARDS_ROOT=

set COMMANDLINE_ARGS=--uv --hot_reload_vite

:: --uv -> use uv for the project environment and backend dependencies.
:: --comfyui-window -> open ComfyUI in a separate console (default; remove it to keep ComfyUI in the background).
:: --port N -> BlomboUI UI port (default 5173).

:: --dev_debug -> show ComfyUI setup and startup logs in this console.
:: --api-pings -> show backend access logs (status polls and other API hits).
:: --hot_reload_vite -> reload the frontend when UI files change.

:: -----------------------------------------------------------------------------
:: ComfyUI
:: -----------------------------------------------------------------------------

:: Extra arguments forwarded to ComfyUI (main.py). Used unless the selected slot overrides them.
set COMFYUI_ARGS=

:: -----------------------------------------------------------------------------
:: Launch
:: -----------------------------------------------------------------------------

if defined BLOMBO_LOAD_SETTINGS_ONLY exit /b 0
call "%~dp0install\webui.bat"
PAUSE