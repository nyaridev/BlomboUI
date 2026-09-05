@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /D "%~dp0.."

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..") do set ROOT=%%~fI
call "%ROOT%\install\windows\_ui.bat"

set BLOMBO_LOAD_SETTINGS_ONLY=1
call "%ROOT%\webui-user.bat"
set BLOMBO_LOAD_SETTINGS_ONLY=

if not defined COMFYUI_HOST set COMFYUI_HOST=127.0.0.1
if not defined COMFYUI_PORT set COMFYUI_PORT=8188
call :flag_value COMFYUI_PORT --port %COMFYUI_ARGS%
call :flag_value COMFYUI_HOST --listen %COMFYUI_ARGS%
if /i "%COMFYUI_HOST%"=="0.0.0.0" set COMFYUI_HOST=127.0.0.1
if /i "%COMFYUI_HOST%"=="::" set COMFYUI_HOST=127.0.0.1
if /i "%COMFYUI_HOST%"=="[::]" set COMFYUI_HOST=127.0.0.1
if not defined MODELS_DIR (
    if defined MODELS_ROOT (
        for %%I in (%MODELS_ROOT%) do set MODELS_DIR=%%~fI
    ) else (
        set MODELS_DIR=%ROOT%\user\models
    )
)
if not defined COMFY_ROOT set COMFY_ROOT=%ROOT%\runtime\comfyui
if not defined COMFY_DIR (
    call "%ROOT%\install\windows\comfyui\_pick_slot.bat" /selected
)
if not defined COMFY_PYTHON (
    if exist "%COMFY_DIR%\..\python_embeded\python.exe" for %%I in ("%COMFY_DIR%\..\python_embeded\python.exe") do set COMFY_PYTHON=%%~fI
)
if not defined COMFY_PYTHON if exist "%COMFY_DIR%\venv\Scripts\python.exe" set COMFY_PYTHON=%COMFY_DIR%\venv\Scripts\python.exe
if not defined COMFY_PYTHON if exist "%COMFY_DIR%\.venv\Scripts\python.exe" set COMFY_PYTHON=%COMFY_DIR%\.venv\Scripts\python.exe
if not defined COMFY_PYTHON if exist "%COMFY_ROOT%\python_embeded\python.exe" set COMFY_PYTHON=%COMFY_ROOT%\python_embeded\python.exe

set COMFYUI_URL=http://%COMFYUI_HOST%:%COMFYUI_PORT%
set YAML=%ROOT%\runtime\data\extra_model_paths.yaml
set COMFY_OUT=%ROOT%\runtime\tmp\comfy-output
title BlomboUI ComfyUI

for %%A in (%*) do (
    if /i "%%~A"=="--log" set COMFYUI_LOG=%ROOT%\runtime\tmp\comfyui.log
    if /i "%%~A"=="--no-browser" set COMFYUI_NO_BROWSER=1
)

if defined COMFYUI_NO_BROWSER (
    set COMFYUI_LAUNCH=--disable-auto-launch
) else (
    set COMFYUI_LAUNCH=--auto-launch
)

:: -----------------------------------------------------------------------------
:: Preflight
:: -----------------------------------------------------------------------------

if not defined COMFY_PYTHON (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run webui-user.bat first, or install\windows\comfyui\install_comfyui.bat."
    exit /b 1
)
if not exist "%COMFY_PYTHON%" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run webui-user.bat first, or install\windows\comfyui\install_comfyui.bat."
    exit /b 1
)

if not exist "%COMFY_DIR%\main.py" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run webui-user.bat first, or install\windows\comfyui\install_comfyui.bat."
    exit /b 1
)

if not exist "%MODELS_DIR%\" mkdir "%MODELS_DIR%"
if not exist "%MODELS_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not create the models directory."
    exit /b 1
)
if not exist "%COMFY_OUT%\" mkdir "%COMFY_OUT%"

if not defined COMFYUI_LOG (
    call "%ROOT%\install\windows\_ui.bat" section "ComfyUI"
    call "%ROOT%\install\windows\_ui.bat" info "Listening on %COMFYUI_URL%"
    call "%ROOT%\install\windows\_ui.bat" info "Models directory: %MODELS_DIR%"
)

:: -----------------------------------------------------------------------------
:: Launch
:: -----------------------------------------------------------------------------

cd /D "%COMFY_DIR%"
if not exist "%ROOT%\runtime\tmp\" mkdir "%ROOT%\runtime\tmp"

set EXTRA_YAML=
if exist "%YAML%" set EXTRA_YAML=--extra-model-paths-config "%YAML%"
if defined COMFYUI_LOG (
    "%COMFY_PYTHON%" -I -W "ignore::FutureWarning" -u main.py --listen %COMFYUI_HOST% --port %COMFYUI_PORT% %COMFYUI_LAUNCH% --preview-method auto --output-directory "%COMFY_OUT%" --models-directory "%MODELS_DIR%" %EXTRA_YAML% !COMFYUI_ARGS! > "%COMFYUI_LOG%" 2>&1
) else (
    "%COMFY_PYTHON%" -I -W "ignore::FutureWarning" -u main.py --listen %COMFYUI_HOST% --port %COMFYUI_PORT% %COMFYUI_LAUNCH% --preview-method auto --output-directory "%COMFY_OUT%" --models-directory "%MODELS_DIR%" %EXTRA_YAML% !COMFYUI_ARGS!
)
exit /b %errorlevel%

:flag_value
set _DEST=%~1
set _FLAG=%~2
shift
shift
set _TAKE=
:flag_value_loop
if "%~1"=="" exit /b 0
if defined _TAKE (
    if not "%~1"=="" set %_DEST%=%~1
    exit /b 0
)
if /i "%~1"=="%_FLAG%" (
    set _TAKE=1
    shift
    goto flag_value_loop
)
for /f "tokens=1* delims==" %%K in ("%~1") do (
    if /i "%%K"=="%_FLAG%" if not "%%L"=="" (
        set %_DEST%=%%L
        exit /b 0
    )
)
shift
goto flag_value_loop
