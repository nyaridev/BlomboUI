@echo off
setlocal EnableExtensions

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"

if not defined GIT set "GIT=git"
for %%I in (%GIT%) do set "GIT_EXE=%%~I"

set "RUNTIME_DIR=%ROOT%\runtime"
set "COMFY_ROOT=%RUNTIME_DIR%\comfyui"
set "COMFY_DIR=%COMFY_ROOT%\ComfyUI"
set "PYTHON_DIR=%COMFY_ROOT%\python_embeded"
set "PYTHON_EXE=%PYTHON_DIR%\python.exe"
set "PYTHON_ARCHIVE=python-3.12.10-embed-amd64.zip"
set "PYTHON_ARCHIVE_PATH=%PYTHON_DIR%\%PYTHON_ARCHIVE%"
set "GET_PIP_PATH=%PYTHON_DIR%\get-pip.py"
set "PYTHON_URL=https://www.python.org/ftp/python/3.12.10/%PYTHON_ARCHIVE%"
set "GET_PIP_URL=https://bootstrap.pypa.io/get-pip.py"
set "PIP_ARGS=--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10"
set "UV_ARGS=--no-cache --link-mode=copy"

set "GIT_TERMINAL_PROMPT=0"
set "GIT_ASKPASS=echo"
set "GIT_LFS_SKIP_SMUDGE=1"

:: -----------------------------------------------------------------------------
:: Git
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\install_git.bat" quiet
if errorlevel 1 exit /b 1
"%GIT_EXE%" --version >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Git was not found. Install Git or set GIT to its executable path."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Paths
:: -----------------------------------------------------------------------------

if not exist "%RUNTIME_DIR%\" mkdir "%RUNTIME_DIR%"
if not exist "%COMFY_ROOT%\" mkdir "%COMFY_ROOT%"
if not exist "%COMFY_ROOT%\" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not create the ComfyUI runtime directory."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: ComfyUI clone
:: -----------------------------------------------------------------------------

if not exist "%COMFY_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" info "Downloading ComfyUI..."
    "%GIT_EXE%" clone https://github.com/Comfy-Org/ComfyUI "%COMFY_DIR%"
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" error "ComfyUI download failed."
        exit /b 1
    )
) else (
    call "%ROOT%\install\windows\_ui.bat" ok "ComfyUI folder already exists. Skipping download."
)

:: -----------------------------------------------------------------------------
:: Embedded Python
:: -----------------------------------------------------------------------------

if exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" ok "Embedded Python already exists. Skipping download."
    goto :install_comfyui_requirements
)

if not exist "%PYTHON_DIR%\" mkdir "%PYTHON_DIR%"
if not exist "%PYTHON_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not create the embedded Python directory."
    exit /b 1
)

pushd "%PYTHON_DIR%"

call "%ROOT%\install\windows\_ui.bat" info "Downloading embedded Python..."
call :download "%PYTHON_URL%" "%PYTHON_ARCHIVE_PATH%"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Embedded Python download failed."
    popd
    exit /b 1
)
if not exist "%PYTHON_ARCHIVE%" (
    call "%ROOT%\install\windows\_ui.bat" error "Embedded Python download failed."
    popd
    exit /b 1
)

tar.exe -xmf "%PYTHON_ARCHIVE%" -C "%PYTHON_DIR%"
if errorlevel 1 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath $env:PYTHON_ARCHIVE_PATH -DestinationPath $env:PYTHON_DIR -Force -ErrorAction Stop } catch { exit 1 }"
)
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Embedded Python extraction failed."
    popd
    exit /b 1
)
del /q "%PYTHON_ARCHIVE%"

if not exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" error "Embedded Python executable was not found after extraction."
    popd
    exit /b 1
)

call "%ROOT%\install\windows\_ui.bat" info "Configuring embedded Python..."
> "python312._pth" echo ../ComfyUI
>>"python312._pth" echo python312.zip
>>"python312._pth" echo .
>>"python312._pth" echo Lib/site-packages
>>"python312._pth" echo Lib
>>"python312._pth" echo Scripts
>>"python312._pth" echo # import site

> "pip.ini" echo [global]
>>"pip.ini" echo trusted-host =
>>"pip.ini" echo     pypi.org
>>"pip.ini" echo     files.pythonhosted.org
>>"pip.ini" echo     pypi.python.org

call "%ROOT%\install\windows\_ui.bat" info "Downloading pip..."
call :download "%GET_PIP_URL%" "%GET_PIP_PATH%"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "pip download failed."
    popd
    exit /b 1
)
if not exist "%GET_PIP_PATH%" (
    call "%ROOT%\install\windows\_ui.bat" error "pip download failed."
    popd
    exit /b 1
)

"%PYTHON_EXE%" -I "get-pip.py" %PIP_ARGS% --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "pip installation failed."
    popd
    exit /b 1
)
del /q "get-pip.py"

call "%ROOT%\install\windows\_ui.bat" info "Installing uv..."
"%PYTHON_EXE%" -I -m pip install uv %PIP_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "uv installation failed."
    popd
    exit /b 1
)

popd

:: -----------------------------------------------------------------------------
:: Requirements
:: -----------------------------------------------------------------------------

:install_comfyui_requirements
if not exist "%COMFY_DIR%\requirements.txt" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI requirements.txt was not found."
    exit /b 1
)

call "%ROOT%\install\windows\_ui.bat" info "Installing ComfyUI requirements..."
"%PYTHON_EXE%" -I -m uv pip install -r "%COMFY_DIR%\requirements.txt" %UV_ARGS%
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI dependency installation failed."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Default CUDA Torch
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" info "Installing default CUDA Torch..."
call "%ROOT%\install\windows\torch\2.10.0+cu130 (default).bat"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Default CUDA Torch installation failed."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Completion
:: -----------------------------------------------------------------------------

echo.
call "%ROOT%\install\windows\_ui.bat" ok "ComfyUI files are ready at %COMFY_ROOT%"
call "%ROOT%\install\windows\_ui.bat" info "Other Torch packages can be installed with the scripts in install\windows\torch."
exit /b 0

:: -----------------------------------------------------------------------------
:: Download
:: -----------------------------------------------------------------------------

:download
set "DL_URL=%~1"
set "DL_OUT=%~2"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_download.ps1" -Url "%DL_URL%" -OutFile "%DL_OUT%"
if not errorlevel 1 exit /b 0

curl.exe -L --ssl-no-revoke --retry 5 --retry-delay 2 -o "%DL_OUT%" "%DL_URL%"
if not errorlevel 1 exit /b 0

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Start-BitsTransfer -Source $env:DL_URL -Destination $env:DL_OUT -ErrorAction Stop } catch { exit 1 }"
exit /b %errorlevel%
