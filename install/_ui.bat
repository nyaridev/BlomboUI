@echo off
:: Shared console UI for launchers and installers.
:: Load once (no args), then call commands:
::
::   call "%UI%" header "launcher"
::   call "%UI%" section "Python"
::   call "%UI%" kv "python" "C:\..."
::   call "%UI%" kv "comfy" "missing" warn
::   call "%UI%" note "secondary line"
::   call "%UI%" item "next step"
::   call "%UI%" ok "done"
::   call "%UI%" warn "note"
::   call "%UI%" err "failed"
::   call "%UI%" wait
::   call "%UI%" download URL outfile

:: --- Colors ----------------------------------------------------------------
set brand=[38;5;213m
set accent=[38;5;81m
set muted=[38;5;245m
set white=[1;38;5;231m
set val=[38;5;229m
set okc=[38;5;114m
set warnc=[38;5;221m
set errc=[38;5;203m

set warning=[38;5;221m
set bold=[1m
set dim=[38;5;245m
set red=[38;5;203m
set green=[38;5;114m
set yellow=[38;5;229m
set cyan=[38;5;81m
set reset=[0m

:: --- ANSI / VT -------------------------------------------------------------
:: Enable virtual-terminal sequences so colors work in conhost, not only WT.
if not defined BLOMBO_VT (
    set "BLOMBO_VT=1"
    if not defined WT_SESSION powershell -NoProfile -ExecutionPolicy Bypass -Command "$d='[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int n);[DllImport(\"kernel32.dll\")]public static extern bool GetConsoleMode(IntPtr h,out uint m);[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,uint m);'; $t=Add-Type -MemberDefinition $d -Name T -PassThru; $h=$t::GetStdHandle(-11); $m=0; [void]$t::GetConsoleMode($h,[ref]$m); [void]$t::SetConsoleMode($h,$m -bor 4)" >nul 2>&1
)

:: --- Dispatch --------------------------------------------------------------
if "%~1"=="" exit /b 0
if /I "%~1"=="header" goto :header
if /I "%~1"=="section" goto :section
if /I "%~1"=="kv" goto :kv
if /I "%~1"=="note" goto :note
if /I "%~1"=="item" goto :item
if /I "%~1"=="ok" goto :ok
if /I "%~1"=="warn" goto :warn
if /I "%~1"=="err" goto :err
if /I "%~1"=="wait" goto :wait
if /I "%~1"=="download" goto :download
exit /b 1

:: --- header ----------------------------------------------------------------
:header
cls
echo.
echo   %brand%------------------------------------------------------------%reset%
echo     %white%BlomboUI%reset%    %muted%%~2%reset%
echo   %brand%------------------------------------------------------------%reset%
echo.
exit /b 0

:: --- section ---------------------------------------------------------------
:section
echo.
echo   %accent%%~2%reset%
echo   %muted%------------------------------------------------------------%reset%
exit /b 0

:: --- kv --------------------------------------------------------------------
:: call "%UI%" kv KEY VALUE [warn|err]
:kv
setlocal EnableDelayedExpansion
set "K=%~2                "
set "V=%~3"
set "TONE=%val%"
if /I "%~4"=="warn" set "TONE=%warnc%"
if /I "%~4"=="err" set "TONE=%errc%"
echo     %muted%!K:~0,16!%reset% %TONE%!V!%reset%
endlocal
exit /b 0

:: --- note / item / ok / warn / err -----------------------------------------
:note
echo     %muted%%~2%reset%
exit /b 0

:item
echo     %accent%-%reset%  %~2
exit /b 0

:ok
echo     %okc%OK%reset%     %~2
exit /b 0

:warn
echo     %warnc%WARN%reset%   %~2
exit /b 0

:err
echo     %errc%ERROR%reset%  %~2
exit /b 0

:: --- wait ------------------------------------------------------------------
:wait
echo.
echo   %muted%Press any key to close%reset%
pause >nul
exit /b 0

:: --- download --------------------------------------------------------------
:: Solid tqdm-style bar via _download.ps1. curl / BITS are fallbacks.
:download
setlocal
set "DL_URL=%~2"
set "DL_OUT=%~3"
if exist "%DL_OUT%" (
    echo     %muted%cached %reset% %val%%~nx3%reset%
    exit /b 0
)
echo     %muted%get    %reset% %val%%~nx3%reset%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_download.ps1" "%DL_URL%" "%DL_OUT%"
if exist "%DL_OUT%" exit /b 0
curl.exe -L --progress-bar --ssl-no-revoke --retry 5 --retry-delay 2 -o "%DL_OUT%" "%DL_URL%"
if exist "%DL_OUT%" exit /b 0
curl.exe -L --progress-bar --ssl-no-revoke -k --retry 5 --retry-delay 2 -o "%DL_OUT%" "%DL_URL%"
if exist "%DL_OUT%" exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "Try{Start-BitsTransfer -Source '%DL_URL%' -Destination '%DL_OUT%' -ErrorAction Stop}catch{exit 1}"
if exist "%DL_OUT%" exit /b 0
echo     %errc%ERROR%reset%  Failed to download %~nx3
exit /b 1
