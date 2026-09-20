@echo off
rem ---------------------------------------------------------------
rem  MAP personal site - build static files into public\
rem  ASCII-only on purpose (see start.bat).
rem ---------------------------------------------------------------
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
echo.
pause
