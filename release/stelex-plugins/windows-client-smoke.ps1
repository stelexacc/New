$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
trap {
 Write-Host ('::error::'+($_.Exception.Message -replace '\r?\n',' '))
 Write-Host $_.ScriptStackTrace
 exit 1
}
function Assert($Condition,[string]$Message){if(-not $Condition){throw $Message}}
$Setup=(Resolve-Path 'downloads/Setup.exe').Path
$Expected=(Get-Content -LiteralPath 'downloads/Setup.exe.sha256' -Raw).Split(' ')[0].Trim()
Assert ((Get-FileHash -LiteralPath $Setup -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Expected) 'Setup checksum mismatch.'
$Directory=Join-Path $env:RUNNER_TEMP 'Stelex Client Smoke'
Write-Host '::notice::Windows test: starting silent setup.'

Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class StelexWindowDiagnostics {
 public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p,IntPtr d);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc p,IntPtr d);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 public static string Describe(int pid) {
  var text=new List<string>();
  EnumWindows((h,d)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=(uint)pid)return true;
   var b=new StringBuilder(2048);GetWindowText(h,b,b.Capacity);if(b.Length>0)text.Add(b.ToString());
   EnumChildWindows(h,(c,unused)=>{var t=new StringBuilder(2048);GetWindowText(c,t,t.Capacity);if(t.Length>0)text.Add(t.ToString());return true;},IntPtr.Zero);return true;},IntPtr.Zero);
  return string.Join(" | ",text);
 }
}
'@
function Show-InstallerDiagnostics([int]$RootPid){
 $All=@(Get-CimInstance Win32_Process)
 $Ids=New-Object 'System.Collections.Generic.HashSet[int]';$null=$Ids.Add($RootPid)
 for($Pass=0;$Pass -lt 6;$Pass++){foreach($P in $All){if($Ids.Contains([int]$P.ParentProcessId)){$null=$Ids.Add([int]$P.ProcessId)}}}
 foreach($P in $All){if($Ids.Contains([int]$P.ProcessId)){
  $Text=[StelexWindowDiagnostics]::Describe([int]$P.ProcessId)
  Write-Host ('::notice::Installer diagnostic: '+$P.Name+' | '+($Text -replace '\r?\n',' '))
 }}
}
$Process=Start-Process -FilePath $Setup -ArgumentList ('/S /SKIPCOMPONENTS /D='+$Directory) -PassThru
if(-not $Process.WaitForExit(180000)){Show-InstallerDiagnostics $Process.Id;$Process.Kill();throw 'Silent setup timed out; owned window diagnostics captured.'}
$Process.Refresh();Assert ($Process.ExitCode -eq 0) ('Setup failed: '+$Process.ExitCode)
Assert (Test-Path -LiteralPath (Join-Path $Directory 'Stelex GPT.exe')) 'Client executable missing.'
Assert (-not(Test-Path -LiteralPath (Join-Path $Directory 'Stelex Admin.exe'))) 'Admin executable installed.'
Assert (-not(Test-Path -LiteralPath (Join-Path $Directory 'resources/private-admin.bundle.json'))) 'Admin private bundle installed.'
Assert (-not(Test-Path -LiteralPath (Join-Path $Directory 'resources/app/desktop/locked-admin.cjs'))) 'Admin UI installed.'
Assert (-not(Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stelex GPT.lnk'))) 'Desktop shortcut was created without finish-page choice.'
$ParsedModels=Get-Content -LiteralPath (Join-Path $Directory 'models.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$Models=@($ParsedModels)
Assert ($Models.Count -eq 5) 'Expected five selectable models.'
Assert (@($Models|Where-Object {$_.id -eq 'stelex-deepseek-r1-abliterated:8b'}).Count -eq 1) 'DeepSeek is missing.'
# Exercise the real Windows Forms selector without downloading model weights.
Write-Host '::notice::Windows test: installed files verified; testing native component selector.'
$SelectionOutput=& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Directory 'Select-Components.ps1') -CheckOnly
Assert ($LASTEXITCODE -eq 0) 'Windows Forms component selector failed.'
$Selection=$SelectionOutput|ConvertFrom-Json
Assert (@($Selection.models).Count -ge 1) 'Component selection did not produce a default model.'
Write-Host '::notice::Windows test: creating real Python and EXE artifacts with the installed application modules.'
& (Join-Path $Directory 'resources/runtime/node.exe') (Join-Path $Directory 'resources/app/tests/windows-real-artifacts.cjs')
Assert ($LASTEXITCODE -eq 0) 'Real Python/EXE generation test failed.'
# Start the actual installed Electron desktop app with the existing demo smoke protocol.
$Smoke=Join-Path $env:RUNNER_TEMP 'stelex-desktop-smoke.json'
$env:CI='true';$env:STELEX_DEMO_MODE='true';$env:STELEX_SMOKE_TEST_FILE=$Smoke
Write-Host '::notice::Windows test: native component selector passed; starting installed desktop app.'
$App=Start-Process -FilePath (Join-Path $Directory 'Stelex GPT.exe') -ArgumentList '--disable-gpu','--no-sandbox' -PassThru
if(-not $App.WaitForExit(90000)){$App.Kill();throw 'Desktop startup smoke timed out.'}
$App.Refresh();Assert ($App.ExitCode -eq 0) ('Desktop failed: '+$App.ExitCode)
Assert (Test-Path -LiteralPath $Smoke) 'Desktop did not write a smoke result.'
$State=Get-Content -LiteralPath $Smoke -Raw | ConvertFrom-Json
Assert ($State.ok -eq $true) ('Desktop smoke failed: '+($State|ConvertTo-Json -Compress))
Assert ($State.view -eq 'app') 'Expected client view, not Admin.'
# Keep an unrelated user file and verify the uninstaller preserves it.
$Sentinel=Join-Path $Directory 'user-file-to-preserve.txt';Set-Content -LiteralPath $Sentinel -Value 'user content'
Write-Host '::notice::Windows test: desktop startup passed; testing uninstall.'
$Uninstall=Start-Process -FilePath (Join-Path $Directory 'Uninstall Stelex GPT.exe') -ArgumentList ('/S _?='+$Directory) -PassThru
if(-not $Uninstall.WaitForExit(120000)){$Uninstall.Kill();throw 'Uninstall timed out.'}
$Uninstall.Refresh();Assert ($Uninstall.ExitCode -eq 0) ('Uninstall failed: '+$Uninstall.ExitCode)
$Deadline=[DateTime]::UtcNow.AddSeconds(15)
while((Test-Path -LiteralPath (Join-Path $Directory 'Stelex GPT.exe')) -and [DateTime]::UtcNow -lt $Deadline){Start-Sleep -Milliseconds 250}
Assert (-not(Test-Path -LiteralPath (Join-Path $Directory 'Stelex GPT.exe'))) 'Client executable still present after uninstall.'
Assert (Test-Path -LiteralPath $Sentinel) 'Uninstaller removed a user file.'
Write-Host 'WINDOWS CHECK PASSED: setup, no Admin, five-model selector, desktop app startup, optional shortcut not forced, and uninstall preserving user files.'
