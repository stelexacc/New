# STELEX GPT – DeepSeek, Free-Limits und Plugins

## Installation

1. ZIP vollständig in einen Ordner entpacken.
2. Stelex GPT und Stelex Admin schließen.
3. **Install.bat** starten. Die mitgelieferte ursprüngliche Setup-EXE allein installiert die Ergänzungen nicht.
4. Gewünschte Modelle auswählen; DeepSeek R1 Abliterated 8B ist weiterhin optional. Bestehende Modelle werden wiederverwendet.
5. Im Workspace über **＋ Plugins** einen Dienst verbinden.

Die ursprünglichen beiden EXE-Dateien und Deinstall.bat sind bytegleich erhalten. Install.bat installiert zunächst die Basis, prüft und kopiert dann die Erweiterungsdateien und ergänzt anschließend DeepSeek. Der vorhandene Chat-Build bleibt unverändert; die Plugin-Oberfläche wird als zusätzliches Modul geladen. Datenbanken, Chats, Konten und Modelle werden nicht gelöscht. Das neue Free-Limit wird beim ersten Start einmalig in vorhandene Konfigurationen übernommen; gekaufte Tarifbedingungen bleiben erhalten.

## Free-Limit pro Konto

- Maximal **10 erfolgreiche Antworten je 5-Stunden-Fenster** und **30 je Wochenfenster**.
- Zähler werden auf dem Server in SQLite gespeichert. Neue Chats, Modellwechsel, An-/Abmelden und Neustarts setzen sie nicht zurück. Wiederholung derselben abgeschlossenen Request-ID zählt nicht doppelt.
- Laufende Anfragen reservieren einen Platz. Fehlgeschlagene oder unterbrochene Anfragen geben ihn zurück.
- Sichtbare Restmenge und Erneuerungszeit im Workspace. Bei Überschreitung antwortet die API mit HTTP 429, `FREE_MESSAGE_LIMIT`, `Retry-After` und `resetAt`.
- Zusätzlich wird das bisher sehr große Tokenkontingent reduziert: 120 Einheiten je 5 Stunden und 600 je Woche; eine Einheit entspricht 100 gewichteten Tokens. Lange Kontexte/Antworten können dieses Kontingent schon vor der maximalen Antwortzahl ausschöpfen. Vorhandener Verbrauch bleibt erhalten.
- Free-Antwortgrenzen gelten auch im Demomodus und werden durch Guthaben nicht aufgehoben. Bezahlte Tarife erhalten keine neue Antwortzahlgrenze.
- Die Fenster beginnen bei erster Nutzung und erneuern sich nach Ablauf bei der nächsten Anfrage; keine Ansammlung ungenutzter Antworten. Die Grenzwerte sind eigene STELEX-Standards, keine Übernahme interner ChatGPT-Limits.

Es handelt sich um Kontolimits: Zusätzliche Konten sind getrennte Identitäten. Eine lokal installierte, vom Besitzer veränderbare Datenbank bietet keinen Manipulationsschutz gegen diesen Besitzer. Für einen zentral kontrollierten öffentlichen Dienst sind ein verwalteter Server und verifizierte Konten erforderlich.

## Plugin-Katalog

Die Oberfläche bietet Suche, Kategorien, Verbindungsprüfung, Trennen, Inhaltsauswahl, Textvorschau und gezielten Import als Chat-Anhang. Es wird nichts automatisch an eine KI gesendet. Die üblichen Dateigrößen-, Modell- und Kontingentgrenzen gelten auch für importierte Inhalte.

| Dienst | Umfang dieser Ausgabe |
| --- | --- |
| GitHub | Repositories durchsuchen, Ordner öffnen, UTF-8-Textdateien lesen |
| Dropbox | Ordner öffnen, UTF-8-Textdateien herunterladen |
| GitLab.com | Eigene Projekte, Repository-Ordner und Textdateien |
| Google Drive | Dateien suchen, Textdateien und Google-Dokumente exportieren |
| OneDrive | Ordner und Dateimetadaten; kein Dateiinhalt-Download |
| Box | Ordner und Dateimetadaten; kein Dateiinhalt-Download |
| Notion | Freigegebene Seiten suchen, erste 100 direkte Seitenblöcke lesen |
| Slack | Zugängliche öffentliche Kanäle und bis zu 50 letzte Nachrichten |
| Linear | Issues und Beschreibungen |
| Todoist | Aufgaben und Beschreibungen |
| Figma | Dateischlüssel eingeben, Struktur/Texte bis Tiefe 3 lesen |

Die neuen Konnektoren lesen ausschließlich. Die bisherige separate GitHub-Integration einschließlich PR-Vorschau bleibt erhalten. Es ist kein automatischer Agentenzugriff auf alle verbundenen Daten und keine Installation fremder ausführbarer Plugin-Pakete enthalten. Weitere Anbieter können im Adaptermodul ergänzt werden.

### Verbindungen

Die Einrichtung zeigt pro Dienst einen Link zur offiziellen Dokumentation und erforderliche Berechtigungen. Tokens direkt in der Plugin-Verwaltung eingeben, nicht im Chat. Credentials werden pro Konto mit AES-256-GCM verschlüsselt in der Stelex-Datenbank gespeichert. Der Schlüssel liegt im lokalen Server-Datenordner als `plugins.key`; bei Backups muss diese Datei zusammen mit der Datenbank erhalten bleiben. Wer Zugriff auf Datenbank und Schlüssel hat, kann die Verbindungen entschlüsseln.

Dies ist eine **Token-basierte Verbindung**, kein automatischer OAuth-Login wie in ChatGPT. Manche Dienste verlangen eine eigene registrierte Integration und explizit freigegebene Inhalte. Kurzlebige OAuth-/Developer-Tokens müssen manuell erneuert werden. Die Prüfung bestätigt den Accountzugriff; fehlende Inhaltsberechtigungen können trotzdem beim Öffnen gemeldet werden. Nur dokumentierte feste API-Hosts werden angesprochen; HTTP-Redirects werden nicht automatisch verfolgt. Keine Drittanbieter-Zugangsdaten sind im Paket enthalten.

## Prüfung und Grenzen

- 22 Node-Tests bestanden: Kontingente, parallele Anfragen, Retry-IDs, Erneuerung, Neustart, Fehlerrückerstattung, Migration und alle elf Plugin-Adapter.
- Anbieterantworten wurden in Tests simuliert. Keine Live-Verbindung zu privaten GitHub-, Dropbox- oder anderen Konten wurde getestet.
- Browserprüfungen mit Chromium: Plugin-Katalog, Suche, Verbindungsformular und Fehlermeldung, Escape, gezielter Anhangimport, HTML-Inhalte bleiben Text, sofortige Aktualisierung des Free-Zählers nach dem Chat.
- PowerShell-Update auf extrahierten Originaldateien ausgeführt und wiederholt. Beschädigte Payload vor Schreibzugriff abgewiesen. PowerShell-Syntax geprüft.
- Kein vollständiger Windows-/NSIS-/Ollama-End-to-End-Test unter Linux. DeepSeek-Modellquelle unverändert aus der vorherigen Ergänzung; Modelldownload hier weiterhin nicht bestätigt.

Die mitgelieferten Regressionstests lassen sich nach der Installation mit dem vorhandenen Node-Runtime ausführen:

```powershell
& "$env:LOCALAPPDATA\Programs\Stelex GPT\resources\runtime\node.exe" --test "$env:LOCALAPPDATA\Programs\Stelex GPT\resources\app\tests\update.test.mjs"
```
