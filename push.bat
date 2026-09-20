@echo off
rem ---------------------------------------------------------------
rem  Push local changes to GitHub over SSH (ssh.github.com:443).
rem  ASCII-only on purpose: cmd.exe reads batch files by byte offset,
rem  so switching the code page inside a .bat corrupts later lines.
rem  All user-facing text comes from the PowerShell script.
rem ---------------------------------------------------------------
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push.ps1"
echo.
pause
