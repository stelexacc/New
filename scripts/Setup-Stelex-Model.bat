@echo off
setlocal EnableExtensions DisableDelayedExpansion
if /I "%~1"=="--help" goto help
set "STELEX_AI_MODELS=huihui_ai/qwen3.5-abliterated:9b"
set "OLLAMA_EXE="
echo.
echo STELEX GPT - Modell einrichten / Model setup
echo Modell / Model: %STELEX_AI_MODELS%
echo Quelle / Source: https://ollama.com/huihui_ai/qwen3.5-abliterated:9b
echo.
echo Der Download umfasst mehrere GB. Genuegend Speicher und RAM erforderlich.
echo The download is several GB. Sufficient disk space and RAM are required.
echo Stelex GPT vor der Einrichtung vollstaendig beenden.
echo Fully quit Stelex GPT before setup.
echo.
if /I "%~1"=="--yes" goto locate
choice /C JYN /N /M "Jetzt einrichten? Ja/Yes [J/Y], Nein/No [N]: "
if errorlevel 3 goto cancelled
if errorlevel 1 goto locate
goto failed

:locate
for /f "delims=" %%I in ('where ollama.exe 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%I"
if defined OLLAMA_EXE goto service
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if defined OLLAMA_EXE goto service
where winget.exe >nul 2>&1
if errorlevel 1 goto no_winget
echo Ollama wird installiert / Installing Ollama...
winget install --exact --id Ollama.Ollama --accept-package-agreements --accept-source-agreements --disable-interactivity
if errorlevel 1 goto failed
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not defined OLLAMA_EXE if exist "%ProgramFiles%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if not defined OLLAMA_EXE for /f "delims=" %%I in ('where ollama.exe 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%I"
if not defined OLLAMA_EXE goto no_ollama

:service
call :check_service
if not errorlevel 1 goto download
start "Ollama - Stelex GPT" /min "%OLLAMA_EXE%" serve
set /a ATTEMPTS=0
:wait_service
call :check_service
if not errorlevel 1 goto download
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 goto failed
timeout /t 1 /nobreak >nul
goto wait_service

:download
echo Modell wird geladen. Dieses Fenster geoeffnet lassen.
echo Downloading model. Keep this window open.
"%OLLAMA_EXE%" pull "%STELEX_AI_MODELS%"
if errorlevel 1 goto failed
echo Modell wird geprueft / Checking installed model...
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "try { $models=(Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10).models; if (@($models | Where-Object { $_.name -eq $env:STELEX_AI_MODELS -or $_.model -eq $env:STELEX_AI_MODELS }).Count -eq 0) { exit 1 }; $dir=Join-Path $env:APPDATA 'Stelex GPT'; [IO.Directory]::CreateDirectory($dir) | Out-Null; $destination=Join-Path $dir 'ollama-model.json'; $temporary=$destination+'.tmp'; $json=@{model=$env:STELEX_AI_MODELS} | ConvertTo-Json; [IO.File]::WriteAllText($temporary,$json,(New-Object Text.UTF8Encoding($false))); Move-Item -LiteralPath $temporary -Destination $destination -Force; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto failed
echo.
echo Fertig. Stelex GPT neu starten. Das Modell wird automatisch ausgewaehlt.
echo Done. Restart Stelex GPT. The model will be selected automatically.
echo Fuer echte Antworten muss das Modell in den Arbeitsspeicher geladen werden koennen.
echo Real replies require enough memory to load the model.
if /I not "%~1"=="--yes" pause
exit /b 0

:check_service
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "try { $null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; exit 0 } catch { exit 1 }"
exit /b %errorlevel%

:no_winget
echo Bitte Ollama installieren / Please install Ollama:
echo https://ollama.com/download/windows
echo Danach diese Datei erneut starten / Then run this file again.
goto failed
:no_ollama
echo Ollama nicht gefunden. Neues Terminal oeffnen und erneut starten.
echo Ollama not found. Open a new terminal and run setup again.
goto failed
:failed
echo.
echo Einrichtung fehlgeschlagen. Keine erfolgreiche Installation bestaetigt.
echo Setup failed. Successful installation has not been confirmed.
echo Fehlermeldung oben pruefen / Check the error message above.
if /I not "%~1"=="--yes" pause
exit /b 1
:cancelled
echo Abgebrochen / Cancelled.
exit /b 2
:help
echo Stelex GPT model setup for Windows 10/11.
echo Download Ollama and huihui_ai/qwen3.5-abliterated:9b.
echo Double-click to confirm setup. --yes runs without the confirmation prompt.
echo Setup preserves existing models and writes only the Stelex model preference.
exit /b 0
