@echo off
setlocal EnableExtensions

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"

if not defined PYTHON set "PYTHON=python"
if not defined GIT set "GIT=git"
for %%I in (%PYTHON%) do set "PYTHON_EXE=%%~I"
for %%I in (%GIT%) do set "GIT_EXE=%%~I"
if not defined VENV_DIR (
    set "VENV_DIR=%ROOT%\runtime\.venv"
) else (
    for %%I in (%VENV_DIR%) do set "VENV_DIR=%%~fI"
)

:: -----------------------------------------------------------------------------
:: Tool checks
:: -----------------------------------------------------------------------------

where.exe uv >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "uv was not found on PATH."
    call "%ROOT%\install\windows\_ui.bat" info "Install uv before creating the project environment."
    exit /b 1
)

set "UV_PROJECT_ENVIRONMENT=%VENV_DIR%"

pushd "%ROOT%\app\backend"
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Backend project directory was not found."
    exit /b 1
)

:: -----------------------------------------------------------------------------
:: Environment creation
:: -----------------------------------------------------------------------------

if exist "%VENV_DIR%\pyvenv.cfg" (
    findstr.exe /i "python_embedded" "%VENV_DIR%\pyvenv.cfg" >nul
    if not errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" info "Replacing the previous embedded Python environment..."
        uv venv --no-project --clear --python "%PYTHON_EXE%" "%VENV_DIR%"
        if errorlevel 1 goto :backend_failed
    )
)

if not exist "%VENV_DIR%\Scripts\python.exe" (
    call "%ROOT%\install\windows\_ui.bat" info "Creating the project environment with %PYTHON_EXE%..."
    uv venv --no-project --python "%PYTHON_EXE%" "%VENV_DIR%"
    if errorlevel 1 goto :backend_failed
) else (
    call "%ROOT%\install\windows\_ui.bat" ok "Existing virtual environment found."
)

:: -----------------------------------------------------------------------------
:: Dependency sync
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" info "Installing locked backend dependencies..."
uv sync --frozen
if errorlevel 1 goto :backend_failed

:: -----------------------------------------------------------------------------
:: Completion
:: -----------------------------------------------------------------------------

popd

call "%ROOT%\install\windows\_ui.bat" info "Installing frontend dependencies..."
if not exist "%ROOT%\app\web\package.json" (
    call "%ROOT%\install\windows\_ui.bat" error "Frontend is missing: app\web\package.json"
    exit /b 1
)
where.exe npm.cmd >nul 2>&1
if errorlevel 1 (
    where.exe npm >nul 2>&1
    if errorlevel 1 (
        call "%ROOT%\install\windows\_ui.bat" error "Node.js / npm was not found on PATH."
        call "%ROOT%\install\windows\_ui.bat" info "Install Node.js LTS and run again."
        exit /b 1
    )
)
if not exist "%ROOT%\app\web\node_modules\" (
    pushd "%ROOT%\app\web"
    npm install
    if errorlevel 1 (
        popd
        call "%ROOT%\install\windows\_ui.bat" error "Frontend dependency installation failed."
        exit /b 1
    )
    popd
) else (
    call "%ROOT%\install\windows\_ui.bat" ok "Frontend dependencies already installed."
)

echo.
call "%ROOT%\install\windows\_ui.bat" ok "Project environment is ready at %VENV_DIR%"
exit /b 0

:: -----------------------------------------------------------------------------
:: Errors
:: -----------------------------------------------------------------------------

:backend_failed
popd
echo.
call "%ROOT%\install\windows\_ui.bat" error "Project environment setup failed."
exit /b 1
