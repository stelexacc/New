#Requires -Version 5.1
param([string]$InstallDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
if(-not $InstallDirectory){$InstallDirectory=Join-Path $env:LOCALAPPDATA 'Programs\Stelex GPT'}
$Application=Join-Path $InstallDirectory 'Stelex GPT.exe'
if(-not(Test-Path -LiteralPath $Application -PathType Leaf)){throw 'Stelex GPT ist nicht installiert. Zuerst das neue Setup ausfuehren.'}
& (Join-Path $PSScriptRoot 'Wait-StelexBackend.ps1') -InstallDirectory $InstallDirectory
& (Join-Path $PSScriptRoot 'Apply-Stelex-Update.ps1') -InstallDirectory $InstallDirectory
& (Join-Path $PSScriptRoot 'Add-DeepSeek.ps1') -InstallDirectory $InstallDirectory
$Model='stelex-deepseek-r1-abliterated:8b'
foreach($Path in @((Join-Path $InstallDirectory 'models.json'),(Join-Path $InstallDirectory 'resources\app\config\models.json'))){
 $Catalog=@(Get-Content -LiteralPath $Path -Encoding UTF8 -Raw | ConvertFrom-Json)
 if(@($Catalog|Where-Object {$_.id -eq $Model}).Count -ne 1){throw ('DeepSeek fehlt im Modellkatalog: '+$Path)}
}
$SelectionPath=Join-Path $InstallDirectory 'selected-components.json'
if(Test-Path -LiteralPath $SelectionPath){$Selection=Get-Content -LiteralPath $SelectionPath -Encoding UTF8 -Raw | ConvertFrom-Json;$Selection.models=@(@($Selection.models)+$Model|Select-Object -Unique)}
else{$Selection=@{models=@($Model);voice=$true;python=$false}}
[IO.File]::WriteAllText($SelectionPath,($Selection|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallDirectory 'Setup-Ollama.ps1') -SelectedModels $Model
if($LASTEXITCODE -ne 0){throw 'DeepSeek konnte nicht heruntergeladen oder gestartet werden. Fehlermeldung oben beheben; die Reparatur danach erneut ausfuehren.'}
$null=Start-Process -FilePath $Application -WorkingDirectory $InstallDirectory
Write-Host 'DeepSeek wurde registriert, installiert und mit einer echten Antwort geprueft. Stelex wurde neu gestartet.' -ForegroundColor Green
