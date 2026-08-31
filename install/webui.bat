@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..") do set ROOT=%%~fI
call "%ROOT%\install\windows\_ui.bat"
title BlomboUI

if defined COMFYUI_PATH set COMFY_EXTERNAL=1

if not defined PYTHON set PYTHON=python
if not defined GIT set GIT=git
if not defined VENV_DIR (
    set VENV_DIR=%ROOT%\runtime\.venv
) else (
    for %%I in (%VENV_DIR%) do set VENV_DIR=%%~fI
)

if not defined BACKEND_HOST set BACKEND_HOST=127.0.0.1
if not defined BACKEND_PORT set BACKEND_PORT=4173
if not defined FRONTEND_HOST set FRONTEND_HOST=127.0.0.1
if not defined FRONTEND_PORT set FRONTEND_PORT=5173
if not defined COMFYUI_HOST set COMFYUI_HOST=127.0.0.1
if not defined COMFYUI_PORT set COMFYUI_PORT=8188
if not defined MODELS_DIR (
    if defined MODELS_ROOT (
        for %%I in (%MODELS_ROOT%) do set MODELS_DIR=%%~fI
    ) else (
        set MODELS_DIR=%ROOT%\user\models
    )
)

echo.%COMMANDLINE_ARGS% | findstr /i /c:"--comfyui-window" >nul
if not errorlevel 1 set COMFYUI_SEPARATE_WINDOW=1
echo.%COMMANDLINE_ARGS% | findstr /i /c:"--dev_debug" >nul
if not errorlevel 1 set DEV_DEBUG=1
echo.%COMMANDLINE_ARGS% | findstr /i /c:"--api-pings" >nul
if not errorlevel 1 set API_PINGS=1
echo.%COMMANDLINE_ARGS% | findstr /i /c:"--hot_reload_vite" >nul
if not errorlevel 1 set HOT_RELOAD_VITE=1

call :flag_value FRONTEND_PORT --port %COMMANDLINE_ARGS%
call :flag_value COMFYUI_PORT --port %COMFYUI_ARGS%
call :flag_value COMFYUI_HOST --listen %COMFYUI_ARGS%
if /i "%COMFYUI_HOST%"=="0.0.0.0" set COMFYUI_HOST=127.0.0.1
if /i "%COMFYUI_HOST%"=="::" set COMFYUI_HOST=127.0.0.1
if /i "%COMFYUI_HOST%"=="[::]" set COMFYUI_HOST=127.0.0.1

set COMFYUI_URL=http://%COMFYUI_HOST%:%COMFYUI_PORT%
set COMFYUI_LOG=%ROOT%\runtime\tmp\comfyui.log
set VENV_PYTHON=%VENV_DIR%\Scripts\python.exe
set COMFY_ROOT=%ROOT%\runtime\comfyui
set YAML=%ROOT%\runtime\data\extra_model_paths.yaml
set COMFY_OUT=%ROOT%\runtime\tmp\comfy-output
set RESTART_FLAG=%ROOT%\runtime\tmp\restart
set COMFY_RESTART_FLAG=%ROOT%\runtime\tmp\comfy-restart

if defined COMFYUI_PATH (
    for %%I in (%COMFYUI_PATH%) do set COMFY_DIR=%%~fI
    call :resolve_comfy_python
)

:: -----------------------------------------------------------------------------
:: Provisioning
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" section "BlomboUI setup"

call "%ROOT%\install\windows\install_git.bat"
if errorlevel 1 exit /b %errorlevel%

call "%ROOT%\install\windows\_ui.bat" section "Project environment"
call "%ROOT%\install\windows\app\create_venv.bat"
if errorlevel 1 exit /b %errorlevel%

if not exist "%MODELS_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" info "Creating models directory..."
    mkdir "%MODELS_DIR%"
)
if not exist "%MODELS_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not create the models directory."
    exit /b 1
)
call "%ROOT%\install\windows\_ui.bat" ok "Models directory: %MODELS_DIR%"
if not defined MODELS_ROOT set MODELS_ROOT=%MODELS_DIR%

if not defined COMFYUI_PATH (
    call "%ROOT%\install\windows\_ui.bat" section "ComfyUI version"
    call "%ROOT%\install\windows\comfyui\_pick_slot.bat"
    if errorlevel 1 exit /b 1
    call :resolve_comfy_python
)

if not exist "%COMFY_DIR%\main.py" (
    if defined COMFYUI_PATH (
        call "%ROOT%\install\windows\_ui.bat" error "COMFYUI_PATH does not contain ComfyUI."
        call "%ROOT%\install\windows\_ui.bat" info "Missing: %COMFY_DIR%\main.py"
        exit /b 1
    )
    call "%ROOT%\install\windows\_ui.bat" section "ComfyUI install"
    call "%ROOT%\install\windows\_ui.bat" info "ComfyUI was not found. Installing..."
    call "%ROOT%\install\windows\comfyui\install_comfyui.bat"
    if errorlevel 1 exit /b 1
    call :resolve_comfy_python
) else if defined DEV_DEBUG (
    call "%ROOT%\install\windows\_ui.bat" ok "ComfyUI is already installed."
)

