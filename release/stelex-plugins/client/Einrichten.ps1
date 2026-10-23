#Requires -Version 5.1
$ErrorActionPreference='Stop'
$Key=Get-ItemProperty -LiteralPath 'HKCU:\Software\Stelex GPT' -ErrorAction SilentlyContinue
$Directory=if($Key -and $Key.InstallDir){$Key.InstallDir}else{Join-Path $env:LOCALAPPDATA 'Programs\Stelex GPT'}
$Setup=Join-Path $Directory 'Setup-Client.ps1'
if(-not(Test-Path -LiteralPath $Setup -PathType Leaf)){throw 'Zuerst Setup.exe aus diesem Ordner ausfuehren.'}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Setup
exit $LASTEXITCODE
