@echo off
rem BlomboUI for development: API on :4381 (restarts on change) + Vite on :4382 with hot reload.
rem For the desktop window with hot reload use: npm run dev:app
setlocal
cd /d "%~dp0"
title BlomboUI (dev)

call :check_node || goto :failed
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install || goto :failed
)
call npm run dev || goto :failed
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