if not defined COMFY_PYTHON (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\comfyui\install_comfyui.bat, or point COMFYUI_PATH at a portable ComfyUI."
    exit /b 1
)

if not exist "%ROOT%\runtime\tmp\" mkdir "%ROOT%\runtime\tmp"
if not exist "%COMFY_OUT%\" mkdir "%COMFY_OUT%"
if not defined COMFYUI_PATH set COMFYUI_PATH=%COMFY_DIR%

"%VENV_PYTHON%" -m bootstrap
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Could not write launcher environment files."
    exit /b 1
)

set NEED_COMFY_DEPS=
for %%N in (comfyui-manager rgthree-comfy ComfyUI-KJNodes ComfyUI-Easy-Use ComfyUI-Impact-Pack ComfyUI-Impact-Subpack ComfyUI-RMBG ComfyUI-SeedVR2_VideoUpscaler ComfyUI-GGUF ComfyUI-QwenVL ComfyUI-WD14-Tagger) do (
    if not exist "%COMFY_DIR%\custom_nodes\%%N\" set NEED_COMFY_DEPS=1
)
if defined NEED_COMFY_DEPS (
    if defined DEV_DEBUG (
        call "%ROOT%\install\windows\_ui.bat" section "ComfyUI custom nodes"
        call "%ROOT%\install\windows\comfyui\install_deps.bat"
        if errorlevel 1 exit /b 1
    ) else (
        call "%ROOT%\install\windows\comfyui\install_deps.bat" > "%COMFYUI_LOG%" 2>&1
        if errorlevel 1 (
            type "%COMFYUI_LOG%"
            exit /b 1
        )
    )
) else if defined DEV_DEBUG (
    call "%ROOT%\install\windows\_ui.bat" ok "ComfyUI custom nodes are already installed."
)

if not defined COMFY_EXTERNAL (
    if defined DEV_DEBUG call "%ROOT%\install\windows\_ui.bat" section "CUDA Torch"
    "%COMFY_PYTHON%" -I -c "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" warn "CUDA Torch was not found. Installing CUDA Torch %COMFY_TORCH%..."
        set TORCH_BAT=%ROOT%\install\windows\comfyui\torch\%COMFY_TORCH%.bat
        call "%TORCH_BAT%"
        if errorlevel 1 exit /b 1
    ) else if defined DEV_DEBUG (
        call "%ROOT%\install\windows\_ui.bat" ok "CUDA Torch is available."
    )
)

:: -----------------------------------------------------------------------------
:: Service startup
:: -----------------------------------------------------------------------------

cls
call "%ROOT%\install\windows\_ui.bat" section "Starting BlomboUI"

call :free_port %BACKEND_PORT%
call :free_port %FRONTEND_PORT%
if not defined COMFYUI_SEPARATE_WINDOW call :free_port %COMFYUI_PORT%
ping 127.0.0.1 -n 2 >nul

call :start_backend
if errorlevel 1 exit /b 1
call :start_frontend
call :start_comfy

call "%ROOT%\install\windows\_ui.bat" info "Opening BlomboUI in the browser..."
ping 127.0.0.1 -n 3 >nul
start "" "http://%FRONTEND_HOST%:%FRONTEND_PORT%/"

echo.
call "%ROOT%\install\windows\_ui.bat" kv "BlomboUI" "http://%FRONTEND_HOST%:%FRONTEND_PORT%/"
call "%ROOT%\install\windows\_ui.bat" kv "ComfyUI" "%COMFYUI_URL%/"
call "%ROOT%\install\windows\_ui.bat" note "Keep this window open while using the app."
if defined COMFYUI_SEPARATE_WINDOW (
    call "%ROOT%\install\windows\_ui.bat" note "Closing this window stops the frontend and backend. Close the ComfyUI window to stop ComfyUI."
) else (
    call "%ROOT%\install\windows\_ui.bat" note "Closing this window stops the frontend, backend, and ComfyUI."
)

:: -----------------------------------------------------------------------------
:: Keep-alive
:: -----------------------------------------------------------------------------

:keep_alive
if exist "%RESTART_FLAG%" (
    del /q "%RESTART_FLAG%" >nul 2>&1
    call "%ROOT%\install\windows\_ui.bat" info "Reloading backend and frontend..."
    call :free_port %BACKEND_PORT%
    call :free_port %FRONTEND_PORT%
    ping 127.0.0.1 -n 2 >nul
    call :start_backend
    call :start_frontend
)
if exist "%COMFY_RESTART_FLAG%" (
    if not defined COMFYUI_SEPARATE_WINDOW (
        del /q "%COMFY_RESTART_FLAG%" >nul 2>&1
        call "%ROOT%\install\windows\_ui.bat" info "Reloading ComfyUI..."
        call :free_port %COMFYUI_PORT%
        ping 127.0.0.1 -n 2 >nul
        call :start_comfy
    )
)
ping 127.0.0.1 -n 2 >nul
goto keep_alive

