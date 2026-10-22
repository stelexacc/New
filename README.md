# STELEX GPT 1.5.0

Lokale Windows-App mit Ollama, geschütztem Admin-Tool, signierten Offline-Codes, automatischem Speichern erzeugter Dateien und lokalem Python-zu-EXE-Build. Kein öffentlicher Server erforderlich. Das bisherige rot-schwarze Design bleibt bestehen.

[Installation, Offline-Grenzen und Änderungen](docs/RELEASE-1.5.0.md). Die ZIP enthält Install.bat, Setup.exe und zusätzlich eine portable Admin-EXE. Codes werden pro lokaler Datenbank einmal eingelöst; eine globale Sperre gegen Einlösung auf unabhängigen PCs ist offline nicht möglich.

Der öffentliche Quelltext enthält nur den öffentlichen Ed25519-Prüfschlüssel. Private Admin-Dateien, Code-Prüfer und Signierschlüssel sind im Admin-Bündel mit AES-256-GCM verschlüsselt. Der vereinbarte Code bleibt privat und wird nicht im CI genutzt.

Entwicklung: Node 24.19+, `npm ci`, `npm test`, `npm run build`. Windows-Build: `npm run package:installer` mit NSIS; zusätzlich `node scripts/package-admin.mjs` und `node scripts/package-admin-portable.mjs`. Install.bat richtet auf Windows Python 3.13, PyInstaller und das Ollama-Modell ein. Es werden keine erzeugten Kundenprogramme automatisch gestartet.
