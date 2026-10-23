<!-- stelex-customer-release:1.6.0 -->
# STELEX GPT 1.6.0 – vier lokale Modelle und Spracheingabe

## Installation und Downloadinhalt

ZIP vollständig entpacken, alte Stelex-GPT- und Admin-Fenster schließen und **Install.bat** starten. Enthalten sind das gebrandete Windows-Setup, die zusätzliche portable Admin-EXE, Prüfsummen und diese Anleitung. Dein bisheriger Admin-Code bleibt gültig.

Install.bat installiert die App, prüft den Python-EXE-Builder und das gebündelte Sprachmodul und lädt die Chatmodelle über Ollama. Die drei zusätzlichen Chatmodelle sind mehrere Gigabyte groß und werden bei der Installation heruntergeladen; sie stecken nicht als rund 16 GB Modellgewichte in der ZIP. Zusammen mit dem bisherigen Modell genügend freien Speicher vorsehen, möglichst mindestens 30–40 GB. Der Download kann entsprechend lange dauern. Bereits vorhandene Modelldaten werden von Ollama wiederverwendet.

## Modelle

Das bisherige Standardmodell **qwen3.5-abliterated:9b** bleibt erhalten. Zusätzlich stehen in der Modellauswahl genau die drei Modelle aus deiner Liste:

1. **Qwen 3.5 9B Uncensored – HauhauCS Aggressive**, `Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` aus https://huggingface.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive
2. **Dolphin 3.0 Llama 3.1 8B**, `Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf` aus https://huggingface.co/bartowski/Dolphin3.0-Llama3.1-8B-GGUF
3. **Gemma 4 E4B Uncensored – HauhauCS Aggressive**, `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` aus https://huggingface.co/HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive

Die zusätzlichen GGUFs werden direkt mit Ollama verwendet; LM Studio ist dafür nicht zusätzlich erforderlich. Die internen Aliase lauten `stelex-qwen35-hauhau:9b`, `stelex-dolphin3:8b` und `stelex-gemma4-hauhau:e4b`. Sie werden nicht durch andere Modelle ersetzt. Die bisherigen persönlichen KI-Anweisungen bleiben bestehen; ein optionaler Prompt aus dem Textdokument überschreibt sie nicht.

Einstellungen: 4.096 Kontexttokens, Temperatur 0,8, Top P 0,9, Top K 40, Wiederholungsstrafe 1,1. Die Anwendung begrenzt den Kontext auf höchstens 8.192. Bei Modellwechsel wird das zuvor verwendete lokale Modell entladen. GPU-Offload verwaltet Ollama automatisch; 100 % werden nicht erzwungen, weil Modell, Kontext und Betriebssystem zusammen mehr als 8 GB VRAM benötigen können. Q4_K_M ist kein Versprechen, dass jede Anfrage vollständig auf eine 8-GB-GPU passt oder eine feste Geschwindigkeit erreicht.

Die Installation prüft für jedes Modell eine echte lokale Antwort. Wenn ein Download oder Modellstart fehlschlägt, steht der konkrete Fehler im Setup-Fenster. Bereits funktionsfähige Modelle bleiben nutzbar. Fehlende Modelle werden gekennzeichnet; erneutes „Modell einrichten“ kann nach einem Ollama-Update bzw. behobenem Speicher-/Verbindungsproblem helfen. Eine aktuelle Ollama-Version ist insbesondere für neue Architekturen nötig.

Die drei neuen Einzel-GGUF-Importe werden zunächst als Textmodelle geführt. Bild-/Audio-Projektoren sind nicht Bestandteil der drei angeforderten Dateien. Für Bilder das bisherige Modell verwenden, sofern dessen Ollama-Installation tatsächlich Bildunterstützung meldet. Die Spracheingabe arbeitet unabhängig davon mit allen Textmodellen.

## Reinsprechen, bearbeiten, absenden

Im lokalen Chat auf das **Mikrofon** neben der Büroklammer klicken. Während der Aufnahme erscheint ein Timer. Mit der roten Stopp-Schaltfläche beenden. Whisper wandelt die Aufnahme lokal in Text um und fügt sie in das Eingabefeld ein. Danach kannst du sie bearbeiten und über den gewohnten Senden-Pfeil abschicken. Es erfolgt kein automatisches Absenden. Eine Aufnahme ist auf 60 Sekunden begrenzt.

Abbrechen verwirft die Aufnahme und lässt den bisherigen Entwurf stehen. Während der Texterkennung kann ebenfalls abgebrochen werden. Eine verweigerte Mikrofonberechtigung wird erklärt; bei Bedarf in den Windows-Datenschutzeinstellungen den Mikrofonzugriff für Desktop-Apps erlauben. Es wird nur Audio aufgenommen, keine Kamera. Die Berechtigung ist auf ausdrücklich gestartete Aufnahmen im lokalen Kunden-Chat beschränkt.

Spracherkennung: **whisper.cpp 1.8.3 mit dem mehrsprachigen Whisper-base-Modell**, CPU-basiert und ohne Cloud-Transkriptionsdienst. Laufzeit und Sprachmodell sind im Kunden-Setup gebündelt und mit Prüfsummen überprüft. `Setup-Voice.ps1` prüft die Installation und richtet nötigenfalls die signaturgeprüfte Microsoft-C++-Laufzeit ein. Deutsch und Englisch folgen der gewählten Oberflächensprache. Temporäre Audiodateien werden nach normaler Verarbeitung und Abbruch entfernt; erst wenn du absendest, gehört der Text zum lokalen Chat. Erkennung kann Fehler enthalten – Text vor dem Absenden prüfen.

## Bisherige Funktionen

Offline-signierte Credits und Pro-Tage, erneuerbare Prozentkontingente, Tarife, der geschützte Admin-Bereich, Dateianhänge, automatisches Speichern in den gewählten Ordner, lokale Python-EXE-Builds, kompakte Schrift und die dauerhaft sichtbare Abschlusszeit bleiben erhalten. Kein öffentliches Hosting nötig; interne lokale Dienste starten automatisch. Ein Offline-Code ist weiterhin nur einmal pro lokaler Datenbank gesperrt, nicht weltweit über unabhängige PCs hinweg. Fremde Einlösungen können offline nicht in deine Admin-Logs zurückgemeldet werden.

## Prüfungen

Die Veröffentlichung erfolgt erst nach Backend-/Dateisystem-/Audio-/Kryptografietests, Browserprüfungen, Windows-Start von Setup und Admin sowie echtem Python-EXE-Build. Zusätzlich prüft Windows die Mikrofon-Berechtigungsgrenzen mit einem künstlichen Mikrofon und die tatsächliche lokale Whisper-Erkennung einer öffentlichen Sprachaufnahme. Ein echtes Mikrofon auf deinem PC sowie die großen Chatmodelle auf deiner Hardware können nicht durch den CI-Test ersetzt werden. Die Modellinstallation führt diese Antwortprüfung auf dem Ziel-PC durch. Windows-Pakete sind nicht mit einem kommerziellen Herausgeberzertifikat signiert.
