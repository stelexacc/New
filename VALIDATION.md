# Prüfstand / Validation

Version 1.1.0 ergänzt drei Tests zur bevorzugten Ollama-Modellwahl und einen Test für die native Ollama-Chat-API. Zusammen mit den bisherigen Backendtests sind es 16 Tests. Die Windows-Batchdatei wird in GitHub Actions mit --help ausgeführt und die PowerShell-Datei dort syntaktisch geprüft. Ein vollständiger 9B-Download und reale Modellinferenz sind hier weiterhin nicht geprüft.


Geprüft am 21. Oktober 2026 auf Linux mit Node.js 24.19.0 und Chromium 154.

## Erfolgreich geprüft

- Reproduzierbare Installation aus `package-lock.json`; Vite-Produktionsbuild.
- **12 Backend-Tests**, alle bestanden, keine übersprungenen Tests: Anmeldung/Sitzungen, Kontotrennung, geschütztes Erstellen von Codes, atomare parallele Einlösung, exakte Tokenabrechnung, Rückerstattung bei Providerfehlern, Wiederholung bereits abgeschlossener Chat-Anfragen ohne erneute Abbuchung, Eingabegrenzen, Rate Limits, Origin-/Host-Prüfung, Secure-Cookies, Prozesssperren und Wiederherstellung offener Reservierungen.
- **10 Browserprüfungen** mit der gebauten Oberfläche: Konto erstellen, Guthaben, Discord-Kauflinks, 137 Credits einlösen, erneutes Einlösen abweisen, Demoantwort ohne Abbuchung, Verlauf nach Neuladen, tatsächlicher Markdown-Download, DE/EN inklusive neuer Antworten, Verbrauchsanzeige, Ollama-Hinweise, Wiederholung nach absichtlich unterbrochener Antwortübertragung und Erhalt erfolgreicher Antworten bei fehlgeschlagener Kontoaktualisierung. Mobile Navigation bei 390 Pixeln ohne horizontalen Überlauf. Keine JavaScript-Ausnahmen und keine externen Schrift- oder Netzwerkabhängigkeiten beim Laden der Oberfläche.
- Separates Admin-Tool im Browser: ungültiger Schlüssel abgewiesen, zwei Codes zu je 137 Credits erzeugt, CSV tatsächlich heruntergeladen, 274 Credits ausgegeben, Einlösung und aktualisierte Statistik, Sprachwechsel, Notizen als Text, Abmeldung ohne gespeicherte Zugangsdaten.
- Laufzeit-Abhängigkeiten: `npm audit --omit=dev --audit-level=high` ohne bekannte gemeldete Schwachstellen.
- Windows-Runtimes aus offiziellen Quellen heruntergeladen und SHA-256-geprüft. Beide EXE-Dateien sind x86-64-Windows-GUI-Dateien. Archiv wird auf CRC, benötigte Ressourcen und fehlende Laufzeitgeheimnisse geprüft. Die ZIP muss vollständig entpackt werden.

Die Backend-Abrechnungstests verwenden einen kontrollierten HTTP-Testprovider mit echten Requests. Sie prüfen beispielsweise **251 Tokens → 3 Credits** und nachfolgende Fehler ohne zusätzliche Abbuchung. Das ist kein Test der Antwortqualität eines installierten Sprachmodells.

## Offen bzw. außerhalb dieser Maschine

- **Keine native Windows-Ausführung**: Die Windows-Dateien wurden unter Linux zusammengestellt. App-Start, Betriebssystemintegration und `Setup-Ollama.ps1` müssen unter Windows noch ausgeführt werden.
- **Kein echtes Ollama-Modell in dieser Cloud-Instanz installiert**. Die Oberfläche und die vollständige lokale Credits-Verwaltung wurden im gekennzeichneten Demomodus geprüft; die OpenAI-kompatible Schnittstelle wurde mit dem Testprovider validiert. Für echte KI-Antworten Ollama und ein Modell auf dem Zielrechner installieren. Das beiliegende Setup-Skript prüft dort eine echte Modellantwort.
- **Kein öffentlicher Server bereitgestellt**. Verkaufte Credits verschiedener Kunden benötigen einen gemeinsamen Betreiber-Server mit dauerhaftem Datenverzeichnis und HTTPS. Lokale persönliche Instanzen haben getrennte Konten und Guthaben.
- Keine automatische Zahlung oder Discord-Bot-Integration; die Kaufbuttons öffnen den gewünschten Discord-Einladungslink.
- Keine veröffentlichte Cloud-Version und kein frischer Snapshot-Restore getestet. Gespeicherte Startanweisungen und ein erzeugtes ZIP ersetzen diese Schritte nicht.

## Tests wiederholen

```sh
npm ci
npm run build
npm test
```

Optionaler Browser-Smoke-Test mit Python Playwright gegen einen **isolierten Demotestserver**. Er erzeugt ein Testkonto und Credit-Codes:

```sh
# Terminal 1 (eigenes temporäres Datenverzeichnis):
STELEX_DATA_DIR=/tmp/stelex-browser-test STELEX_DEMO_MODE=true npm start

# Terminal 2, Python Playwright und Chromium vorausgesetzt:
python3 tests/ui_smoke.py --admin-token-file /tmp/stelex-browser-test/admin-token.txt
```

Der Test gibt weder Codes noch Admin-Schlüssel aus. `STELEX_CHROMIUM_PATH` kann auf eine vorhandene Chromium-Datei gesetzt werden. Screenshots liegen unter `test-results/` und gehören nicht zum Kundenpaket.

## English

Validated on Linux with Node.js 24.19.0 and Chromium 154: dependency installation, production build, **12 passing backend tests**, buyer/chat browser flows, separate admin browser flows, language selection, mobile layout, offline font loading and Windows archive structure/checksums. Billing tests use a controlled HTTP provider; they are not real-model quality tests.

**Not verified:** native Windows execution, running the Windows Ollama setup script, real Ollama inference in this cloud instance, public hosting or a published cloud snapshot. Install Ollama and a model on the target computer for real replies. A shared paid service needs a server you control, shared by all customers. Demo replies are clearly labelled and free.
