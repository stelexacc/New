#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$Roots=@($InstallDirectory,(Join-Path $env:LOCALAPPDATA 'Programs\Stelex Admin'))
foreach($Process in @(Get-Process -Name 'Stelex GPT','Stelex Admin' -ErrorAction SilentlyContinue)){
 try{$ProcessPath=$Process.Path}catch{$ProcessPath=$null}
 foreach($Root in $Roots){if($ProcessPath -and $ProcessPath.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Stelex GPT und Stelex Admin zuerst vollstaendig schliessen und erneut starten.'}}
}
# A closed desktop window releases its lease, but the old shared backend may live for 55 seconds.
$Record=Join-Path $env:APPDATA 'Stelex GPT\desktop-service-1.8.1.json'
if(-not(Test-Path -LiteralPath $Record -PathType Leaf)){return}
try{$Service=Get-Content -LiteralPath $Record -Raw | ConvertFrom-Json;$Uri=[Uri]$Service.url}catch{return}
if($Uri.Scheme -ne 'http' -or $Uri.Host -ne '127.0.0.1'){throw 'Unerwartete lokale Dienstadresse.'}
$Deadline=[DateTime]::UtcNow.AddSeconds(75)
$Notice=$false
while($true){
 try{$Health=Invoke-RestMethod -Uri ($Uri.GetLeftPart([UriPartial]::Authority)+'/api/health') -TimeoutSec 3}catch{return}
 if($Health.serviceId -ne $Service.serviceId){return}
 if(-not $Notice){Write-Host 'Warte auf das Ende des alten lokalen Stelex-Dienstes (bis 75 Sekunden) ...';$Notice=$true}
 if([DateTime]::UtcNow -ge $Deadline){throw 'Ein alter Stelex-Dienst ist noch aktiv. Alle Stelex-Apps schliessen oder Windows neu starten; danach die Einrichtung erneut ausfuehren.'}
 Start-Sleep -Seconds 1
}
