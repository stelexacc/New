#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$Root=Join-Path $PSScriptRoot 'Stelex-Update'
$TargetRoot=Join-Path $InstallDirectory 'resources/app'
$PackagePath=Join-Path $TargetRoot 'package.json'
$Package=Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json
if($Package.version -ne '1.8.1'){throw 'This update requires Stelex GPT 1.8.1.'}
$Manifest=@(Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json)
$Required=@('server/app.mjs','server/plans.mjs','server/free-limits.mjs','server/plugins.mjs','dist/index.html','dist/plugins.js','dist/plugins.css','tests/update.test.mjs','config/models.json','server/index.mjs','tests/deepseek-catalog.test.mjs')
if($Manifest.Count -ne $Required.Count){throw 'Incomplete feature update manifest.'}
$Seen=@{}
foreach($Item in $Manifest){
 if($Required -notcontains $Item.path -or $Seen.ContainsKey($Item.path)){throw 'Unexpected or duplicate update path.'}
 $Seen[$Item.path]=$true
 if($Item.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid update checksum.'}
 $Actual=(Get-FileHash -LiteralPath (Join-Path $Root $Item.path) -Algorithm SHA256).Hash.ToLowerInvariant()
 if($Actual -ne $Item.sha256){throw ('Update checksum mismatch: '+$Item.path)}
}
$Work=Join-Path $InstallDirectory ('.stelex-feature-update-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $Work
$Applied=@()
try{
 foreach($Item in $Manifest){
  $Target=Join-Path $TargetRoot $Item.path
  $Backup=Join-Path $Work $Item.path
  $Exists=Test-Path -LiteralPath $Target -PathType Leaf
  if($Exists){$null=New-Item -ItemType Directory -Path (Split-Path -Parent $Backup) -Force;Copy-Item -LiteralPath $Target -Destination $Backup}
  $Applied+=@{Path=$Target;Backup=$Backup;Existed=$Exists}
  $null=New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force
  Copy-Item -LiteralPath (Join-Path $Root $Item.path) -Destination $Target -Force
  if((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Item.sha256){throw ('Installed update verification failed: '+$Item.path)}
 }
 Write-Host 'Free-Limits und Plugin-Verwaltung wurden installiert.' -ForegroundColor Green
}catch{
 $OriginalError=$_
 for($Index=$Applied.Count-1;$Index -ge 0;$Index--){$Item=$Applied[$Index];if($Item.Existed){Copy-Item -LiteralPath $Item.Backup -Destination $Item.Path -Force}else{Remove-Item -LiteralPath $Item.Path -Force -ErrorAction SilentlyContinue}}
 throw $OriginalError
}finally{Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue}
