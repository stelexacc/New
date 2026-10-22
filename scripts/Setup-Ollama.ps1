param([string]$Model = "huihui_ai/qwen3.5-abliterated:9b")
$ErrorActionPreference = "Stop"

Write-Host "Stelex GPT | Ollama setup / Einrichtung" -ForegroundColor Red
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    $Winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $Winget) {
        Write-Host "Install Ollama / Ollama installieren: https://ollama.com/download/windows"
        throw "Install Ollama, reopen PowerShell and run this script again. / Ollama installieren, PowerShell neu starten und erneut ausfuehren."
    }
    & winget install --exact --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Ollama installation failed. / Ollama-Installation fehlgeschlagen." }
    $OllamaDir = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
    if (Test-Path (Join-Path $OllamaDir "ollama.exe")) { $env:PATH = "$OllamaDir;$env:PATH" }
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw "Reopen PowerShell and try again. / PowerShell neu starten." }

try { $null = Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 3 }
catch {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
        Start-Sleep -Seconds 1
        try {
            $null = Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 2
            $Ready = $true
            break
        } catch { }
    }
    if (-not $Ready) { throw "Ollama did not start. / Ollama konnte nicht gestartet werden." }
}
& ollama pull $Model
if ($LASTEXITCODE -ne 0) { throw "Model download failed. / Modell-Download fehlgeschlagen." }

$Body = @{ model = $Model; prompt = "Reply only with OK"; stream = $false; options = @{ num_predict = 8 } } | ConvertTo-Json -Depth 5
$Response = Invoke-RestMethod "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 180
if ([string]::IsNullOrWhiteSpace($Response.response)) { throw "Model returned no response. / Keine Modellantwort erhalten." }
Write-Host "Ollama model verified. Restart Stelex GPT. / Ollama-Modell geprueft. Stelex GPT neu starten." -ForegroundColor Green
