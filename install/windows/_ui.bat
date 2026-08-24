@echo off

:: Shared console UI for install/start scripts.
:: Load once (no args), then:
::   call "%UI%" section "Setup"
::   call "%UI%" info "..."
::   call "%UI%" ok "..."
::   call "%UI%" warn "..."
::   call "%UI%" error "..."
::   call "%UI%" kv "BlomboUI" "http://..."
::   call "%UI%" note "secondary line"

set muted=[38;5;245m
set white=[38;5;252m
set accent=[38;5;250m
set okc=[38;5;108m
set warnc=[38;5;180m
set errc=[38;5;174m
set reset=[0m

set warning=%warnc%
set gray=%muted%
set dim=%muted%
set red=%errc%
set green=%okc%
set yellow=%accent%
set cyan=%muted%
set blue=%muted%
set magenta=%muted%
set bold=[1m

if not defined BLOMBO_VT (
    set "BLOMBO_VT=1"
    if not defined WT_SESSION powershell -NoProfile -ExecutionPolicy Bypass -Command "$d='[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int n);[DllImport(\"kernel32.dll\")]public static extern bool GetConsoleMode(IntPtr h,out uint m);[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,uint m);'; $t=Add-Type -MemberDefinition $d -Name T -PassThru; $h=$t::GetStdHandle(-11); $m=0; [void]$t::GetConsoleMode($h,[ref]$m); [void]$t::SetConsoleMode($h,$m -bor 4)" >nul 2>&1
)

if "%~1"=="" exit /b 0
if /i "%~1"=="section" goto :section
if /i "%~1"=="info" goto :info
if /i "%~1"=="ok" goto :ok
if /i "%~1"=="warn" goto :warn
if /i "%~1"=="error" goto :error
if /i "%~1"=="kv" goto :kv
if /i "%~1"=="note" goto :note
exit /b 0

:section
echo.
echo   %white%%~2%reset%
echo   %muted%--------------------------------%reset%
exit /b 0

:info
echo     %muted%%~2%reset%
exit /b 0

:ok
echo     %muted%%~2%reset%
exit /b 0

:warn
echo     %warnc%warn%reset%  %~2
exit /b 0

:error
echo     %errc%error%reset% %~2
exit /b 0

:kv
setlocal EnableDelayedExpansion
set "K=%~2                "
echo     %muted%!K:~0,12!%reset% %white%%~3%reset%
endlocal
exit /b 0

:note
echo     %muted%%~2%reset%
exit /b 0
