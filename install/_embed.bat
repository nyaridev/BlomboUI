@echo off
:: Bootstrap a CPython 3.12 embed folder: python.exe, pip, and uv.
::
::   call _embed.bat DEST_DIR  [first line for python312._pth]
::
:: DEST_DIR is either:
::   runtime\python_embeded          (BlomboUI / FastAPI)
::   runtime\comfy\python_embeded    (ComfyUI / Torch)
::
:: PTH_FIRST_LINE is prepended to python312._pth so that folder can import
:: app code without a venv (../../app/api or ../ComfyUI).

setlocal EnableExtensions
set "UI=%~dp0_ui.bat"
set "PYEMBED=%~1"
set "PTH_EXTRA=%~2"
set "PY=%PYEMBED%\python.exe"
set "PIPargs=--no-cache-dir --no-warn-script-location --timeout=1000 --retries 10"
set "PY_ZIP=python-3.12.10-embed-amd64.zip"
set "PY_URL=https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip"
set "GETPIP_URL=https://bootstrap.pypa.io/get-pip.py"

call "%UI%"

if "%PYEMBED%"=="" (
    call "%UI%" err "_embed.bat needs a destination folder."
    exit /b 1
)

md "%PYEMBED%" 2>nul
if exist "%PY%" (
    call "%UI%" note "Python already present. Ensuring pip and uv."
    goto :pth
)

:: --- Download + extract ----------------------------------------------------
pushd "%PYEMBED%"
call "%UI%" download "%PY_URL%" "%PY_ZIP%"
if errorlevel 1 goto :fail_popd
call "%UI%" note "Extracting Python embed"
tar.exe -xmf "%PY_ZIP%"
if errorlevel 1 powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%PY_ZIP%' -DestinationPath '.' -Force"
erase "%PY_ZIP%" 2>nul
if not exist "python.exe" (
    call "%UI%" err "Python embed extract failed."
    goto :fail_popd
)
> pip.ini (
    echo [global]
    echo trusted-host =
    echo     pypi.org
    echo     files.pythonhosted.org
    echo     pypi.python.org
)
popd

:: --- python312._pth --------------------------------------------------------
:: Embed Python ignores site-packages unless those paths are listed here.
:pth
(
    if not "%PTH_EXTRA%"=="" echo %PTH_EXTRA%
    echo python312.zip
    echo .
    echo Lib/site-packages
    echo Lib
    echo Scripts
    echo # import site
) > "%PYEMBED%\python312._pth"

:: --- pip -------------------------------------------------------------------
"%PY%" -I -m pip --help >nul 2>&1
if %errorlevel%==0 goto :uv
pushd "%PYEMBED%"
call "%UI%" note "Installing pip"
call "%UI%" download "%GETPIP_URL%" "get-pip.py"
if errorlevel 1 goto :fail_popd
.\python.exe -I get-pip.py %PIPargs% --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
if errorlevel 1 (
    call "%UI%" err "get-pip failed."
    goto :fail_popd
)
popd

:: --- uv --------------------------------------------------------------------
:uv
"%PY%" -I -m uv --help >nul 2>&1
if %errorlevel%==0 (
    call "%UI%" note "pip and uv ready"
    exit /b 0
)
call "%UI%" note "Installing uv"
"%PY%" -I -m pip install uv %PIPargs%
if errorlevel 1 (
    call "%UI%" err "uv install failed."
    exit /b 1
)
call "%UI%" note "pip and uv ready"
exit /b 0

:fail_popd
popd
exit /b 1
