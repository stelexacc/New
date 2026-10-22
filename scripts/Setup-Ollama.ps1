#Requires -Version 5.1
param(
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

    $Installed = @(Get-InstalledModels)
    if ($Installed -notcontains $SourceModel) {
        & $OllamaPath pull $SourceModel
        if ($LASTEXITCODE -ne 0) { throw "Download failed for '$SourceModel' (exit $LASTEXITCODE). The model source may be unavailable. / Modelldownload fehlgeschlagen. Internet, Modellquelle und aktuelle Ollama-Version pruefen." }
    }
    $Installed = @(Get-InstalledModels)
    if ($Installed -notcontains $SourceModel) { throw "The requested model source is not installed: $SourceModel / Die Modellquelle wurde nicht installiert." }

    if ($Model -ne $SourceModel) {
        & $OllamaPath cp $SourceModel $Model
        if ($LASTEXITCODE -ne 0) { throw "Could not create local model alias '$Model'. / Lokaler Modellname konnte nicht erstellt werden." }
    }
    $Installed = @(Get-InstalledModels)
    if ($Installed -notcontains $Model) { throw "Stelex model alias is missing: $Model / Der Stelex-Modellname fehlt." }

    Write-Host "Testing a real model reply / Echte Modellantwort wird geprueft ..."
    $Body = @{ model = $Model; messages = @(@{ role = "user"; content = "Reply briefly with OK." }); stream = $false; think = $false; options = @{ num_predict = 32 } } | ConvertTo-Json -Depth 6
    $Response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/chat" -Method Post -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes($Body)) -TimeoutSec 900
    if (-not $Response.message -or [string]::IsNullOrWhiteSpace([string]$Response.message.content)) { throw "The model returned no reply. / Das Modell hat keine Antwort geliefert." }
    Write-Host "Testing the Stelex-compatible API / Stelex-Schnittstelle wird geprueft ..."
    try {
        $CompatibleBody = @{ model = $Model; messages = @(@{ role = "user"; content = "Reply briefly with OK." }); max_tokens = 1024; stream = $false } | ConvertTo-Json -Depth 6
        $Compatible = Invoke-RestMethod -Uri "http://127.0.0.1:11434/v1/chat/completions" -Method Post -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes($CompatibleBody)) -TimeoutSec 900
        $Choices = @($Compatible.choices)
        if ($Choices.Count -lt 1 -or [string]::IsNullOrWhiteSpace([string]($Choices[0].message.content))) { throw "The compatible API returned no answer / Die kompatible API hat keine Antwort geliefert." }
        if (-not (Test-StelexUsageCount ($Compatible.usage.prompt_tokens)) -or -not (Test-StelexUsageCount ($Compatible.usage.completion_tokens)) -or $Compatible.usage.completion_tokens -gt 1024) {
            throw "The compatible API returned invalid token usage / Die kompatible API hat ungueltige Verbrauchsdaten geliefert."
        }
    } catch {
        throw ("The native Ollama test worked, but the Stelex-compatible API test failed / Der Ollama-Test war erfolgreich, aber die Stelex-Schnittstelle funktioniert nicht: " + $_.Exception.Message)
    }
    Write-Host "Installation complete. / Installation abgeschlossen." -ForegroundColor Green
    Write-Host "Model verified: $Model. You can now start Stelex GPT.exe. / Modell geprueft. Jetzt Stelex GPT.exe starten."
    exit 0
} catch {
    Write-Host "";
    Write-Host ("Setup failed / Einrichtung fehlgeschlagen: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "Stelex was not marked ready. Fix the error and rerun Install.bat. / Fehler beheben und Install.bat erneut starten."
    exit 1
}
