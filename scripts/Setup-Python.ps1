# Installs the local Python-to-EXE builder; never runs generated applications.
$ErrorActionPreference = 'Stop'
$BuilderRoot = Join-Path $env:APPDATA 'Stelex GPT\tools\python-builder'
$BuilderPython = Join-Path $BuilderRoot 'Scripts\python.exe'
function Find-StelexPython {
    $Candidates = @()
    try { $Found = & py -3.13 -c 'import sys; print(sys.executable)' 2>$null; if ($LASTEXITCODE -eq 0 -and $Found) { $Candidates += [string]$Found } } catch {}
    $Candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe')
    try { $Candidates += (Get-Command python.exe -ErrorAction Stop).Source } catch {}
    foreach ($Candidate in $Candidates) {
        if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { continue }
        try {
            & $Candidate -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3,13) else 1)' 2>$null
            if ($LASTEXITCODE -eq 0) { return $Candidate }
        } catch {}
    }
    return $null
}
try {
    if (-not $env:APPDATA) { throw 'Windows AppData folder unavailable.' }
    if (Test-Path -LiteralPath $BuilderPython -PathType Leaf) {
        $BuilderReady = $false
        try {
            & $BuilderPython -c 'import PyInstaller,sys; sys.exit(0 if tuple(map(int,PyInstaller.__version__.split(chr(46)))) == (6,16,0) else 1)' 2>$null
            $BuilderReady = ($LASTEXITCODE -eq 0)
        } catch {}
        if ($BuilderReady) { Write-Host 'Python-EXE-Builder ist bereit / Python EXE builder is ready.'; exit 0 }
    }
    $Python = Find-StelexPython
    if (-not $Python) {
        Write-Host 'Installing Python 3.13 from the Windows package manager ...'
        & winget.exe install --id Python.Python.3.13 --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
        $Python = Find-StelexPython
        if (-not $Python) { throw 'Python 3.13 installation failed. Install Python 3.13 from python.org and rerun Install.bat.' }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $BuilderRoot) -Force | Out-Null
    & $Python -m venv $BuilderRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python builder environment.' }
    & $BuilderPython -m pip install --disable-pip-version-check --no-input 'pyinstaller==6.16.0'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install PyInstaller. Check your internet connection and rerun Install.bat.' }
    & $BuilderPython -c 'import PyInstaller; print(PyInstaller.__version__)'
    if ($LASTEXITCODE -ne 0) { throw 'Python builder verification failed.' }
    exit 0
} catch {
    Write-Host ('Python-EXE-Setup fehlgeschlagen / failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
