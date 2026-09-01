@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: -----------------------------------------------------------------------------
:: Configuration
:: JamePeng vision wheels: https://github.com/JamePeng/llama-cpp-python/releases
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

call :handlers_ok
if not errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" ok "QwenVL GGUF llama-cpp-python is already installed."
    exit /b 0
)

call :read_versions
if errorlevel 1 exit /b 1

set LLAMA_WHL=
if "%PYTHON_VERSION%"=="3.12" if "%CUDA_VERSION%"=="12.8" set LLAMA_WHL=https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu128-win-20260831/llama_cpp_python-0.3.49%%2Bcu128-cp312-cp312-win_amd64.whl
if "%PYTHON_VERSION%"=="3.12" if "%CUDA_VERSION%"=="13.0" set LLAMA_WHL=https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu130-win-20260831/llama_cpp_python-0.3.49%%2Bcu130-cp312-cp312-win_amd64.whl
if "%PYTHON_VERSION%"=="3.12" if "%CUDA_VERSION%"=="13.1" set LLAMA_WHL=https://github.com/JamePeng/llama-cpp-python/releases/download/v0.3.49-cu131-win-20260831/llama_cpp_python-0.3.49%%2Bcu131-cp312-cp312-win_amd64.whl

if "%LLAMA_WHL%"=="" (
    call "%ROOT%\install\windows\_ui.bat" error "No QwenVL GGUF llama-cpp-python wheel for Python %PYTHON_VERSION%, CUDA %CUDA_VERSION%."
    call "%ROOT%\install\windows\_ui.bat" info "Supported: Python 3.12 with CUDA 12.8, 13.0, or 13.1."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Install
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" section "QwenVL GGUF"
call "%ROOT%\install\windows\_ui.bat" info "Installing llama-cpp-python with vision handlers..."
"%PYTHON_EXE%" -I -m pip uninstall llama-cpp-python -y >nul 2>&1
"%PYTHON_EXE%" -I -m pip install --upgrade --force-reinstall --no-deps "%LLAMA_WHL%" %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "llama-cpp-python wheel installation failed."
    exit /b 1
)
"%PYTHON_EXE%" -I -m pip install diskcache typing-extensions jinja2 %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "llama-cpp-python runtime dependencies failed."
    exit /b 1
)

call :handlers_ok
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Installed llama-cpp-python is missing Qwen3VLChatHandler."
    exit /b 1
)

echo.
call "%ROOT%\install\windows\_ui.bat" ok "QwenVL GGUF llama-cpp-python is installed."
exit /b 0

:: -----------------------------------------------------------------------------
:: Helpers
:: -----------------------------------------------------------------------------

:handlers_ok
"%PYTHON_EXE%" -I -c "from llama_cpp.llama_chat_format import Qwen3VLChatHandler" >nul 2>&1
if not errorlevel 1 exit /b 0
"%PYTHON_EXE%" -I -c "from llama_cpp.llama_multimodal import Qwen3VLChatHandler" >nul 2>&1
exit /b %errorlevel%

:read_versions
set PYTHON_VERSION=
set TORCH_VERSION=Not found
set CUDA_VERSION=Not available
for /f "tokens=2" %%i in ('"%PYTHON_EXE%" --version 2^>^&1') do (
    for /f "tokens=1,2 delims=." %%a in ("%%i") do set PYTHON_VERSION=%%a.%%b
)
if not exist "%ROOT%\runtime\tmp\" mkdir "%ROOT%\runtime\tmp"
set BLOMBO_VER_FILE=%ROOT%\runtime\tmp\comfy-llamacpp-ver.txt
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
exit /b 0
