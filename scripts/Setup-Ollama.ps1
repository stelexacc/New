#Requires -Version 5.1
param(
    [string[]]$SelectedModels = @(),
    [ValidateNotNullOrEmpty()][string]$Model = "qwen3.5-abliterated:9b",
    [ValidateNotNullOrEmpty()][string]$SourceModel = "huihui_ai/qwen3.5-abliterated:9b"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Get-OllamaExecutable {
    $Command = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
    $Candidates = @()
    if ($env:LOCALAPPDATA) { $Candidates += (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe") }
    if ($env:ProgramFiles) { $Candidates += (Join-Path $env:ProgramFiles "Ollama\ollama.exe") }
    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath $Candidate -PathType Leaf) { return $Candidate }
    }
    return $null
}

function Get-InstalledModels {
    $Tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
    $Names = @()
    foreach ($Entry in @($Tags.models)) {
        if ($Entry.name) { $Names += [string]$Entry.name }
    }
    return $Names
}


function Test-StelexUsageCount([object]$Value) {
    if (-not ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [single])) { return $false }
    $Count = [double]$Value
    return (-not [double]::IsNaN($Count) -and -not [double]::IsInfinity($Count) -and $Count -ge 0 -and $Count -le 9007199254740991 -and [Math]::Floor($Count) -eq $Count)
}

