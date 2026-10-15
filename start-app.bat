@echo off
rem BlomboUI as a desktop window (Tauri). The first run builds the window, which needs Rust
rem (https://rustup.rs). Closing the window stops the server.
setlocal
cd /d "%~dp0"
title BlomboUI

call :check_node || goto :failed
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install || goto :failed
)
node tools\ensure-build.ts || goto :failed
node tools\ensure-app.ts || goto :failed

rem The server runs in a minimized console and exits when the app window closes.
start "BlomboUI (server)" /min cmd /c "node src\server\main.ts --open app"
exit /b 0

:check_node
where node >nul 2>nul || (
  echo BlomboUI needs Node.js 22.18 or newer: https://nodejs.org
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" || (
  echo BlomboUI needs Node.js 22.18 or newer. You have:
  node --version
  exit /b 1
)
exit /b 0

:failed
echo.
echo BlomboUI could not start. See the messages above.
pause
exit /b 1
