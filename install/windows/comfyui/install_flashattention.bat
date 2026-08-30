@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..\..") do set ROOT=%%~fI
call "%ROOT%\install\windows\_ui.bat"
call "%ROOT%\install\windows\comfyui\_pick_slot.bat"
if errorlevel 1 exit /b 1
if not defined COMFY_PYTHON set COMFY_PYTHON=%ROOT%\runtime\comfyui\%COMFY_SLOT%\python_embeded\python.exe
set PYTHON_EXE=%COMFY_PYTHON%
set PIP_ARGS=--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10 --use-pep517

:: -----------------------------------------------------------------------------
:: Preflight
:: -----------------------------------------------------------------------------

if not exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's embedded Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\comfyui\install_comfyui.bat first."
    exit /b 1
)

for %%I in ("%PYTHON_EXE%") do set PYTHON_DIR=%%~dpI
set SITE_PACKAGES=%PYTHON_DIR%Lib\site-packages

"%PYTHON_EXE%" -I -c "import flash_attn" >nul 2>&1
if not errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" ok "FlashAttention is already installed."
    exit /b 0
)

call :read_versions
if errorlevel 1 exit /b 1

set FLASH_WHL=
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.7" if "%CUDA_VERSION%"=="12.8" set FLASH_WHL=https://github.com/kingbri1/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu128torch2.7.0cxx11abiFALSE-cp312-cp312-win_amd64.whl
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.8" if "%CUDA_VERSION%"=="12.8" set FLASH_WHL=https://github.com/kingbri1/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu128torch2.8.0cxx11abiFALSE-cp312-cp312-win_amd64.whl
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.9" if "%CUDA_VERSION%"=="13.0" set FLASH_WHL=https://huggingface.co/Wildminder/AI-windows-whl/resolve/main/flash_attn-2.8.3+cu130torch2.9.1cxx11abiTRUE-cp312-cp312-win_amd64.whl
if "%PYTHON_VERSION%"=="3.12" if "%TORCH_VERSION%"=="2.10" if "%CUDA_VERSION%"=="13.0" set FLASH_WHL=https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.7.13/flash_attn-2.8.3+cu130torch2.10-cp312-cp312-win_amd64.whl

if "%FLASH_WHL%"=="" (
    call "%ROOT%\install\windows\_ui.bat" error "No FlashAttention wheel for Python %PYTHON_VERSION%, Torch %TORCH_VERSION%, CUDA %CUDA_VERSION%."
    call "%ROOT%\install\windows\_ui.bat" info "Supported: Python 3.12 with Torch 2.7/2.8 + CUDA 12.8, or Torch 2.9/2.10 + CUDA 13.0."
    exit /b 1
)

call :clean_tmp_packages

:: -----------------------------------------------------------------------------
:: Install
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" section "FlashAttention"
"%PYTHON_EXE%" -I -c "import triton" >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" info "Installing Triton..."
    "%PYTHON_EXE%" -I -m pip uninstall triton-windows -y >nul 2>&1
    set TRITON_SPEC=
    if "%TORCH_VERSION%"=="2.7" set TRITON_SPEC=triton-windows^<3.4
    if "%TORCH_VERSION%"=="2.8" set TRITON_SPEC=triton-windows^<3.5
    if "%TORCH_VERSION%"=="2.9" set TRITON_SPEC=triton-windows^<3.6
    if "%TORCH_VERSION%"=="2.10" set TRITON_SPEC=triton-windows^<3.7
    "%PYTHON_EXE%" -I -m pip install "%TRITON_SPEC%" %PIP_ARGS%
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" error "Triton installation failed."
        exit /b 1
    )
)

call "%ROOT%\install\windows\_ui.bat" info "Installing FlashAttention 2.8.3..."
"%PYTHON_EXE%" -I -m pip uninstall flash-attn -y >nul 2>&1
"%PYTHON_EXE%" -I -m pip install "%FLASH_WHL%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "FlashAttention installation failed."
    exit /b 1
)

echo.
call "%ROOT%\install\windows\_ui.bat" ok "FlashAttention is installed."
exit /b 0

:: -----------------------------------------------------------------------------
:: Helpers
:: -----------------------------------------------------------------------------

:read_versions
set PYTHON_VERSION=
set TORCH_VERSION=Not found
set CUDA_VERSION=Not available
for /f "tokens=2" %%i in ('"%PYTHON_EXE%" --version 2^>^&1') do (
    for /f "tokens=1,2 delims=." %%a in ("%%i") do set PYTHON_VERSION=%%a.%%b
)
if not exist "%ROOT%\runtime\tmp\" mkdir "%ROOT%\runtime\tmp"
set BLOMBO_VER_FILE=%ROOT%\runtime\tmp\comfy-attn-ver.txt
"%PYTHON_EXE%" -I -c "import os, torch; v=torch.__version__.split(chr(43))[0]; open(os.environ['BLOMBO_VER_FILE'], 'w', encoding='utf-8').write(v.rsplit(chr(46), 1)[0] + chr(10) + (torch.version.cuda or 'none'))"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Torch was not found in ComfyUI's Python."
    exit /b 1
)
set IDX=0
for /f "usebackq delims=" %%a in ("%BLOMBO_VER_FILE%") do (
    if !IDX!==0 set TORCH_VERSION=%%a
    if !IDX!==1 set CUDA_VERSION=%%a
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
if /i "%CUDA_VERSION%"=="none" set CUDA_VERSION=Not available
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
