@echo off
rem ---------------------------------------------------------------
rem  MAP writer - a local writing UI in your browser.
rem  ASCII-only on purpose (see start.bat for the reason).
rem ---------------------------------------------------------------
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found. Please install it from https://nodejs.org/
  echo.
  pause
  exit /b 1
)
node "%~dp0tools\writer\server.cjs"
echo.
pause
