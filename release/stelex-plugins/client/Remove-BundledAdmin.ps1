#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$Manifest=@(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'old-admin-hashes.json') -Encoding UTF8 -Raw | ConvertFrom-Json)
foreach($Item in $Manifest){
 if($Item.path -notmatch '^(Stelex Admin\.exe|resources/private-admin\.bundle\.json|resources/app/desktop/(admin-bundle\.cjs|locked-admin[-.][a-z.]+))$'){throw 'Ungueltiger Bereinigungspfad.'}
 $Path=Join-Path $InstallDirectory $Item.path
 if(Test-Path -LiteralPath $Path -PathType Leaf){
  if((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Item.sha256){Remove-Item -LiteralPath $Path -Force}
  else{Write-Host ('Vorhandene veraenderte Datei bleibt erhalten: '+$Item.path)}
 }
}
# Only remove old shortcuts pointing to the bundled Admin executable, never a separate Admin install.
$Shell=New-Object -ComObject WScript.Shell
$Folders=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))
$OldTarget=Join-Path $InstallDirectory 'Stelex Admin.exe'
foreach($Folder in $Folders){
 foreach($Link in @(Get-ChildItem -LiteralPath $Folder -Filter '*Stelex*Admin*.lnk' -Recurse -ErrorAction SilentlyContinue)){
  $Shortcut=$Shell.CreateShortcut($Link.FullName)
  if([string]::Equals($Shortcut.TargetPath,$OldTarget,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $Link.FullName -Force}
 }
}
