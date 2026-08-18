@echo off
:: Start ComfyUI's own frontend (node graph) so you can build workflows.
:: Uses COMFYUI_PATH / MODELS_ROOT / OUTPUTS_ROOT from webui-user.bat.
:: Not needed for Generate: webui-user.bat already starts the API backend.
:: Port 8188 must be free (close BlomboUI first). Save (API Format) into app\workflows\.

setlocal EnableExtensions EnableDelayedExpansion
cd /D "%~dp0"
title BlomboUI - ComfyUI

:: --- Paths -----------------------------------------------------------------
set "ROOT=%~dp0"
set "UI=%ROOT%install\_ui.bat"
set "BUNDLED=%ROOT%runtime\comfy\ComfyUI"
set "BUNDLED_PY=%ROOT%runtime\comfy\python_embeded\python.exe"
set "YAML=%ROOT%runtime\data\extra_model_paths.yaml"
if not defined COMFYUI_PORT set "COMFYUI_PORT=8188"

:: --- Settings --------------------------------------------------------------
set "BLOMBO_LOAD_SETTINGS_ONLY=1"
call "%ROOT%webui-user.bat"
set "BLOMBO_LOAD_SETTINGS_ONLY="

call "%UI%"
call "%UI%" header "ComfyUI"

:: --- Resolve ComfyUI -------------------------------------------------------
if defined COMFYUI_PATH (
    set "COMFY=!COMFYUI_PATH!"
) else (
    set "COMFY=!BUNDLED!"
)

if not exist "!COMFY!\main.py" (
    call "%UI%" err "ComfyUI is not installed."
    call "%UI%" note "Missing: !COMFY!"
    call "%UI%" note "Run install\install-comfyui.bat"
    call "%UI%" note "or set COMFYUI_PATH in webui-user.bat."
    goto :fail
)

if not defined MODELS_ROOT set "MODELS_ROOT=!ROOT!user\models"
if not defined OUTPUTS_ROOT set "OUTPUTS_ROOT=!ROOT!user\output"

:: --- Resolve Python (Comfy's, never BlomboUI's) ----------------------------
set "COMFY_PY="
if exist "!COMFY!\..\python_embeded\python.exe" for %%I in ("!COMFY!\..\python_embeded\python.exe") do set "COMFY_PY=%%~fI"
if not defined COMFY_PY if exist "!COMFY!\venv\Scripts\python.exe" set "COMFY_PY=!COMFY!\venv\Scripts\python.exe"
if not defined COMFY_PY if exist "!COMFY!\.venv\Scripts\python.exe" set "COMFY_PY=!COMFY!\.venv\Scripts\python.exe"
if not defined COMFY_PY if exist "!BUNDLED_PY!" set "COMFY_PY=!BUNDLED_PY!"

if not defined COMFY_PY (
    call "%UI%" err "ComfyUI Python not found."
    call "%UI%" note "Bundled embed: runtime\comfy\python_embeded\python.exe"
    call "%UI%" note "Run install\install-comfyui.bat, or use a portable ComfyUI layout."
    goto :fail
)

call "%UI%" kv "comfy" "!COMFY!"
call "%UI%" kv "python" "!COMFY_PY!"
call "%UI%" kv "models" "!MODELS_ROOT!"
call "%UI%" kv "output" "!OUTPUTS_ROOT!"
call "%UI%" kv "ui" "http://127.0.0.1:!COMFYUI_PORT!"

:: --- extra_model_paths.yaml ------------------------------------------------
mkdir "!ROOT!runtime\data" 2>nul
mkdir "!OUTPUTS_ROOT!" 2>nul
set "MODELS_FWD=!MODELS_ROOT:\=/!"
(
    echo blomboui:
    echo     base_path: '!MODELS_FWD!'
    echo     checkpoints: checkpoints
    echo     loras: loras
    echo     vae: vae
    echo     controlnet: controlnet
    echo     embeddings: embeddings
) > "!YAML!"
call "%UI%" kv "paths" "!YAML!"

:: --- Launch ----------------------------------------------------------------
call "%UI%" section "Frontend"
call "%UI%" note "ComfyUI node editor. Close this window to stop."
call "%UI%" note "Save (API Format) into app\workflows\ for BlomboUI templates."
echo.

cd /D "!COMFY!"
"!COMFY_PY!" main.py --listen 127.0.0.1 --port !COMFYUI_PORT! --extra-model-paths-config "!YAML!" --output-directory "!OUTPUTS_ROOT!"
set "RC=!ERRORLEVEL!"
call "%UI%" wait
exit /b !RC!

:fail
call "%UI%" err "ComfyUI did not start."
call "%UI%" wait
exit /b 1
