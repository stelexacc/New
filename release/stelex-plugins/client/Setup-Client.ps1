#Requires -Version 5.1
param([switch]$NoLaunch)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$Package=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'resources\app\package.json') -Raw | ConvertFrom-Json
if($Package.stelexRole -ne 'client'){throw 'Dieses Einrichtungsskript benoetigt das neue Client-Only-Paket.'}
& (Join-Path $PSScriptRoot 'Wait-StelexBackend.ps1') -InstallDirectory $PSScriptRoot
foreach($Name in @('models.json','resources\app\config\models.json')){
 $Catalog=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot $Name) -Encoding UTF8 -Raw | ConvertFrom-Json)
 if(@($Catalog|Where-Object {$_.id -eq 'stelex-deepseek-r1-abliterated:8b'}).Count -ne 1){throw 'DeepSeek fehlt im ausgelieferten Modellkatalog.'}
}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Select-Components.ps1')
if($LASTEXITCODE -ne 0){throw 'Komponentenauswahl abgebrochen oder fehlgeschlagen.'}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-Selected.ps1')
if($LASTEXITCODE -ne 0){throw 'Modelleinrichtung fehlgeschlagen. Dieses Skript oder Install.bat erneut ausfuehren, nachdem der Fehler behoben ist.'}
if(-not $NoLaunch){$null=Start-Process -FilePath (Join-Path $PSScriptRoot 'Stelex GPT.exe') -WorkingDirectory $PSScriptRoot}
Write-Host 'Stelex GPT Client eingerichtet. Es wurde kein Admin-Tool installiert.' -ForegroundColor Green
