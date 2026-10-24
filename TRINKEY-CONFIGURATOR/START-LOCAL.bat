@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the local preview. Install it from https://nodejs.org/
  pause
  exit /b 1
)
node server.cjs --open
pause
