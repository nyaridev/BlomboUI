@echo off
setlocal EnableExtensions

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"

if not defined GIT set "GIT=git"
for %%I in (%GIT%) do set "GIT_EXE=%%~I"

if not defined COMFY_DIR set "COMFY_DIR=%ROOT%\runtime\comfyui\ComfyUI"
if not defined COMFY_PYTHON set "COMFY_PYTHON=%ROOT%\runtime\comfyui\python_embeded\python.exe"
set "PYTHON_EXE=%COMFY_PYTHON%"
set "UV_ARGS=--no-cache --link-mode=copy"
set "GIT_TERMINAL_PROMPT=0"
set "GIT_ASKPASS=echo"
set "GIT_LFS_SKIP_SMUDGE=1"

:: -----------------------------------------------------------------------------
:: Preflight
:: -----------------------------------------------------------------------------

if not exist "%COMFY_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\install_comfyui.bat first."
    exit /b 1
)

if not exist "%PYTHON_EXE%" (
    call "%ROOT%\install\windows\_ui.bat" error "ComfyUI's embedded Python was not found."
    call "%ROOT%\install\windows\_ui.bat" info "Run install\windows\install_comfyui.bat first."
    exit /b 1
)

if not exist "%COMFY_DIR%\custom_nodes\" mkdir "%COMFY_DIR%\custom_nodes"
if not exist "%COMFY_DIR%\custom_nodes\" (
    call "%ROOT%\install\windows\_ui.bat" error "Could not create the ComfyUI custom_nodes directory."
    exit /b 1
)

call "%ROOT%\install\windows\install_git.bat" quiet
if errorlevel 1 exit /b 1
"%GIT_EXE%" --version >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Git was not found. Install Git or set GIT to its executable path."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Custom nodes
:: Add another node by adding one call below.
:: -----------------------------------------------------------------------------

call :install_node "comfyui-manager" "https://github.com/Comfy-Org/ComfyUI-Manager"
if errorlevel 1 exit /b 1
call :install_node "rgthree-comfy" "https://github.com/rgthree/rgthree-comfy"
if errorlevel 1 exit /b 1

:: -----------------------------------------------------------------------------
:: Completion
:: -----------------------------------------------------------------------------

echo.
call "%ROOT%\install\windows\_ui.bat" ok "ComfyUI custom nodes are ready."
exit /b 0

:: -----------------------------------------------------------------------------
:: Node installer
:: -----------------------------------------------------------------------------

:install_node
set "NODE_NAME=%~1"
set "NODE_URL=%~2"
set "NODE_DIR=%COMFY_DIR%\custom_nodes\%NODE_NAME%"

if not exist "%NODE_DIR%\" (
    call "%ROOT%\install\windows\_ui.bat" info "Downloading %NODE_NAME%..."
    "%GIT_EXE%" clone "%NODE_URL%" "%NODE_DIR%"
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" error "%NODE_NAME% download failed."
        exit /b 1
    )
) else (
    call "%ROOT%\install\windows\_ui.bat" ok "%NODE_NAME% already exists. Skipping download."
)

if exist "%NODE_DIR%\requirements.txt" (
    for %%F in ("%NODE_DIR%\requirements.txt") do if not %%~zF==0 (
        call "%ROOT%\install\windows\_ui.bat" info "Installing %NODE_NAME% requirements..."
        "%PYTHON_EXE%" -I -m uv pip install -r "%NODE_DIR%\requirements.txt" %UV_ARGS%
        if errorlevel 1 (
            call "%ROOT%\install\windows\_ui.bat" error "%NODE_NAME% dependency installation failed."
            exit /b 1
        )
    )
)

if exist "%NODE_DIR%\install.py" (
    call "%ROOT%\install\windows\_ui.bat" info "Running %NODE_NAME% installer..."
    pushd "%COMFY_DIR%"
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" error "Could not enter the ComfyUI directory."
        exit /b 1
    )
    "%PYTHON_EXE%" -I "custom_nodes\%NODE_NAME%\install.py"
    if errorlevel 1 (
        popd
        call "%ROOT%\install\windows\_ui.bat" error "%NODE_NAME% installer failed."
        exit /b 1
    )
    popd
)

exit /b 0
