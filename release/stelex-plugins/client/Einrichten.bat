@echo off
setlocal EnableExtensions DisableDelayedExpansion
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Einrichten.ps1"
set "STELEX_CONFIG_EXIT=%ERRORLEVEL%"
if not "%STELEX_CONFIG_EXIT%"=="0" pause
exit /b %STELEX_CONFIG_EXIT%
