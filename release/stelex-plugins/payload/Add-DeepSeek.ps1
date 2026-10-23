#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
# Register the optional model before the existing component selector runs.
$Model = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'DeepSeek-model.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if ($Model.id -ne 'stelex-deepseek-r1-abliterated:8b' -or $Model.source -ne 'huihui_ai/deepseek-r1-abliterated:8b') { throw 'Unexpected DeepSeek model definition.' }
$Paths = @((Join-Path $InstallDirectory 'models.json'), (Join-Path $InstallDirectory 'resources/app/config/models.json'))
$SelectorPath = Join-Path $InstallDirectory 'Select-Components.ps1'
$Selector = [IO.File]::ReadAllText($SelectorPath)
$Updates = @()
foreach ($Path in $Paths) {
    $Catalog = @(Get-Content -LiteralPath $Path -Encoding UTF8 -Raw | ConvertFrom-Json)
    if ($Catalog.Count -eq 0) { throw ('Empty model catalog: ' + $Path) }
    $Existing = @($Catalog | Where-Object { $_.id -eq $Model.id })
    if ($Existing.Count -gt 1) { throw 'Duplicate DeepSeek model registration.' }
    if ($Existing.Count -eq 0) { $Catalog += $Model }
    elseif ($Existing[0].source -ne $Model.source) { throw 'DeepSeek model ID already has a different source.' }
    $Updates += @{Path=$Path;Text=(ConvertTo-Json -InputObject @($Catalog) -Depth 12)}
}
# Position the footer after all model rows, retaining every existing control.
if (-not $Selector.Contains('# STELEX_DYNAMIC_MODEL_LAYOUT')) {
    $Replacements = @(
        @('$Form.Size=New-Object Drawing.Size(690,620)', '$Form.Size=New-Object Drawing.Size(690,([Math]::Max(620,428+48*@($Catalog).Count))) # STELEX_DYNAMIC_MODEL_LAYOUT'),
        @('Drawing.Point(25,320)', 'Drawing.Point(25,$Y)'),
        @('Drawing.Point(25,365)', 'Drawing.Point(25,($Y+45))'),
        @("Label '' 420 70", "Label '' (`$Y+100) 70"),
        @('Drawing.Point(370,505)', 'Drawing.Point(370,($Y+185))')
    )
    foreach ($Pair in $Replacements) {
        if (-not $Selector.Contains($Pair[0])) { throw ('Unsupported component selector layout: ' + $Pair[0]) }
        $Selector = $Selector.Replace($Pair[0],$Pair[1])
    }
}
# Validate all input before replacing any installed file.
$Updates += @{Path=$SelectorPath;Text=$Selector}
foreach ($Update in $Updates) {
    $Temporary = $Update.Path + '.deepseek-' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($Temporary, $Update.Text, (New-Object Text.UTF8Encoding($true)))
        Move-Item -LiteralPath $Temporary -Destination $Update.Path -Force
    } finally {
        if (Test-Path -LiteralPath $Temporary) { Remove-Item -LiteralPath $Temporary -Force }
    }
}
Write-Host 'DeepSeek R1 Abliterated 8B ist als optionale Modellauswahl registriert.'
