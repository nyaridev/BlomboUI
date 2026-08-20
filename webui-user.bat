@echo off
:: BlomboUI user settings.
:: Edit this file, then double-click it to start.
:: Do not edit webui.bat unless you are changing how the app launches.

cd /D "%~dp0"

:: --- Python ----------------------------------------------------------------
:: Leave PYTHON unset to use the bundled embed (runtime\python_embeded).
:: First launch downloads it automatically (~12 MB). That is BlomboUI's
:: Python only — ComfyUI has its own under runtime\comfy\python_embeded.
:: set PYTHON="C:\Users\nari\AppData\Local\Programs\Python\Python313\python.exe"
:: set GIT=
:: set VENV_DIR=

:: --- ComfyUI ---------------------------------------------------------------
:: Bundled ComfyUI is runtime\comfy\ComfyUI after install\install-comfyui.bat.
:: Point this at an existing install instead if you already have one.
:: The app starts ComfyUI as an API backend (no node editor in the browser).
:: Double-click comfyui.bat only if you want Comfy's graph UI.
:: set COMFYUI_PATH=B:\AI\Diffusion\Interfaces\ComfyUI

:: --- Paths -----------------------------------------------------------------
:: Defaults are .\user\models, .\user\output, and .\user\wildcards.
:: Override here, or change later in app Settings.
:: set MODELS_ROOT=B:\AI\Diffusion\Models
:: set OUTPUTS_ROOT=
:: set WILDCARDS_ROOT=

:: --- Launch ----------------------------------------------------------------
:: Extra args passed to app\launch.py
set COMMANDLINE_ARGS=

:: comfyui.bat loads this file for COMFYUI_PATH / MODELS_ROOT, then returns.
if defined BLOMBO_LOAD_SETTINGS_ONLY exit /b 0
call webui.bat
