#Requires -Version 5.1
# Install a local EXE builder; never run generated applications.
param([switch]$SkipWinget,[switch]$ForceStandalone,[string]$PythonExecutable='',[switch]$LoadFunctionsOnly)
$ErrorActionPreference = 'Stop'
function Test-StelexPython([string]$Executable) {
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf) -or $Executable -match '\\Microsoft\\WindowsApps\\') { return $false }
    try {
        & $Executable -c 'import sys,struct,venv; sys.exit(0 if sys.version_info[0] == 3 and 10 <= sys.version_info[1] <= 13 and struct.calcsize(chr(80)) == 8 else 1)' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}
function Find-StelexPython([string]$StandaloneRoot) {
    $Candidates = @((Join-Path $StandaloneRoot 'python.exe'))
    if ($PythonExecutable) { $Candidates = @($PythonExecutable) + $Candidates }
    try {
        $Launcher = Get-Command py.exe -ErrorAction Stop
        $Listed = & $Launcher.Source -0p 2>$null
        foreach ($Line in $Listed) { if ([string]$Line -match '([A-Za-z]:\\.+\\python.exe)\s*$') { $Candidates += $Matches[1] } }
    } catch {}
    try { $Candidates += (Get-Command python.exe -ErrorAction Stop).Source } catch {}
    foreach ($Minor in @(13,12,11,10)) {
        $Candidates += (Join-Path $env:LOCALAPPDATA "Programs\Python\Python3$Minor\python.exe")
        foreach ($Hive in @('HKCU','HKLM')) {
            try { $Key = Get-Item -LiteralPath "${Hive}:\Software\Python\PythonCore\3.$Minor\InstallPath" -ErrorAction Stop; $Candidates += (Join-Path $Key.GetValue('') 'python.exe') } catch {}
        }
    }
    foreach ($Candidate in ($Candidates | Select-Object -Unique)) { if (Test-StelexPython $Candidate) { return [string]$Candidate } }
    return $null
}
function Install-StelexStandalonePython([string]$Destination,[string]$LogDirectory) {
    $Version = '3.13.17'
    $Directory = Join-Path ([IO.Path]::GetTempPath()) ('Stelex-Python-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    try {
        $Installer = Join-Path $Directory 'python-setup.exe'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $Downloaded = $false
        for ($Attempt=1; $Attempt -le 3; $Attempt++) {
            try { Invoke-WebRequest -UseBasicParsing -Uri "https://www.python.org/ftp/python/$Version/python-$Version-amd64.exe" -OutFile $Installer -TimeoutSec 600; $Downloaded=$true; break } catch { if ($Attempt -eq 3) { throw }; Start-Sleep -Seconds $Attempt }
        }
        if (-not $Downloaded) { throw 'Python download failed.' }
        $Signature = Get-AuthenticodeSignature -LiteralPath $Installer
        if ($Signature.Status -ne 'Valid' -or -not $Signature.SignerCertificate -or $Signature.SignerCertificate.Subject -notmatch '(?i)(?:^|,\s*)(?:CN|O)=Python Software Foundation(?:,|$)') { throw 'The official Python installer signature could not be verified.' }
        Write-Host 'Installing signed Python 3.13 for Stelex only (without changing PATH) ...'
        $InstallerLog = Join-Path $LogDirectory 'python-installer.log'
        $Arguments = '/quiet InstallAllUsers=0 Include_launcher=0 Include_test=0 Include_doc=0 Include_pip=1 PrependPath=0 AssociateFiles=0 Shortcuts=0 TargetDir="' + $Destination + '" /log "' + $InstallerLog + '"'
        $Process = Start-Process -FilePath $Installer -ArgumentList $Arguments -Wait -PassThru
        if ($Process.ExitCode -notin @(0,3010)) { throw "Python installer failed (exit $($Process.ExitCode)). See $InstallerLog" }
        $Executable = Join-Path $Destination 'python.exe'
        if (-not (Test-StelexPython $Executable)) { throw "Python installation did not produce a compatible 64-bit runtime. See $InstallerLog" }
        return $Executable
    } finally { Remove-Item -LiteralPath $Directory -Recurse -Force -ErrorAction SilentlyContinue }
}
if ($LoadFunctionsOnly) { return }
$TranscriptStarted = $false
try {
    if (-not $env:APPDATA -or -not $env:LOCALAPPDATA -or -not [Environment]::Is64BitOperatingSystem) { throw 'Stelex requires 64-bit Windows 10/11 and a Windows user profile.' }
    $ToolsRoot = Join-Path $env:APPDATA 'Stelex GPT\tools'
    $BuilderRoot = Join-Path $ToolsRoot 'python-builder'
    $BuilderPython = Join-Path $BuilderRoot 'Scripts\python.exe'
    $StandaloneRoot = Join-Path $ToolsRoot 'python-runtime'
    $LogDirectory = Join-Path $env:APPDATA 'Stelex GPT\logs'
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    try { Start-Transcript -LiteralPath (Join-Path $LogDirectory 'python-setup.log') -Append | Out-Null; $TranscriptStarted=$true } catch {}
    if (-not $ForceStandalone -and -not $PythonExecutable -and (Test-StelexPython $BuilderPython)) {
        $Ready = $false
        try { & $BuilderPython -c 'import PyInstaller,sys; sys.exit(0 if tuple(map(int,PyInstaller.__version__.split(chr(46)))) == (6,16,0) else 1)' 2>$null | Out-Null; $Ready=($LASTEXITCODE -eq 0) } catch {}
        if ($Ready) { Write-Host 'Python-EXE-Builder ist bereit / ready.'; exit 0 }
    }
    if ($PythonExecutable -and -not (Test-StelexPython $PythonExecutable)) { throw 'The selected Python must be a working 64-bit CPython 3.10, 3.11, 3.12 or 3.13.' }
    $Python = $null
    if (-not $ForceStandalone) { $Python = Find-StelexPython $StandaloneRoot }
    if (-not $Python -and -not $SkipWinget -and -not $ForceStandalone) {
        $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($Winget) {
            try {
                Write-Host 'Trying the Windows package manager ...'
                & $Winget.Source install --id Python.Python.3.13 --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
                if ($LASTEXITCODE -ne 0) { Write-Host "winget failed (exit $LASTEXITCODE). Using the official installer instead." }
            } catch { Write-Host 'winget unavailable. Using the official installer instead.' }
            $Python = Find-StelexPython $StandaloneRoot
        }
    }
    if (-not $Python) { $Python = Install-StelexStandalonePython $StandaloneRoot $LogDirectory }
    Write-Host "Python runtime: $Python"
    New-Item -ItemType Directory -Path $ToolsRoot -Force | Out-Null
    & $Python -m venv --clear $BuilderRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python builder environment.' }
    & $BuilderPython -m pip install --disable-pip-version-check --no-input --timeout 45 --retries 2 'pyinstaller==6.16.0'
    if ($LASTEXITCODE -ne 0) { throw "Could not install PyInstaller. Check internet access. Logs: $LogDirectory" }
    & $BuilderPython -c 'import PyInstaller,sys,struct; print(sys.version); print(PyInstaller.__version__); sys.exit(0 if tuple(map(int,PyInstaller.__version__.split(chr(46)))) == (6,16,0) and struct.calcsize(chr(80)) == 8 else 1)'
    if ($LASTEXITCODE -ne 0) { throw 'Python builder verification failed.' }
    Write-Host 'Python-EXE-Builder erfolgreich eingerichtet / ready.'
    exit 0
} catch {
    Write-Host ('Python-EXE-Setup fehlgeschlagen / failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally { if ($TranscriptStarted) { try { Stop-Transcript | Out-Null } catch {} } }
