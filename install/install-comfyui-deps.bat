@echo off
:: Install BlomboUI's ComfyUI custom nodes (Manager + rgthree-comfy).
:: Double-click this, or install-comfyui.bat calls it with "nopause".
::
::   install-comfyui-deps.bat            interactive
::   install-comfyui-deps.bat nopause    used by install-comfyui.bat
::
:: Uses COMFYUI_PATH from webui-user.bat, else runtime\comfy\ComfyUI.

setlocal EnableExtensions EnableDelayedExpansion
cd /D "%~dp0.."
title BlomboUI - Install ComfyUI nodes

set "ROOT=%cd%"
set "UI=%~dp0_ui.bat"
set "NOPAUSE=%~1"
set "GIT_TERMINAL_PROMPT=0"
set "GIT_ASKPASS=echo"
set "GIT_LFS_SKIP_SMUDGE=1"
set "UVargs=--no-cache --link-mode=copy"
set "BUNDLED=%ROOT%\runtime\comfy\ComfyUI"
set "BUNDLED_PY=%ROOT%\runtime\comfy\python_embeded\python.exe"
set "MANAGER_REPO=https://github.com/Comfy-Org/ComfyUI-Manager"
set "RGTHREE_REPO=https://github.com/rgthree/rgthree-comfy"

for /f "delims=" %%G in ('cmd /c "where.exe git.exe 2>nul"') do (set "GIT_PATH=%%~dpG")
set "PATH=%GIT_PATH%;%windir%\System32;%windir%\System32\WindowsPowerShell\v1.0;%LocalAppData%\Microsoft\WindowsApps;%PATH%"

set "BLOMBO_LOAD_SETTINGS_ONLY=1"
call "%ROOT%\webui-user.bat"
set "BLOMBO_LOAD_SETTINGS_ONLY="

call "%UI%"
if /I not "%NOPAUSE%"=="nopause" call "%UI%" header "install ComfyUI nodes"

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

set "PY="
if exist "!COMFY!\..\python_embeded\python.exe" for %%I in ("!COMFY!\..\python_embeded\python.exe") do set "PY=%%~fI"
if not defined PY if exist "!COMFY!\venv\Scripts\python.exe" set "PY=!COMFY!\venv\Scripts\python.exe"
if not defined PY if exist "!COMFY!\.venv\Scripts\python.exe" set "PY=!COMFY!\.venv\Scripts\python.exe"
if not defined PY if exist "!BUNDLED_PY!" set "PY=!BUNDLED_PY!"

call "%UI%" kv "comfy" "!COMFY!"
if defined PY (
    call "%UI%" kv "python" "!PY!"
) else (
    call "%UI%" warn "ComfyUI Python not found. Nodes will clone without pip installs."
)

git --version >nul 2>&1
if errorlevel 1 (
    call "%UI%" err "Git is not installed."
    call "%UI%" note "Install it from https://git-scm.com/ and run this again."
    goto :fail
)

if not exist "!COMFY!\custom_nodes" md "!COMFY!\custom_nodes"

call :install_node "ComfyUI-Manager" "%MANAGER_REPO%" "ComfyUI-Manager"
if errorlevel 1 goto :fail
if exist "!COMFY!\manager_requirements.txt" if defined PY (
    "!PY!" -I -m uv pip install -r "!COMFY!\manager_requirements.txt" %UVargs%
)

call :install_node "rgthree-comfy" "%RGTHREE_REPO%" "rgthree-comfy"
if errorlevel 1 goto :fail

call "%UI%" ok "ComfyUI nodes ready."
if /I not "%NOPAUSE%"=="nopause" call "%UI%" wait
exit /b 0

:fail
call "%UI%" err "Node install unsuccessful."
if /I not "%NOPAUSE%"=="nopause" call "%UI%" wait
exit /b 1

:install_node
set "NODE_NAME=%~1"
set "NODE_REPO=%~2"
set "NODE_DIR=!COMFY!\custom_nodes\%~3"
call "%UI%" section "%NODE_NAME%"
if exist "!NODE_DIR!\.git" (
    call "%UI%" note "Already present. Skipping clone."
) else (
    call "%UI%" kv "clone" "!NODE_REPO!"
    git.exe clone "!NODE_REPO!" "!NODE_DIR!"
    if errorlevel 1 (
        call "%UI%" err "Failed to clone %NODE_NAME%."
        exit /b 1
    )
)
if exist "!NODE_DIR!\requirements.txt" (
    if not defined PY (
        call "%UI%" warn "Skipping requirements: no ComfyUI Python."
        goto :eof
    )
    call "%UI%" note "Installing requirements"
    "!PY!" -I -m uv pip install -r "!NODE_DIR!\requirements.txt" %UVargs%
)
goto :eof
