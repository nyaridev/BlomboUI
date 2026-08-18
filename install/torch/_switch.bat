@echo off
:: Replace Torch inside ComfyUI's Python only (runtime\comfy\python_embeded).
:: Called by the version bats in this folder:
::   _switch.bat TORCH  TORCHVISION  TORCHAUDIO  cu128|cu130
::
:: Does not touch BlomboUI Python in runtime\python_embeded.

setlocal EnableExtensions
cd /D "%~dp0..\.."
title BlomboUI - Switch Torch

:: --- Paths -----------------------------------------------------------------
set "ROOT=%cd%"
set "UI=%~dp0..\_ui.bat"
set "PY=%ROOT%\runtime\comfy\python_embeded\python.exe"
set "TORCH=%~1"
set "VISION=%~2"
set "AUDIO=%~3"
set "CUDA=%~4"
set "PIPargs=--no-cache-dir --no-warn-script-location --no-deps --timeout=1000 --retries 10"

call "%UI%"

if "%TORCH%"=="" (
    call "%UI%" err "Usage: _switch.bat TORCH TORCHVISION TORCHAUDIO cu128|cu130"
    call "%UI%" wait
    exit /b 1
)

call "%UI%" header "switch Torch"

:: --- Guard -----------------------------------------------------------------
if not exist "%PY%" (
    call "%UI%" warn "ComfyUI Python not found."
    call "%UI%" kv "python" "%PY%" err
    call "%UI%" note "Run install\install-comfyui.bat first."
    call "%UI%" wait
    exit /b 1
)

:: CUDA 13 packs need NVIDIA driver 580+.
if /I "%CUDA%"=="cu130" call :NVIDIA_DRIVER_CHECK
if errorlevel 1 exit /b 1

:: --- Install ---------------------------------------------------------------
call "%UI%" section "%TORCH% + %CUDA%"
call "%UI%" kv "python" "%PY%"
call "%UI%" kv "torch" "%TORCH%"
call "%UI%" kv "vision" "%VISION%"
call "%UI%" kv "audio" "%AUDIO%"
call "%UI%" kv "index" "%CUDA%"
call "%UI%" note "Does not touch BlomboUI Python in runtime\python_embeded."

call "%UI%" note "Uninstalling previous Torch"
"%PY%" -I -m pip uninstall torch torchvision torchaudio -y
if errorlevel 1 (
    call "%UI%" err "Uninstall failed."
    call "%UI%" wait
    exit /b 1
)

call "%UI%" note "Installing Torch %TORCH%+%CUDA%"
"%PY%" -I -m pip install torch==%TORCH% torchvision==%VISION% torchaudio==%AUDIO% --index-url https://download.pytorch.org/whl/%CUDA% %PIPargs%
if errorlevel 1 (
    call "%UI%" err "Torch install failed."
    call "%UI%" wait
    exit /b 1
)

call "%UI%" section "Done"
call "%UI%" ok "Torch %TORCH%+%CUDA% installed."
"%PY%" -I -c "import torch; print('    ' + torch.__version__ + '  cuda=' + str(torch.cuda.is_available()))"
call "%UI%" wait
exit /b 0

:: --- NVIDIA driver (cu130 only) --------------------------------------------
:NVIDIA_DRIVER_CHECK
set "NV_MIN=580"
where.exe nvidia-smi.exe >nul 2>&1
if %errorLevel% neq 0 (
    call "%UI%" warn "NVIDIA driver not detected. CUDA 13 may not work."
    exit /b 0
)
for /f %%a in ('nvidia-smi --query-gpu^=driver_version --format^=csv^,noheader 2^>nul') do set "NV_FULL=%%a"
for /f "tokens=1 delims=." %%a in ("%NV_FULL%") do set "NV_MAJOR=%%a"
if not defined NV_MAJOR exit /b 0
call "%UI%" kv "driver" "%NV_FULL%"
if %NV_MAJOR% LSS %NV_MIN% (
    call "%UI%" err "Driver below %NV_MIN%. CUDA 13 wheels need a newer NVIDIA driver."
    call "%UI%" note "Use a cu128 pack instead, or update the driver."
    call "%UI%" wait
    exit /b 1
)
exit /b 0
