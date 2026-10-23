$ErrorActionPreference='Stop'
$Zip=Join-Path $PWD 'downloads\STELEX-Admin-Aktualisiert.zip'
$Expected=((Get-Content "$Zip.sha256" -Raw).Trim() -split '\s+')[0]
if((Get-FileHash $Zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected){throw 'Admin ZIP checksum mismatch.'}
$Destination=Join-Path $env:RUNNER_TEMP ('stelex-admin-test-'+[guid]::NewGuid())
Expand-Archive -LiteralPath $Zip -DestinationPath $Destination
$Folder=Join-Path $Destination 'STELEX-Admin'
if(!(Test-Path (Join-Path $Folder 'resources\app\desktop\admin-credits.js'))){throw 'Admin credit/update UI missing.'}
$Result=Join-Path $Destination 'smoke.json'
$env:CI='true';$env:STELEX_ADMIN_LOCK_SMOKE_RESULT=$Result
$Process=Start-Process -FilePath (Join-Path $Folder 'Stelex Admin.exe') -PassThru
try{
 if(!$Process.WaitForExit(90000)){throw 'Admin lock smoke timed out.'}
 if(!(Test-Path $Result)){throw 'Admin lock did not report its result.'}
 $State=Get-Content -LiteralPath $Result -Raw | ConvertFrom-Json
 if(!$State.ok -or !$State.wrongCodeRejected -or !$State.privateFilesAbsent){throw 'Admin lock validation failed.'}
 Write-Output '::notice::Separate Admin: encrypted lock visible, incorrect code rejected, private files absent.'
}finally{if(!$Process.HasExited){Stop-Process -Id $Process.Id -Force};Remove-Item Env:STELEX_ADMIN_LOCK_SMOKE_RESULT -ErrorAction SilentlyContinue}
