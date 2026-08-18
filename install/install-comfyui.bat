@echo off
:: Install bundled ComfyUI under runtime\comfy\
::   ComfyUI\                 clone of comfyanonymous/ComfyUI
::   python_embeded\          ComfyUI's Python + Torch (separate from BlomboUI)
::
:: Existing installs: skip this and set COMFYUI_PATH in webui-user.bat.

setlocal EnableExtensions EnableDelayedExpansion
cd /D "%~dp0.."
title BlomboUI - Install ComfyUI

:: --- Paths -----------------------------------------------------------------
set "ROOT=%cd%"
set "UI=%~dp0_ui.bat"
set "GIT_TERMINAL_PROMPT=0"
set "GIT_ASKPASS=echo"
set "GIT_LFS_SKIP_SMUDGE=1"

set "PIPargs=--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10"
set "UVargs=--no-cache --link-mode=copy"

set "VENDOR=%ROOT%\runtime\comfy"
set "COMFY=%VENDOR%\ComfyUI"
set "PYEMBED=%VENDOR%\python_embeded"
set "PY=%PYEMBED%\python.exe"
set "COMFY_REPO=https://github.com/comfyanonymous/ComfyUI"
set "MANAGER_REPO=https://github.com/Comfy-Org/ComfyUI-Manager"

:: Prefer a real Git on PATH; keep System32 / PowerShell / Apps behind it.
for /f "delims=" %%G in ('cmd /c "where.exe git.exe 2>nul"') do (set "GIT_PATH=%%~dpG")
set "PATH=%GIT_PATH%;%windir%\System32;%windir%\System32\WindowsPowerShell\v1.0;%LocalAppData%\Microsoft\WindowsApps;%PATH%"

:: --- Header ----------------------------------------------------------------
call "%UI%"
call "%UI%" header "install ComfyUI"
call "%UI%" note "Git, Python 3.12 embed, ComfyUI, Torch, and ComfyUI-Manager."
call "%UI%" kv "target" "%COMFY%"
call :NVIDIA_DRIVER_CHECK

:: --- Git -------------------------------------------------------------------
call :install_git

git --version >nul 2>&1
if errorlevel 1 (
    call "%UI%" warn "Git is not installed."
    call "%UI%" note "Install it from https://git-scm.com/ and run this again."
    goto :fail
)

for /F "tokens=*" %%g in ('git --version') do call "%UI%" kv "git" "%%g"

md "%VENDOR%" 2>nul
if not exist "%VENDOR%" (
    call "%UI%" warn "Cannot create %VENDOR%"
    call "%UI%" note "Do not run this from a protected system folder."
    goto :fail
)

:: --- Steps -----------------------------------------------------------------
call :install_comfyui
if errorlevel 1 goto :fail
call :install_python
if errorlevel 1 goto :fail
call :install_torch_and_reqs
if errorlevel 1 goto :fail
call :install_manager
if errorlevel 1 goto :fail

call "%UI%" section "Done"
call "%UI%" ok "ComfyUI install complete."
call "%UI%" section "Next"
call "%UI%" item "Optional: set MODELS_ROOT / COMFYUI_PATH in webui-user.bat"
call "%UI%" item "Optional: switch Torch from install\torch\"
call "%UI%" item "Start with webui-user.bat"
call "%UI%" wait
exit /b 0

:fail
call "%UI%" err "Install unsuccessful."
call "%UI%" wait
exit /b 1

::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:: Subroutines
::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

:: --- Git (winget if missing) -----------------------------------------------
:install_git
call "%UI%" section "Git"
where.exe git.exe >nul 2>&1
if %errorlevel%==0 (
    call "%UI%" note "Git already on PATH."
    goto :eof
)
where.exe winget.exe >nul 2>&1
if errorlevel 1 (
    call "%UI%" warn "winget not found. Install Git manually."
    goto :eof
)
call "%UI%" note "Installing Git with winget..."
winget.exe install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
goto :eof

:: --- Clone ComfyUI ---------------------------------------------------------
:install_comfyui
call "%UI%" section "ComfyUI"
if exist "%COMFY%\main.py" (
    call "%UI%" note "Already present. Skipping clone."
    goto :eof
)
call "%UI%" kv "clone" "%COMFY_REPO%"
git.exe clone "%COMFY_REPO%" "%COMFY%"
if errorlevel 1 (
    call "%UI%" err "Failed to clone ComfyUI."
    exit /b 1
)
goto :eof

