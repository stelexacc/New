@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stelex GPT - Deinstallation
if /I "%~1"=="--help" (
 echo Startet die Stelex-Deinstallation fuer dieses Windows-Konto.
 echo Modelle, eigene Projekte und Kontodaten bleiben erhalten.
 exit /b 0
)
echo Stelex GPT wird deinstalliert. Modelle und eigene Dateien bleiben erhalten.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop';$key=Get-ItemProperty -LiteralPath 'HKCU:\Software\Stelex GPT' -ErrorAction SilentlyContinue;$dir=if($key -and $key.InstallDir){$key.InstallDir}else{Join-Path $env:LOCALAPPDATA 'Programs\Stelex GPT'};$file=Join-Path $dir 'Uninstall Stelex GPT.exe';if(-not(Test-Path -LiteralPath $file -PathType Leaf)){Write-Host 'Stelex nicht gefunden. Bitte Windows Einstellungen - Apps verwenden.';exit 1};$p=Start-Process -FilePath $file -Wait -PassThru;exit $p.ExitCode"
if errorlevel 1 (
 echo Deinstallation nicht abgeschlossen. Bitte die Fehlermeldung oben beachten.
 pause
 exit /b 1
)
exit /b 0
