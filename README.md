# STELEX GPT 1.3.1 — Windows-Kundeninstallation

ZIP unter Releases herunterladen, vollständig entpacken und `Install.bat` starten. Die BAT verwendet das enthaltene Setup, installiert Ollama und prüft eine echte Modellantwort. Danach die STELEX-GPT-Verknüpfung starten. Windows 10/11 x64; Internet für Ollama und das mehrere Gigabyte große Modell erforderlich.

Das Kundenpaket enthält keine Admin-EXE, keine Admin-Oberfläche und keine privaten Zugangsdaten. Der lokale Kundenserver sperrt Admin-Endpunkte. Das private Betreiber-Tool wird separat bereitgestellt.

KI-Standard: `qwen3.5-abliterated:9b`, lokaler Alias für `huihui_ai/qwen3.5-abliterated:9b`. Modellqualität, Geschwindigkeit und Bildfähigkeit hängen vom tatsächlich installierten Modell und Rechner ab. Ohne verfügbares Modell wird der Demomodus ausdrücklich angezeigt.

Starter 7,99 EUR, Pro 14,99 EUR, Max 29,99 EUR für jeweils 30 Tage; Free Trial und zusätzliche Credit-Pakete. Keine automatische Zahlung oder Verlängerung. Zentrale Kundenkonten und verkaufte Kontingente benötigen einen eigenen gemeinsamen HTTPS-Server. SMTP ist für E-Mail-Verifizierung separat zu konfigurieren.

Kontingente in Prozent für fünf Stunden und eine Woche, separate Countdowns, Tarifstatus, gespeicherte Chats, persönliche und chatspezifische KI-Anweisungen, Datei-/Bildanhänge und nativer Ausgabeordner. Bilder benötigen Modellunterstützung. Code wird gespeichert, nicht automatisch ausgeführt oder zu einer EXE kompiliert.

## Build und Prüfung

```sh
npm ci
npm test
npm run package:installer
```

Node 24.19.0 und NSIS erforderlich. Der Workflow baut nur das Kunden-Setup und veröffentlicht die ZIP erst nach einem nativen Windows-Starttest im Demomodus. Private Betreiber-Ausgaben und Zugangscodes sind nicht Bestandteil dieses Branches. Windows-Pakete sind unsigniert. Modellinstallation und echte Modellinferenz werden auf dem Zielrechner durch Install.bat geprüft.
