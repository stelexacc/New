@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stelex GPT - DeepSeek Reparatur
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Repair-DeepSeek.ps1"
set "STELEX_REPAIR_EXIT=%ERRORLEVEL%"
if not "%STELEX_REPAIR_EXIT%"=="0" (
 echo Reparatur fehlgeschlagen. Die Fehlermeldung steht oben.
 pause
 exit /b %STELEX_REPAIR_EXIT%
)
pause
exit /b 0
