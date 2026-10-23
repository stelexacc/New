$ErrorActionPreference='Stop'
$Config=Get-Content (Join-Path $PSScriptRoot 'selected-components.json') -Raw | ConvertFrom-Json
if($Config.python){& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-Python.ps1');if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
if($Config.voice){& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-Voice.ps1')}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-Ollama.ps1')
exit $LASTEXITCODE
