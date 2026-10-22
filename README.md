# STELEX GPT 1.4.0 – App und Admin in einem Setup

Das rot-schwarze Desktopdesign bleibt erhalten. Neu: gemeinsamer lokaler Dienst für App und Admin, kein 500-Credit-Startgeschenk, deutlich größere erneuerbare Kontingente, native Ollama-Antworten mit Streaming, Laufzeit und Verarbeitungsstatus. Standardmodell: `qwen3.5-abliterated:9b`.

[Installation und Änderungen](docs/RELEASE-1.4.0.md). Windows-Download enthält Install.bat und das gebrandete Setup.exe mit beiden Programmen. Der private Admin-Bereich bleibt AES-256-GCM-verschlüsselt, bis der vereinbarte Code lokal eingegeben wird. Der Code steht nicht im Repository und wird nicht an GitHub CI übermittelt.

Für Kunden auf anderen PCs ist ein gemeinsamer betriebener HTTPS-Server erforderlich. Der lokale gemeinsame Dienst arbeitet nur innerhalb desselben Windows-Kontos. SMTP-Zugangsdaten sind optional und müssen für echte E-Mail-Verifizierung separat eingerichtet werden.

Entwicklung: Node 24.19+, `npm ci`, `npm test`, `npm run build`, `npm start`. Windows-Paket: `npm run package:installer` mit NSIS. `.env.example` enthält Konfigurationsnamen, keine privaten Zugangsdaten.
