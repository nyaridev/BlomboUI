@echo off
:: Resolve COMFY_SLOT / COMFY_DIR / COMFY_PYTHON.
::   call _pick_slot.bat           prompt (Enter = last)
::   call _pick_slot.bat /selected last slot only; prompt if none
:: Skips when COMFYUI_PATH is set, or when COMFY_DIR + COMFY_PYTHON already work.

if not defined ROOT for %%I in ("%~dp0..\..\..") do set "ROOT=%%~fI"
if not defined COMFY_ROOT set "COMFY_ROOT=%ROOT%\runtime\comfyui"
set "VERSIONS=%~dp0versions"

if defined COMFYUI_PATH if not defined COMFY_DIR for %%I in (%COMFYUI_PATH%) do set "COMFY_DIR=%%~fI"
if defined COMFYUI_PATH if not defined COMFY_PYTHON if exist "%COMFY_DIR%\..\python_embeded\python.exe" for %%I in ("%COMFY_DIR%\..\python_embeded\python.exe") do set "COMFY_PYTHON=%%~fI"
if defined COMFYUI_PATH if not defined COMFY_PYTHON if exist "%COMFY_DIR%\venv\Scripts\python.exe" set "COMFY_PYTHON=%COMFY_DIR%\venv\Scripts\python.exe"
if defined COMFYUI_PATH if not defined COMFY_PYTHON if exist "%COMFY_DIR%\.venv\Scripts\python.exe" set "COMFY_PYTHON=%COMFY_DIR%\.venv\Scripts\python.exe"
if defined COMFYUI_PATH exit /b 0
if defined COMFY_DIR if exist "%COMFY_DIR%\main.py" if defined COMFY_PYTHON if exist "%COMFY_PYTHON%" exit /b 0

if not exist "%COMFY_ROOT%\" mkdir "%COMFY_ROOT%"

set "LAST="
if exist "%COMFY_ROOT%\selected" (
    set /p LAST=<"%COMFY_ROOT%\selected"
)
if defined COMFY_SLOT goto :apply

if /i "%~1"=="/selected" if defined LAST (
    set "COMFY_SLOT=%LAST%"
    goto :apply
)

setlocal EnableExtensions EnableDelayedExpansion
set "N=0"
if exist "%VERSIONS%\latest.bat" (
    set /a N+=1
    set "SLOT_1=latest"
    echo   1. latest
)
if exist "%VERSIONS%\*.bat" for %%F in ("%VERSIONS%\*.bat") do (
    if /i not "%%~nF"=="latest" (
        set /a N+=1
        set "SLOT_!N!=%%~nF"
        echo   !N!. %%~nF
    )
)
if exist "%COMFY_ROOT%\" for /d %%D in ("%COMFY_ROOT%\*") do (
    set "NAME=%%~nxD"
    set "SEEN="
    for /L %%I in (1,1,!N!) do if /i "!SLOT_%%I!"=="!NAME!" set "SEEN=1"
    if not defined SEEN (
        set /a N+=1
        set "SLOT_!N!=!NAME!"
        echo   !N!. !NAME!
    )
)
if !N! EQU 0 (
    echo   1. latest
    echo   2. 0.28.0
    set "N=2"
    set "SLOT_1=latest"
    set "SLOT_2=0.28.0"
)
set "HINT=!LAST!"
if not defined HINT set "HINT=!SLOT_1!"
echo.
set /p "PICK=ComfyUI version [!HINT!]: "
if "!PICK!"=="" set "PICK=!HINT!"
set "CHOSEN="
for /L %%I in (1,1,!N!) do if "!PICK!"=="%%I" set "CHOSEN=!SLOT_%%I!"
if not defined CHOSEN set "CHOSEN=!PICK!"
for %%S in ("!CHOSEN!") do endlocal & set "COMFY_SLOT=%%~S"

:apply
if exist "%VERSIONS%\%COMFY_SLOT%.bat" call "%VERSIONS%\%COMFY_SLOT%.bat"
if not defined COMFY_TORCH set "COMFY_TORCH=2.10.0+cu130"
if not exist "%COMFY_ROOT%\" mkdir "%COMFY_ROOT%"
set "COMFY_DIR=%COMFY_ROOT%\%COMFY_SLOT%\ComfyUI"
set "COMFY_PYTHON=%COMFY_ROOT%\%COMFY_SLOT%\python_embeded\python.exe"
> "%COMFY_ROOT%\selected" echo %COMFY_SLOT%
exit /b 0
