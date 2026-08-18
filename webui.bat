@echo off
:: BlomboUI launcher. Prefer starting from webui-user.bat so your settings apply.
:: This file picks a Python, then runs app\launch.py (FastAPI + Vite + ComfyUI backend).

cd /D "%~dp0"
title BlomboUI

:: --- Paths -----------------------------------------------------------------
set "ROOT=%~dp0"
set "APP=%ROOT%app"
set "RUNTIME=%ROOT%runtime"
set "UI=%ROOT%install\_ui.bat"
set "EMBED_PY=%RUNTIME%\python_embeded\python.exe"
set "LOG=%RUNTIME%\tmp"

:: --- Console UI ------------------------------------------------------------
call "%UI%"

:: --- Optional overrides ----------------------------------------------------
:: webui.settings.bat is unused by default; webui-user.bat is the settings file.
if exist webui.settings.bat call webui.settings.bat
if defined GIT set "GIT_PYTHON_GIT_EXECUTABLE=%GIT%"
if not defined VENV_DIR set "VENV_DIR=%RUNTIME%\venv"

:: --- Guard -----------------------------------------------------------------
if not exist "%APP%\launch.py" (
    call "%UI%" err "app\launch.py is missing."
    goto :fail
)

mkdir "%LOG%" 2>NUL
call "%UI%" header "launcher"

:: --- Python ----------------------------------------------------------------
:: Order: PYTHON from webui-user.bat, else bundled embed, else download embed.
:: Bundled embed skips venv. A custom PYTHON uses runtime\venv unless VENV_DIR=-.
if defined PYTHON goto :have_python
if exist "%EMBED_PY%" goto :use_embed

call "%UI%" section "Python"
call "%UI%" note "Bundled Python not found. Downloading into runtime\python_embeded"
call "%ROOT%install\install-python.bat" nopause
if errorlevel 1 goto :fail

:use_embed
set PYTHON="%EMBED_PY%"
set SKIP_VENV=1
call "%UI%" kv "python" "%PYTHON%"
call "%UI%" note "bundled embed  (venv skipped)"
goto :check

:have_python
call "%UI%" kv "python" "%PYTHON%"
call "%UI%" note "from webui-user.bat"

:: --- pip -------------------------------------------------------------------
:check
%PYTHON% -c "" >"%LOG%\stdout.txt" 2>"%LOG%\stderr.txt"
if errorlevel 1 (
    call "%UI%" err "Couldn't launch python."
    call "%UI%" note "Set PYTHON in webui-user.bat, or delete runtime\python_embeded and relaunch."
    goto :show_logs
)
%PYTHON% -m pip --help >"%LOG%\stdout.txt" 2>"%LOG%\stderr.txt"
if errorlevel 1 (
    call "%UI%" err "Couldn't launch pip."
    goto :show_logs
)

:: --- venv ------------------------------------------------------------------
:: Only when PYTHON is overridden. Embed sets SKIP_VENV=1. VENV_DIR=- skips it.
if ["%VENV_DIR%"]==["-"] goto :run
if ["%SKIP_VENV%"]==["1"] goto :run
if exist "%VENV_DIR%\Scripts\Python.exe" goto :venv_ok

call "%UI%" section "venv"
for /f "delims=" %%i in ('%PYTHON% -c "import sys; print(sys.executable)"') do set "PYTHON_FULLNAME=%%i"
call "%UI%" kv "create" "%VENV_DIR%"
"%PYTHON_FULLNAME%" -m venv "%VENV_DIR%" >"%LOG%\stdout.txt" 2>"%LOG%\stderr.txt"
if errorlevel 1 (
    call "%UI%" err "Unable to create venv in %VENV_DIR%"
    goto :show_logs
)
"%VENV_DIR%\Scripts\Python.exe" -m pip install --upgrade pip
if errorlevel 1 call "%UI%" warn "Failed to upgrade pip"

:venv_ok
set PYTHON="%VENV_DIR%\Scripts\Python.exe"
call "%VENV_DIR%\Scripts\activate.bat"
call "%UI%" kv "venv" "%PYTHON%"

:: --- Launch ----------------------------------------------------------------
:run
call "%UI%" section "Status"
%PYTHON% "%APP%\launch.py" %COMMANDLINE_ARGS% %*
set "RC=%ERRORLEVEL%"
call "%UI%" wait
exit /b %RC%

:: --- Errors ----------------------------------------------------------------
:show_logs
echo.
call "%UI%" kv "exit code" "%ERRORLEVEL%" err
if exist "%LOG%\stdout.txt" (
    call "%UI%" section "stdout"
    type "%LOG%\stdout.txt"
)
if exist "%LOG%\stderr.txt" (
    call "%UI%" section "stderr"
    type "%LOG%\stderr.txt"
)

:fail
call "%UI%" err "Launch unsuccessful."
call "%UI%" wait
exit /b 1