:start_backend
call "%ROOT%\install\windows\_ui.bat" info "Starting backend on http://%BACKEND_HOST%:%BACKEND_PORT%"
if defined API_PINGS (
    set BLOMBO_API_PINGS=1
    set UVICORN_ACCESS=
) else (
    set BLOMBO_API_PINGS=0
    set UVICORN_ACCESS=--no-access-log
)
start "BlomboUI Backend" /b cmd /d /c "pushd ""%ROOT%\app\backend"" && ""%VENV_PYTHON%"" -m uvicorn main:app %UVICORN_ACCESS% --host %BACKEND_HOST% --port %BACKEND_PORT%"
call "%ROOT%\install\windows\_ui.bat" info "Waiting for the backend..."
call :wait_port %BACKEND_HOST% %BACKEND_PORT%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Backend did not start on port %BACKEND_PORT%."
    call "%ROOT%\install\windows\_ui.bat" info "Another program may be holding that port. Close it and try again."
    exit /b 1
)
exit /b 0

:start_frontend
call "%ROOT%\install\windows\_ui.bat" info "Starting frontend on http://%FRONTEND_HOST%:%FRONTEND_PORT%"
if defined HOT_RELOAD_VITE (
    set BLOMBO_HOT_RELOAD_VITE=1
) else (
    set BLOMBO_HOT_RELOAD_VITE=0
)
start "BlomboUI Frontend" /b cmd /d /c "pushd ""%ROOT%\app\frontend"" && npm run dev -- --host %FRONTEND_HOST% --port %FRONTEND_PORT% --strictPort"
exit /b 0

:start_comfy
if defined COMFYUI_SEPARATE_WINDOW (
    if defined DEV_DEBUG call "%ROOT%\install\windows\_ui.bat" info "Starting ComfyUI in a separate window at %COMFYUI_URL%"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\install\windows\start_comfy_window.ps1" -Python "%COMFY_PYTHON%" -ComfyDir "%COMFY_DIR%" -ListenHost "%COMFYUI_HOST%" -Port "%COMFYUI_PORT%" -OutDir "%COMFY_OUT%" -Yaml "%YAML%" -ModelsDir "%MODELS_DIR%" -ExtraArgs "!COMFYUI_ARGS!"
) else if defined DEV_DEBUG (
    call "%ROOT%\install\windows\_ui.bat" info "Starting ComfyUI in the background at %COMFYUI_URL%"
    start "BlomboUI ComfyUI" /D "%ROOT%" /b cmd /c "install\comfyui.bat --no-browser"
) else (
    start "BlomboUI ComfyUI" /D "%ROOT%" /b cmd /c "install\comfyui.bat --log --no-browser"
)
exit /b 0

:resolve_comfy_python
set COMFY_PYTHON=
if exist "%COMFY_DIR%\..\python_embeded\python.exe" for %%I in ("%COMFY_DIR%\..\python_embeded\python.exe") do set COMFY_PYTHON=%%~fI
if not defined COMFY_PYTHON if exist "%COMFY_DIR%\venv\Scripts\python.exe" set COMFY_PYTHON=%COMFY_DIR%\venv\Scripts\python.exe
if not defined COMFY_PYTHON if exist "%COMFY_DIR%\.venv\Scripts\python.exe" set COMFY_PYTHON=%COMFY_DIR%\.venv\Scripts\python.exe
if not defined COMFY_PYTHON if exist "%COMFY_ROOT%\python_embeded\python.exe" set COMFY_PYTHON=%COMFY_ROOT%\python_embeded\python.exe
exit /b 0

:free_port
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$port=%~1; netstat -ano | ForEach-Object { if ($_ -match (':{0}\s+\S+\s+LISTENING\s+(\d+)$' -f $port)) { $procId = [int]$Matches[1]; if ($procId -gt 4) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }" >nul 2>&1
exit /b 0

:wait_port
set WAIT_HOST=%~1
set WAIT_PORT=%~2
set WAIT_I=0
:wait_port_loop
set /a WAIT_I+=1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $c = New-Object Net.Sockets.TcpClient('%WAIT_HOST%', %WAIT_PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
if %WAIT_I% geq 20 exit /b 1
ping 127.0.0.1 -n 2 >nul
goto wait_port_loop

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
    if /i "%%K"=="%_FLAG%" if not "%%L"=="" set %_DEST%=%%L
)
shift
goto flag_value_loop
