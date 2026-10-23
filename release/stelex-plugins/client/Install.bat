@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stelex GPT - Client-Einrichtung
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Client.ps1"
set "STELEX_CLIENT_EXIT=%ERRORLEVEL%"
if not "%STELEX_CLIENT_EXIT%"=="0" (
 echo Einrichtung nicht abgeschlossen. Fehlermeldung oben beachten.
 pause
 exit /b %STELEX_CLIENT_EXIT%
)
exit /b 0
