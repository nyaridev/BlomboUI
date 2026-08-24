@echo off
setlocal EnableExtensions

:: -----------------------------------------------------------------------------
:: Configuration
:: -----------------------------------------------------------------------------

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
call "%ROOT%\install\windows\_ui.bat"

if not defined GIT set "GIT=git"
if /i "%~1"=="quiet" set "GIT_QUIET=1"

:: -----------------------------------------------------------------------------
:: Git check
:: -----------------------------------------------------------------------------

where.exe "%GIT%" >nul 2>&1
if not errorlevel 1 (
    if not defined GIT_QUIET (
        call "%ROOT%\install\windows\_ui.bat" section "Git"
        call "%ROOT%\install\windows\_ui.bat" ok "Git is already installed."
    )
    exit /b 0
)

:: -----------------------------------------------------------------------------
:: Install
:: -----------------------------------------------------------------------------

call "%ROOT%\install\windows\_ui.bat" section "Git"

call "%ROOT%\install\windows\_ui.bat" info "Git was not found. Installing Git with winget..."
where.exe winget.exe >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "winget was not found. Install Git from https://git-scm.com/ and run again."
    exit /b 1
)

winget.exe install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Git installation failed."
    exit /b 1
)

set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%LocalAppData%\Programs\Git\cmd"

where.exe "%GIT%" >nul 2>&1
if errorlevel 1 (
    call "%ROOT%\install\windows\_ui.bat" error "Git was installed but is not on PATH yet. Open a new terminal and retry."
    exit /b 1
)

call "%ROOT%\install\windows\_ui.bat" ok "Git is ready."
endlocal & set "PATH=%PATH%"
exit /b 0
