@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stelex GPT - Installation
if /I "%~1"=="--help" goto help
if /I "%~1"=="/help" goto help
set "STELEX_INSTALL_BAT=%~f0"
echo Stelex GPT wird installiert und das Modell eingerichtet.
echo Stelex GPT will be installed and its model prepared.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$raw=[System.IO.File]::ReadAllText($env:STELEX_INSTALL_BAT);$marker='# STELEX_BOOTSTRAP_POWERSHELL';$at=$raw.LastIndexOf($marker,[System.StringComparison]::Ordinal);if($at -lt 0){throw 'Bootstrap code missing.'};& ([ScriptBlock]::Create($raw.Substring($at+$marker.Length)))"
set "STELEX_SETUP_EXIT=%ERRORLEVEL%"
if not "%STELEX_SETUP_EXIT%"=="0" (
    echo.
    echo Installation fehlgeschlagen. Die Fehlermeldung steht oben.
    echo Setup failed. Read the error above, correct it, and run Install.bat again.
    pause
    exit /b %STELEX_SETUP_EXIT%
)
exit /b 0
:help
echo Stelex GPT Install.bat
 echo Installiert Stelex GPT fuer dieses Windows-Konto und richtet Ollama ein.
 echo Install Stelex GPT for the current Windows account and set up Ollama.
 echo Enthalten: Free-Limit 10 Antworten je 5 Stunden, 30 je Woche; 11 optionale Plugins.
 echo Die Erweiterungen werden nur ueber diese Install.bat installiert.
 echo Modellquelle: huihui_ai/qwen3.5-abliterated:9b
 echo Lokaler Modellname: qwen3.5-abliterated:9b
 echo Die Einrichtung prueft die SHA-256-Pruefsumme und eine echte Modellantwort.
 echo Setup verifies the SHA-256 checksum and an actual model response.
exit /b 0
# STELEX_BOOTSTRAP_POWERSHELL
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ReleaseVersion = '1.8.1'
$SetupName = "Stelex-GPT-Setup-$ReleaseVersion.exe"
$ReleaseUrl = "https://github.com/stelexacc/New/releases/download/v$ReleaseVersion"
$TaskDirectory = $null

