@echo off
setlocal EnableExtensions

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..\..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"
call "%ROOT%\install\windows\comfyui\_pick_slot.bat"
if errorlevel 1 exit /b 1
if not defined COMFY_PYTHON set "COMFY_PYTHON=%ROOT%\runtime\comfyui\%COMFY_SLOT%\python_embeded\python.exe"
set "PYTHON_EXE=%COMFY_PYTHON%"
set "PIP_ARGS=--no-cache-dir --no-warn-script-location --no-deps --timeout=1000 --retries 10"

:: -----------------------------------------------------------------------------
:: Arguments
:: -----------------------------------------------------------------------------

if "%~4"=="" (
    call "%ROOT%\install\windows\_ui.bat" error "Usage: _switch.bat torch-version torchvision-version torchaudio-version cuda-tag"
    exit /b 1
)

set "TORCH_VERSION=%~1"
set "TORCHVISION_VERSION=%~2"
set "TORCHAUDIO_VERSION=%~3"
set "CUDA_TAG=%~4"

:: -----------------------------------------------------------------------------
:: Validation
:: -----------------------------------------------------------------------------

if not exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's embedded Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\comfyui\install_comfyui.bat first."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Install
:: -----------------------------------------------------------------------------

title Torch %TORCH_VERSION% %CUDA_TAG% for BlomboUI ComfyUI
call "%ROOT%\install\windows\_ui.bat" section "Torch %TORCH_VERSION% %CUDA_TAG%"
call "%ROOT%\install\windows\_ui.bat" info "Installing Torch %TORCH_VERSION% with CUDA %CUDA_TAG%..."

"%PYTHON_EXE%" -I -m pip uninstall torch torchvision torchaudio -y
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Existing Torch packages could not be removed."
    exit /b 1
)

"%PYTHON_EXE%" -I -m pip install torch==%TORCH_VERSION% torchvision==%TORCHVISION_VERSION% torchaudio==%TORCHAUDIO_VERSION% --index-url "https://download.pytorch.org/whl/%CUDA_TAG%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Torch installation failed."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Completion
:: -----------------------------------------------------------------------------

echo.
call "%ROOT%\install\windows\_ui.bat" ok "Torch %TORCH_VERSION% with CUDA %CUDA_TAG% is installed."
exit /b 0
