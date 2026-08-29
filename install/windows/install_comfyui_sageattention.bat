@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"
if not defined COMFY_PYTHON set "COMFY_PYTHON=%ROOT%\runtime\comfyui\python_embeded\python.exe"
set "PYTHON_EXE=%COMFY_PYTHON%"
set "PIP_ARGS=--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10 --use-pep517"
set "SAGE2_BASE=https://github.com/woct0rdho/SageAttention/releases/download"

:: -----------------------------------------------------------------------------
:: Preflight
:: -----------------------------------------------------------------------------

if not exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's embedded Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\install_comfyui.bat first."
    exit /b 1
)

for %%I in ("%PYTHON_EXE%") do set "PYTHON_DIR=%%~dpI"
set "SITE_PACKAGES=%PYTHON_DIR%Lib\site-packages"

"%PYTHON_EXE%" -I -c "import sageattention, sageattn3" >nul 2>&1
if not errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" ok "SageAttention is already installed."
    exit /b 0
)

call :read_versions
if errorlevel 1 exit /b 1

set "SAGE2_WHL="
set "SAGE3_WHL="
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.7" if "%CUDA_VERSION%"=="12.8" (
    set "SAGE2_WHL=%SAGE2_BASE%/v2.2.0-windows.post3/sageattention-2.2.0+cu128torch2.7.1.post3-cp39-abi3-win_amd64.whl"
    set "SAGE3_WHL=https://github.com/mengqin/SageAttention/releases/download/20251229/sageattn3-1.0.0+cu128torch271-cp312-cp312-win_amd64.whl"
)
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.8" if "%CUDA_VERSION%"=="12.8" (
    set "SAGE2_WHL=%SAGE2_BASE%/v2.2.0-windows.post3/sageattention-2.2.0+cu128torch2.8.0.post3-cp39-abi3-win_amd64.whl"
    set "SAGE3_WHL=https://github.com/mengqin/SageAttention/releases/download/20251229/sageattn3-1.0.0+cu128torch280-cp312-cp312-win_amd64.whl"
)
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.9" if "%CUDA_VERSION%"=="13.0" (
    set "SAGE2_WHL=%SAGE2_BASE%/v2.2.0-windows.post5/sageattention-2.2.0+cu130torch2.9.1.post5-cp310-abi3-win_amd64.whl"
    set "SAGE3_WHL=https://github.com/mengqin/SageAttention/releases/download/20251229/sageattn3-1.0.0+cu130torch291-cp312-cp312-win_amd64.whl"
)
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.10" if "%CUDA_VERSION%"=="13.0" (
    set "SAGE2_WHL=%SAGE2_BASE%/v2.2.0-windows.post5/sageattention-2.2.0+cu130torch2.10.0andhigher.post5-cp310-abi3-win_amd64.whl"
    set "SAGE3_WHL=https://huggingface.co/ussoewwin/Sage-Attention-for-Windows/resolve/main/sageattn3-1.0.0+cu130torch2.10.0-cp312-cp312-win_amd64.whl"
)

if "%SAGE2_WHL%"=="" (
    call "%ROOT%\install\windows\_ui.bat" error "No SageAttention wheel for Python %PYTHON_VERSION%, Torch %TORCH_VERSION%, CUDA %CUDA_VERSION%."
    call "%ROOT%\install\windows\_ui.bat" info "Supported: Python 3.12 with Torch 2.7/2.8 + CUDA 12.8, or Torch 2.9/2.10 + CUDA 13.0."
    exit /b 1
)

call :clean_tmp_packages

:: -----------------------------------------------------------------------------
:: Install
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" section "SageAttention"
call "%ROOT%\install\windows\_ui.bat" info "Installing Triton..."
"%PYTHON_EXE%" -I -m pip uninstall triton-windows -y >nul 2>&1
set "TRITON_SPEC="
if "%TORCH_VERSION%"=="2.7" set "TRITON_SPEC=triton-windows<3.4"
if "%TORCH_VERSION%"=="2.8" set "TRITON_SPEC=triton-windows<3.5"
if "%TORCH_VERSION%"=="2.9" set "TRITON_SPEC=triton-windows<3.6"
if "%TORCH_VERSION%"=="2.10" set "TRITON_SPEC=triton-windows<3.7"
"%PYTHON_EXE%" -I -m pip install "%TRITON_SPEC%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Triton installation failed."
    exit /b 1
)

call "%ROOT%\install\windows\_ui.bat" info "Installing SageAttention 2.2.0..."
"%PYTHON_EXE%" -I -m pip uninstall sageattention -y >nul 2>&1
"%PYTHON_EXE%" -I -m pip install "%SAGE2_WHL%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "SageAttention 2.2.0 installation failed."
    exit /b 1
)

call "%ROOT%\install\windows\_ui.bat" info "Installing SageAttention 3..."
"%PYTHON_EXE%" -I -m pip uninstall sageattn3 -y >nul 2>&1
"%PYTHON_EXE%" -I -m pip install "%SAGE3_WHL%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "SageAttention 3 installation failed."
    exit /b 1
)

echo.
call "%ROOT%\install\windows\_ui.bat" ok "SageAttention is installed."
exit /b 0

:: -----------------------------------------------------------------------------
:: Helpers
:: -----------------------------------------------------------------------------

:read_versions
set "PYTHON_VERSION="
set "TORCH_VERSION=Not found"
set "CUDA_VERSION=Not available"
for /f "tokens=2" %%i in ('"%PYTHON_EXE%" --version 2^>^&1') do (
    for /f "tokens=1,2 delims=." %%a in ("%%i") do set "PYTHON_VERSION=%%a.%%b"
)
if not exist "%ROOT%\runtime\tmp\" mkdir "%ROOT%\runtime\tmp"
set "BLOMBO_VER_FILE=%ROOT%\runtime\tmp\comfy-attn-ver.txt"
"%PYTHON_EXE%" -I -c "import os, torch; v=torch.__version__.split(chr(43))[0]; open(os.environ['BLOMBO_VER_FILE'], 'w', encoding='utf-8').write(v.rsplit(chr(46), 1)[0] + chr(10) + (torch.version.cuda or 'none'))"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Torch was not found in ComfyUI's Python."
    exit /b 1
)
set "IDX=0"
for /f "usebackq delims=" %%a in ("%BLOMBO_VER_FILE%") do (
    if !IDX!==0 set "TORCH_VERSION=%%a"
    if !IDX!==1 set "CUDA_VERSION=%%a"
    set /a IDX+=1
)
del /q "%BLOMBO_VER_FILE%" >nul 2>&1
call "%ROOT%\install\windows\_ui.bat" info "Python %PYTHON_VERSION%, Torch %TORCH_VERSION%, CUDA %CUDA_VERSION%"
if "%PYTHON_VERSION%"=="" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not read the Python version."
    exit /b 1
)
if "%TORCH_VERSION%"=="Not found" (
    call "%ROOT%\install\windows\_ui.bat" error "Torch was not found in ComfyUI's Python."
    exit /b 1
)
if /i "%CUDA_VERSION%"=="none" set "CUDA_VERSION=Not available"
if "%CUDA_VERSION%"=="Not available" (
    call "%ROOT%\install\windows\_ui.bat" error "CUDA was not available in this Torch build."
    exit /b 1
)
exit /b 0

:clean_tmp_packages
if exist "%SITE_PACKAGES%\~*" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%SITE_PACKAGES%' -Directory | Where-Object { $_.Name -like '~*' } | Remove-Item -Recurse -Force"
)
exit /b 0