function Download-StelexFile([string]$Uri, [string]$Destination) {
    for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination -TimeoutSec 600
            return
        } catch {
            if ($Attempt -eq 3) { throw }
            Start-Sleep -Seconds $Attempt
        }
    }
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Stelex requires 64-bit Windows / Stelex benoetigt 64-Bit-Windows.' }
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'The local Windows application folder could not be found.' }
    $BootstrapDirectory = Split-Path -Parent $env:STELEX_INSTALL_BAT
    $InstallDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Stelex GPT'
    $TaskDirectory = Join-Path ([IO.Path]::GetTempPath()) ('Stelex-Install-' + [Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $TaskDirectory
    $ManifestPath = Join-Path $TaskDirectory ($SetupName + '.sha256')
    $LocalManifest = Join-Path $BootstrapDirectory ($SetupName + '.sha256')
    $LocalSetup = Join-Path $BootstrapDirectory $SetupName
    if ((Test-Path -LiteralPath $LocalSetup -PathType Leaf) -and (Test-Path -LiteralPath $LocalManifest -PathType Leaf)) {
        if ((Get-Item -LiteralPath $LocalManifest).Length -gt 4096) { throw 'The checksum file is invalid.' }
        Copy-Item -LiteralPath $LocalManifest -Destination $ManifestPath
    } else {
        Download-StelexFile "$ReleaseUrl/$SetupName.sha256" $ManifestPath
    }
    if ((Get-Item -LiteralPath $ManifestPath).Length -gt 4096) { throw 'The downloaded checksum file is invalid.' }
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw
    $ExpectedPattern = '(?im)^([a-f0-9]{64})\s+\*?' + [Regex]::Escape($SetupName) + '\s*$'
    $Match = [Regex]::Match($Manifest, $ExpectedPattern)
    if (-not $Match.Success) { throw 'The expected SHA-256 checksum is missing / Die erwartete Pruefsumme fehlt.' }
    $ExpectedHash = $Match.Groups[1].Value.ToLowerInvariant()
    if (Test-Path -LiteralPath $LocalSetup -PathType Leaf) { $SetupPath = $LocalSetup }
    else {
        Write-Host 'Stelex-Setup wird heruntergeladen / Downloading Stelex setup ...'
        $SetupPath = Join-Path $TaskDirectory $SetupName
        Download-StelexFile "$ReleaseUrl/$SetupName" $SetupPath
    }
    $ActualHash = (Get-FileHash -LiteralPath $SetupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedHash) { throw 'Setup checksum mismatch. The installer was not started / Pruefsumme stimmt nicht. Das Setup wurde nicht gestartet.' }

    $AdminDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Stelex Admin'
    foreach ($Running in @(Get-Process -Name 'Stelex GPT','Stelex Admin' -ErrorAction SilentlyContinue)) {
        try { $RunningPath = $Running.Path } catch { $RunningPath = $null }
        if ($RunningPath -and ($RunningPath.StartsWith($InstallDirectory + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $RunningPath.StartsWith($AdminDirectory + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))) {
            throw 'Please close Stelex GPT and Stelex Admin, then run Install.bat again / Stelex zuerst schliessen und Install.bat erneut starten.'
        }
    }
    Write-Host 'Stelex-Setup wird ausgefuehrt / Installing Stelex ...'
    $Installer = Start-Process -FilePath $SetupPath -ArgumentList ('/S /D=' + $InstallDirectory) -Wait -PassThru
    if ($Installer.ExitCode -ne 0) { throw "The Stelex installer failed (exit $($Installer.ExitCode)) / Stelex-Installation fehlgeschlagen." }
    $Application = Join-Path $InstallDirectory 'Stelex GPT.exe'
    $ModelSetup = Join-Path $InstallDirectory 'Setup-Ollama.ps1'
    $PackageFile = Join-Path $InstallDirectory 'resources\app\package.json'
    if (-not (Test-Path -LiteralPath $Application -PathType Leaf) -or -not (Test-Path -LiteralPath $ModelSetup -PathType Leaf) -or -not (Test-Path -LiteralPath $PackageFile -PathType Leaf)) {
        throw 'The installed application is incomplete / Die installierte Anwendung ist unvollstaendig.'
    }
    $InstalledPackage = Get-Content -LiteralPath $PackageFile -Raw | ConvertFrom-Json
    if ($InstalledPackage.version -ne $ReleaseVersion) { throw 'The installed version does not match this installer / Installierte Version stimmt nicht ueberein.' }
    $FeatureUpdate = Join-Path $BootstrapDirectory 'Apply-Stelex-Update.ps1'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $FeatureUpdate -InstallDirectory $InstallDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Free limit and plugin update failed. Stelex was not started.' }
    $DeepSeekAddon = Join-Path $BootstrapDirectory 'Add-DeepSeek.ps1'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $DeepSeekAddon -InstallDirectory $InstallDirectory
    if ($LASTEXITCODE -ne 0) { throw 'DeepSeek component registration failed. Stelex was not started.' }
    $ComponentSetup = Join-Path $InstallDirectory 'Select-Components.ps1'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $ComponentSetup
    if ($LASTEXITCODE -ne 0) { throw 'Component selection was canceled or failed.' }
    $Selected = Get-Content -LiteralPath (Join-Path $InstallDirectory 'selected-components.json') -Raw | ConvertFrom-Json
    $PythonSetup = Join-Path $InstallDirectory 'Setup-Python.ps1'
    if (-not (Test-Path -LiteralPath $PythonSetup -PathType Leaf)) { throw 'Python builder setup is missing.' }
    if ($Selected.python) { & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $PythonSetup }
    if ($Selected.python -and $LASTEXITCODE -ne 0) { throw 'Python EXE builder setup failed. Rerun Install.bat after fixing the error.' }
    $VoiceSetup = Join-Path $InstallDirectory 'Setup-Voice.ps1'
    if ($Selected.voice) { & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $VoiceSetup }
    if ($LASTEXITCODE -ne 0) { Write-Host 'Voice module needs attention. Chat still works; rerun Setup-Voice.ps1 after fixing its reported error.' -ForegroundColor Yellow }
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $ModelSetup
    if ($LASTEXITCODE -ne 0) { throw 'The model setup failed. Stelex was not started / Modelleinrichtung fehlgeschlagen. Stelex wurde nicht gestartet.' }
    $null = Start-Process -FilePath $Application -WorkingDirectory $InstallDirectory
    Write-Host 'Fertig. Stelex GPT wurde gestartet / Ready. Stelex GPT was started.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host ('Installation fehlgeschlagen / Setup failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($TaskDirectory -and (Test-Path -LiteralPath $TaskDirectory)) { Remove-Item -LiteralPath $TaskDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}
