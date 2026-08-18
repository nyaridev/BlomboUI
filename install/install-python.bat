@echo off
setlocal EnableExtensions
cd /D "%~dp0"
title BlomboUI - Install Python

set "UI=%~dp0_ui.bat"
set "NOPAUSE=%~1"
for %%I in ("%~dp0..\runtime\python_embeded") do set "PYEMBED=%%~fI"

call "%UI%"
if /I not "%NOPAUSE%"=="nopause" call "%UI%" header "install Python"

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
