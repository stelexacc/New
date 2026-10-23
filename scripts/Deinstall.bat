@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stelex GPT - Deinstallation
if /I "%~1"=="--help" (
 echo Startet die Stelex-Deinstallation fuer dieses Windows-Konto.
 echo Modelle, eigene Projekte und Kontodaten bleiben erhalten.
 exit /b 0
)
set "STELEX_UNINSTALLER=%LOCALAPPDATA%\Programs\Stelex GPT\Uninstall Stelex GPT.exe"
if not exist "%STELEX_UNINSTALLER%" (
 echo Stelex GPT wurde am Standardort nicht gefunden.
 echo Bitte Einstellungen - Apps - Stelex GPT - Deinstallieren verwenden.
 pause
 exit /b 1
)
echo Stelex GPT wird deinstalliert. Modelle und eigene Dateien bleiben erhalten.
start "" /wait "%STELEX_UNINSTALLER%"
exit /b %ERRORLEVEL%