:: --- ComfyUI Python embed (not BlomboUI's) ---------------------------------
:install_python
call "%UI%" section "Python 3.12 embed"
if exist "%PY%" call "%UI%" note "Already present. Ensuring pip and uv."
call "%~dp0_embed.bat" "%PYEMBED%" "../ComfyUI"
if errorlevel 1 exit /b 1
call "%UI%" kv "python" "%PY%"
goto :eof

:: --- Torch + ComfyUI requirements ------------------------------------------
:: CURRENT_CUDA is set by :NVIDIA_DRIVER_CHECK (13.0 default, 12.8 if driver < 580).
:install_torch_and_reqs
call "%UI%" section "Torch + requirements"
if not exist "%PY%" (
    call "%UI%" err "Embedded Python missing."
    exit /b 1
)

if "%CURRENT_CUDA%"=="12.8" (
    call "%UI%" kv "wheels" "CUDA 12.8  torch 2.8.0"
    "%PY%" -I -m pip install torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 %PIPargs%
) else (
    call "%UI%" kv "wheels" "CUDA 13.0  torch 2.10.0"
    "%PY%" -I -m pip install torch==2.10.0 torchvision==0.25.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cu130 %PIPargs%
)
if errorlevel 1 (
    call "%UI%" err "Torch install failed."
    exit /b 1
)

call "%UI%" note "Installing ComfyUI requirements"
"%PY%" -I -m uv pip install pygit2 av==16.0.1 %UVargs%
"%PY%" -I -m uv pip install -r "%COMFY%\requirements.txt" %UVargs%
if errorlevel 1 (
    call "%UI%" err "ComfyUI requirements failed."
    exit /b 1
)
goto :eof

:: --- ComfyUI-Manager custom node -------------------------------------------
:install_manager
call "%UI%" section "ComfyUI-Manager"
set "NODE_DIR=%COMFY%\custom_nodes\ComfyUI-Manager"
if not exist "%COMFY%\custom_nodes" md "%COMFY%\custom_nodes"

if exist "%NODE_DIR%\.git" (
    call "%UI%" note "Manager already present. Skipping clone."
) else (
    call "%UI%" kv "clone" "%MANAGER_REPO%"
    git.exe clone "%MANAGER_REPO%" "%NODE_DIR%"
    if errorlevel 1 (
        call "%UI%" err "Failed to clone ComfyUI-Manager."
        exit /b 1
    )
)

if exist "%NODE_DIR%\requirements.txt" (
    call "%UI%" note "Installing Manager requirements"
    "%PY%" -I -m uv pip install -r "%NODE_DIR%\requirements.txt" %UVargs%
)

if exist "%COMFY%\manager_requirements.txt" (
    "%PY%" -I -m uv pip install -r "%COMFY%\manager_requirements.txt" %UVargs%
)
goto :eof

:: --- NVIDIA driver -> CUDA wheel -------------------------------------------
:: CUDA 13 wheels need driver 580+. Older drivers get CUDA 12.8 / torch 2.8.0.
:NVIDIA_DRIVER_CHECK
set "NV_MIN=580"
set "CURRENT_CUDA=13.0"

where.exe nvidia-smi.exe >nul 2>&1
if %errorLevel% neq 0 (
    call "%UI%" warn "NVIDIA driver not detected. Installing CUDA 13 wheels anyway."
    goto :eof
)

for /f %%a in ('nvidia-smi --query-gpu^=driver_version --format^=csv^,noheader 2^>nul') do set "NV_FULL=%%a"
for /f "tokens=1 delims=." %%a in ("%NV_FULL%") do set "NV_MAJOR=%%a"

if not defined NV_MAJOR (
    call "%UI%" warn "Could not read NVIDIA driver version."
    goto :eof
)

call "%UI%" kv "driver" "%NV_FULL%"
if %NV_MAJOR% LSS %NV_MIN% (
    call "%UI%" warn "Driver below %NV_MIN%. Using CUDA 12.8 wheels."
    set "CURRENT_CUDA=12.8"
) else (
    call "%UI%" kv "wheels" "CUDA 13.0"
)
goto :eof