try {
    Write-Host "Stelex GPT | Installation / Setup" -ForegroundColor Red
    Write-Host "Model source / Modellquelle: $SourceModel"
    Write-Host "Stelex model name / Stelex-Modellname: $Model"
    Write-Host "The first model download can take a while. / Der erste Modelldownload kann dauern."
    if (-not [Environment]::Is64BitOperatingSystem) { throw "Stelex requires 64-bit Windows. / Stelex benoetigt 64-Bit-Windows." }

    $OllamaPath = Get-OllamaExecutable
    if (-not $OllamaPath) {
        $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($Winget) {
            & $Winget.Source install --exact --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -ne 0) { throw "Ollama installation failed (exit $LASTEXITCODE). / Ollama-Installation fehlgeschlagen." }
        } else {
            # Older Windows installations may not include App Installer. Accept
            # only a valid Ollama publisher signature before running its setup.
            $InstallerDirectory = Join-Path ([IO.Path]::GetTempPath()) ("Stelex-Ollama-" + [Guid]::NewGuid().ToString("N"))
            $null = New-Item -ItemType Directory -Path $InstallerDirectory
            try {
                $InstallerPath = Join-Path $InstallerDirectory "OllamaSetup.exe"
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -UseBasicParsing -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $InstallerPath -TimeoutSec 600
                $Signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
                if ($Signature.Status -ne "Valid" -or -not $Signature.SignerCertificate -or $Signature.SignerCertificate.Subject -notmatch "(?i)(?:^|,\s*)(?:CN|O)=Ollama(?:[ ,.]|$)") {
                    throw "The official Ollama installer could not be authenticated / Die Signatur der Ollama-Installation konnte nicht bestaetigt werden."
                }
                $Installer = Start-Process -FilePath $InstallerPath -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-" -Wait -PassThru
                if ($Installer.ExitCode -ne 0) { throw "Ollama setup failed (exit $($Installer.ExitCode))." }
            } finally {
                Remove-Item -LiteralPath $InstallerDirectory -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        # The current process keeps its old PATH after winget installation.
        $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $env:Path = "$UserPath;$MachinePath;$env:Path"
        $OllamaPath = Get-OllamaExecutable
        if (-not $OllamaPath) { throw "Ollama executable was not found after installation. / Ollama wurde nach der Installation nicht gefunden." }
    }

    $OllamaReady = $false
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 3
        $OllamaReady = $true
    } catch { }
    if (-not $OllamaReady) {
        $null = Start-Process -FilePath $OllamaPath -ArgumentList @("serve") -WindowStyle Hidden -PassThru
        $Deadline = [DateTime]::UtcNow.AddSeconds(40)
        do {
            Start-Sleep -Milliseconds 500
            try {
                $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2
                $OllamaReady = $true
            } catch { }
        } while (-not $OllamaReady -and [DateTime]::UtcNow -lt $Deadline)
        if (-not $OllamaReady) { throw "Ollama did not become ready. / Ollama konnte nicht gestartet werden." }
    }

    $CatalogPath = Join-Path $PSScriptRoot 'models.json'
    if (-not (Test-Path -LiteralPath $CatalogPath)) { $CatalogPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'config\models.json' }
    $Catalog = @(Get-Content -LiteralPath $CatalogPath -Encoding UTF8 -Raw | ConvertFrom-Json)
    if ($SelectedModels.Count -eq 0) {
        $SelectionFile = Join-Path $PSScriptRoot 'selected-components.json'
        if (Test-Path -LiteralPath $SelectionFile) {
            $Selection = Get-Content -LiteralPath $SelectionFile -Encoding UTF8 -Raw | ConvertFrom-Json
            $SelectedModels = @($Selection.models)
        } else { $SelectedModels = @('stelex-qwen35-hauhau:9b') }
    }
    $Catalog = @($Catalog | Where-Object { $SelectedModels -contains $_.id })
    if ($Catalog.Count -eq 0) { Write-Host 'No local model selected. Configure an external provider or rerun component setup.'; exit 0 }
    $Verified = @()
    $Failures = @()
    foreach ($Item in $Catalog) {
        $Alias = [string]$Item.id
        $Source = [string]$Item.source
        Write-Host ("Installing / Installiere: " + $Item.name) -ForegroundColor Cyan
        try {
            $Installed = @(Get-InstalledModels)
            if ($Installed -notcontains $Source) {
                & $OllamaPath pull $Source
                if ($LASTEXITCODE -ne 0) { throw ('Model download failed: ' + $Source) }
            }
            $Temporary = Join-Path ([IO.Path]::GetTempPath()) ('Stelex-Model-' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $Temporary | Out-Null
            try {
                $Modelfile = Join-Path $Temporary 'Modelfile'
                $Parameters = @(('FROM ' + $Source), 'PARAMETER num_ctx 4096', 'PARAMETER temperature 0.8', 'PARAMETER top_p 0.9', 'PARAMETER top_k 40', 'PARAMETER repeat_penalty 1.1')
                [IO.File]::WriteAllText($Modelfile, ($Parameters -join [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
                & $OllamaPath create $Alias -f $Modelfile
                if ($LASTEXITCODE -ne 0) { throw ('Ollama cannot import this model. Update Ollama and retry: ' + $Alias) }
            } finally { Remove-Item -LiteralPath $Temporary -Recurse -Force -ErrorAction SilentlyContinue }
            $Payload = @{model=$Alias;messages=@(@{role='user';content='Reply briefly with OK.'});stream=$false;keep_alive=0;options=@{num_predict=1024;num_ctx=4096;temperature=0.8;top_p=0.9;top_k=40;repeat_penalty=1.1}}
            if ($Alias -match '(?i)qwen|gemma4') { $Payload.think = $false }
            $Body = $Payload | ConvertTo-Json -Depth 8
            $Reply = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -TimeoutSec 900
            if ([string]::IsNullOrWhiteSpace([string]$Reply.message.content) -or -not (Test-StelexUsageCount $Reply.prompt_eval_count) -or -not (Test-StelexUsageCount $Reply.eval_count)) { throw 'Model produced no complete, metered answer.' }
            $Verified += $Alias
            Write-Host ('Verified / Geprueft: ' + $Alias) -ForegroundColor Green
        } catch {
            $Failures += @{model=$Alias;error=$_.Exception.Message}
            Write-Host ($Alias + ': ' + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    if ($Verified.Count -eq 0) { throw 'No model could be started. Check Ollama, free disk space, RAM and the internet connection.' }
    if ($Failures.Count -gt 0) { Write-Host 'Some models are not ready. Available models still work. Rerun model setup after fixing the reported errors.' -ForegroundColor Yellow }
    Write-Host ('Ready / Bereit: ' + $Verified.Count + ' / ' + $Catalog.Count + ' models. GPU offload is automatic; context is 4096.')
    exit 0
} catch {
    Write-Host ('Setup failed / Einrichtung fehlgeschlagen: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
