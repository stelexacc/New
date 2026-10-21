# Stelex GPT

Deutsch · [English](#english)

Stelex GPT ist eine Desktop- und Webanwendung mit rot-schwarzem Stelex-Design, deutscher und englischer Oberfläche, Ollama-Chat, Konten, gespeicherten Gesprächen und serverseitiger Credits-Verwaltung. Käufe werden manuell auf **https://discord.gg/stelex** vereinbart. Es gibt keine automatische Zahlungsabwicklung und keine automatische monatliche Verlängerung.

## Windows starten

1. Das Archiv `artifacts/Stelex-GPT-Windows-x64.zip` vollständig entpacken. Die EXE benötigt die Dateien im selben Ordner.
2. Ollama installieren und das Modell laden. Dafür kann `Setup-Ollama.ps1` im entpackten Ordner verwendet werden, alternativ in PowerShell:

   ```powershell
   winget install --exact --id Ollama.Ollama
   # Neues Terminal öffnen, nachdem die Installation abgeschlossen ist.
   ollama pull qwen2.5-coder:1.5b
   ```

3. Ollama laufen lassen und `Stelex GPT.exe` öffnen. Ohne verfügbares Modell startet ein ausdrücklich gekennzeichneter Demomodus. Stelex GPT nach dem Modelldownload vollständig beenden und neu starten.
4. Ein Konto anlegen. Konten, Chats und Guthaben gehören zum jeweils verbundenen Stelex-Server.

Das Standardmodell ist bewusst kompakt und benötigt ungefähr 1 GB Download sowie zusätzlichen Arbeitsspeicher. Die Geschwindigkeit hängt von CPU/GPU und Kontextlänge ab. Andere installierte Modelle können über die Serverkonfiguration ausgewählt werden. Der Systemtext gibt der KI einen direkten, hilfreichen Programmierstil und die gewählte Sprache vor. Er umgeht keine Schutzmechanismen und garantiert keine bestimmte Antwort eines Modells.

Die Windows-Binärdateien werden aus offiziellen Electron- und Node-Downloads erstellt; die Downloads werden anhand ihrer veröffentlichten SHA-256-Prüfsummen geprüft. Das Archiv enthält keine API-Schlüssel, keine Kontodaten und keinen vorkonfigurierten Admin-Schlüssel. Es ist keine signierte Windows-Installation.

## Credits verkaufen und Codes erstellen

Für verkaufte Credits benötigen **alle Kunden denselben von dir betriebenen Server**. Eine lokale Installation auf dem Kunden-PC ist ein persönlicher Workspace und kann keine vertrauenswürdige zentrale Abrechnung ersetzen. Jeder eigene Server hat einen getrennten Datenbestand.

1. Den Server wie unten starten, Ollama anbinden und hinter HTTPS bereitstellen. Die Anwendung erstellt beim ersten Start einen zufälligen Admin-Schlüssel in ihrem privaten Datenverzeichnis, sofern `STELEX_ADMIN_TOKEN` nicht vorgegeben ist.
2. `Stelex Admin.exe` öffnen und denselben Server auswählen. Alternativ auf deinem Server `/admin/` öffnen. Mit dem Admin-Schlüssel anmelden. Der Schlüssel gehört nur dir und wird nie in die Kunden-App eingebaut.
3. Credits, Anzahl der Codes und optional eine interne Notiz eingeben. Die tatsächlich erzeugten Codes sofort kopieren oder als CSV exportieren. Der Server speichert nur ihre Hashwerte; die Klartexte können später nicht wiederhergestellt werden.
4. Nach dem Kauf auf Discord einen Code an den Kunden geben. In **Credits → Code einlösen** wird der exakte Betrag einmalig gutgeschrieben, zum Beispiel: „Herzlichen Glückwunsch! Du hast 100 Credits erhalten.“

Codes sind zufällig und einmalig. Einlösen und Guthabenänderung erfolgen in einer Datenbanktransaktion. Ein abgefangener oder bereits verwendeter Code kann kein zweites Guthaben erzeugen. Das Admin-Werkzeug benötigt bei jeder neuen Anmeldung deinen Schlüssel; es speichert ihn nicht im Browser.

Credits sind keine Modell-Tokens: die Anwendung rechnet Eingabe- und Ausgabetokens mit `ceil((Eingabetokens + Ausgabetokens) / 100)` in Credits um. Vor einer echten Modellanfrage wird ausreichend Guthaben für die Eingabe und maximal 2.048 Ausgabetokens reserviert; nicht verbrauchtes Guthaben wird zurückgegeben. Bei einem Providerfehler wird die Reservierung zurückgenommen. Wiederholte Übertragungen derselben Anfrage mit derselben Kennung werden einmal abgerechnet. Demonstrationsantworten sind kostenlos. Es werden nur auf diesem Server erfasste Nutzung und Guthaben angezeigt.

## Entwicklung und eigener Server

Voraussetzung: **Node.js 24.19.0 oder neuer** und npm. Das Repository liegt in Cloud-Aufgaben bereits isoliert unter `/workspace/New`; den bestehenden Checkout verwenden. Ohne ausdrücklichen Wunsch keinen zusätzlichen Git-Worktree erstellen.

```sh
npm ci
npm run build
npm test
npm start
```

Ohne `.env` läuft der Server standardmäßig lokal mit Demoantworten. Für echte Antworten die Vorlage kopieren und Ollama installieren:

```sh
cp .env.example .env
ollama pull qwen2.5-coder:1.5b
# Ollama muss auf 127.0.0.1:11434 laufen.
npm start
```

Anwendung: Port `4318`. Admin: Pfad `/admin/` auf demselben Server. Für Frontend-Entwicklung parallel `npm run dev:ui` starten; Vite leitet `/api` an den Backendserver weiter. Für SQLite wird kein separater Datenbankdienst benötigt.

Die Vorlage setzt für den echten Betrieb neue Konten auf **0 Credits**. Der Demomodus gewährt lokales Testguthaben, das keinen Kauf darstellt. Für einen gemeinsam genutzten Dienst ein dauerhaftes Datenverzeichnis außerhalb des Repositorys, einen eigenen Admin-Schlüssel und HTTPS verwenden. Unter Einstellungen können Desktop-Kunden die HTTPS-Adresse dieses Servers hinterlegen. Die Ollama-API bleibt beim Server und wird nicht öffentlich freigegeben.

Die wichtigsten Variablen stehen in [.env.example](.env.example). `STELEX_AI_BASE_URL` endet bei Ollama auf `/v1`; `STELEX_AI_MODELS` enthält die erlaubten, tatsächlich installierten Modellnamen. Für HTTPS `STELEX_PUBLIC_ORIGIN` auf die öffentliche Adresse setzen. Bei einem eigenen lokalen Reverse Proxy kann zusätzlich `STELEX_TRUST_PROXY_LOOPBACK=true` gesetzt werden: Der Proxy muss die echte Client-IP als letzten Eintrag in `X-Forwarded-For` anhängen; der Backendport bleibt nur lokal erreichbar. Optionale Anbieter-Schlüssel bleiben ausschließlich auf dem Server. Private `.env`-Dateien und Datenverzeichnisse niemals an Kunden weitergeben.

Ein Backup muss das vollständige Datenverzeichnis einschließlich SQLite-Datenbank erhalten. Den Server vor einem dateibasierten Backup stoppen oder ein konsistentes SQLite-Backup erstellen. Pro Datenverzeichnis nur **einen Serverprozess** betreiben: ausstehende Guthabenreservierungen werden beim Neustart wiederhergestellt. Nach einem Neustart müssen Webserver und Ollama erneut laufen; laufende Prozesse gehören nicht zu einem Cloud-Snapshot.

## Windows-Paket reproduzieren

```sh
npm ci
npm run package:windows
```

Das Skript erzeugt ein portables x64-Archiv unter `artifacts/`. Die Dateien werden auf Linux zusammengestellt. Eine erfolgreiche Erstellung ist noch kein Ausführungstest unter Windows; den aktuellen Prüfstand dokumentiert [VALIDATION.md](VALIDATION.md).

## English

Stelex GPT provides a German/English desktop and web workspace, local Ollama integration, accounts, saved conversations and server-managed credits. All purchase buttons open **https://discord.gg/stelex**. Purchases are manual, one-time arrangements; the application does not charge a payment card or renew subscriptions.

Extract the entire Windows ZIP, install Ollama, run `ollama pull qwen2.5-coder:1.5b`, keep Ollama running, then open `Stelex GPT.exe`. `Setup-Ollama.ps1` automates installation and performs a real model request on Windows. If the selected model is unavailable, the desktop starts in a clearly labelled demo mode with free sample replies. Restart the desktop after preparing Ollama.

For development use Node.js 24.19.0+, then `npm ci`, `npm run build`, `npm test` and `npm start`. Copy `.env.example` to `.env` for real Ollama replies. The server uses port 4318 by default; its separate administrator tool is available under `/admin/` and as `Stelex Admin.exe` in the portable archive.

**A paid, shared credit service requires a server you control, used by every customer.** A customer's own local instance is a separate personal workspace. Connect desktop clients to the shared server's HTTPS URL in Settings. Keep Ollama, the SQLite data folder and administrator token on your server. Never ship them in customer installers.

In the administrator tool enter the private admin token, the exact credit quantity and number of codes. Copy/download generated codes immediately; only hashes remain in the database. After arranging a purchase on Discord, give the buyer a code. Redemption adds exactly that quantity once and shows a localized congratulations message. The admin token stays in memory, never browser storage.

Real requests are billed from recorded input/output token usage, using the server's token-to-credit ratio. Provider failures refund reserved credits; demo replies do not spend credits. Model behavior depends on the chosen model. This app does not jailbreak models or promise unrestricted answers.

Build a portable Windows archive using `npm run package:windows`. Official runtime artifacts are checked against their published SHA-256 digests. The package is unsigned and requires its sibling files. See [VALIDATION.md](VALIDATION.md) for the exact validation performed and remaining deployment prerequisites.
