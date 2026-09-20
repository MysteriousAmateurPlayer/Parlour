@echo off
rem ---------------------------------------------------------------
rem  MAP personal site - local preview
rem  Kept ASCII-only on purpose: cmd.exe reads batch files by byte
rem  offset, so switching the code page inside a .bat corrupts the
rem  remaining lines. All user-facing text comes from the PowerShell
rem  script instead.
rem ---------------------------------------------------------------
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve.ps1"
echo.
pause
