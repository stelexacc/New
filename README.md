# STELEX GPT 1.6.0

Lokale Windows-App mit bisherigem Design, vier auswählbaren Ollama-Modellen und lokaler Spracheingabe. Aufnahme starten, stoppen, erkannten Text bearbeiten und selbst absenden. Keine Cloud-Transkription erforderlich.

[Installation und Änderungen](docs/RELEASE-1.6.0.md). Die ZIP enthält Install.bat, Setup.exe, die geschützte portable Admin-EXE und Prüfsummen. Install.bat lädt die drei zusätzlichen Q4_K_M-Chatmodelle herunter und prüft lokale Antworten. Das bisherige Qwen3.5-Abliterated-9B bleibt Standard. Whisper-base und seine Windows-Laufzeit sind im Kunden-Setup enthalten.

Offline-Codes, automatisches Speichern, Python-EXE-Builds und die endgültige Bearbeitungszeit bleiben erhalten. Private Admin-Dateien und Signierschlüssel sind weiterhin verschlüsselt; Klartext-Zugangsdaten gehören weder in Quelltext noch Build-Logs.

Entwicklung: Node 24.19+, `npm ci`, `npm test`, `npm run build`. Sprachressourcen vorbereiten: `node scripts/prepare-voice.mjs`. Windows-Paket: `npm run package:installer` mit NSIS, zusätzlich `node scripts/package-admin.mjs` und `node scripts/package-admin-portable.mjs`. Veröffentlichungen werden erst nach nativen Windows-Prüfungen freigegeben.
