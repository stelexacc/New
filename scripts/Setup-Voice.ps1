$ErrorActionPreference='Stop'
$Directory=Join-Path $PSScriptRoot 'resources\voice'
$Cli=Join-Path $Directory 'whisper-cli.exe'
$Temporary=Join-Path ([IO.Path]::GetTempPath()) ('Stelex-Voice-Check-'+[Guid]::NewGuid().ToString('N'))
try {
    $Manifest=Get-Content -LiteralPath (Join-Path $Directory 'voice-manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
    foreach($Property in $Manifest.sha256.PSObject.Properties){
        $Name=$Property.Name
        if([IO.Path]::GetFileName($Name) -ne $Name){throw 'Invalid voice manifest.'}
        $Hash=(Get-FileHash -LiteralPath (Join-Path $Directory $Name) -Algorithm SHA256).Hash
        if($Hash -ne [string]$Property.Value){throw ('Voice file checksum mismatch: '+$Name)}
    }
    New-Item -ItemType Directory -Path $Temporary | Out-Null
    function Test-VoiceRuntime {
        $Process=Start-Process -FilePath $Cli -ArgumentList '--help' -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Temporary 'stdout.txt') -RedirectStandardError (Join-Path $Temporary 'stderr.txt') -Wait -PassThru
        return ($Process.ExitCode -eq 0)
    }
    if(-not (Test-VoiceRuntime)){
        Write-Host 'Installing the Microsoft C++ runtime required for local speech recognition ...'
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        $Installer=Join-Path $Temporary 'vc_redist.x64.exe'
        Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $Installer -TimeoutSec 600
        $Signature=Get-AuthenticodeSignature -LiteralPath $Installer
        if($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Microsoft runtime signature verification failed.'}
        $Install=Start-Process -FilePath $Installer -ArgumentList '/install /quiet /norestart' -Wait -PassThru
        if($Install.ExitCode -notin @(0,3010,1638)){throw 'Microsoft C++ runtime installation failed.'}
        if(-not (Test-VoiceRuntime)){throw 'The local voice engine cannot start. Restart Windows after C++ runtime installation and retry.'}
    }
    Write-Host 'Offline-Spracherkennung ist bereit / Local speech recognition is ready.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host ('Sprachmodul nicht bereit / Voice module not ready: '+$_.Exception.Message) -ForegroundColor Yellow
    exit 1
} finally {
    if(Test-Path -LiteralPath $Temporary){Remove-Item -LiteralPath $Temporary -Recurse -Force -ErrorAction SilentlyContinue}
}
