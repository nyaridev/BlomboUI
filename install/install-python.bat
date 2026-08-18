@echo off
:: Install BlomboUI's Python (FastAPI). Not ComfyUI's Torch Python.
:: Double-click this, or webui.bat calls it with "nopause" on first launch.
::
::   install-python.bat            interactive
::   install-python.bat nopause    used by webui.bat

setlocal EnableExtensions
cd /D "%~dp0"
title BlomboUI - Install Python

set "UI=%~dp0_ui.bat"
set "NOPAUSE=%~1"
for %%I in ("%~dp0..\runtime\python_embeded") do set "PYEMBED=%%~fI"

call "%UI%"
if /I not "%NOPAUSE%"=="nopause" call "%UI%" header "install Python"

:: --- Embed -----------------------------------------------------------------
:: ../../app/api on python312._pth so `import blombo` works without a venv.
call "%UI%" section "Python 3.12 embed"
call "%UI%" kv "target" "%PYEMBED%"
call "%~dp0_embed.bat" "%PYEMBED%" "../../app/api"
if errorlevel 1 goto :fail

call "%UI%" ok "BlomboUI Python ready"
call "%UI%" kv "python" "%PYEMBED%\python.exe"
if /I not "%NOPAUSE%"=="nopause" call "%UI%" wait
exit /b 0

:fail
call "%UI%" err "Python setup unsuccessful."
if /I not "%NOPAUSE%"=="nopause" call "%UI%" wait
exit /b 1
