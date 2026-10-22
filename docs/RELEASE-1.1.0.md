# Stelex GPT 1.1.0

## Deutsch

1. Stelex-GPT-Setup-1.1.0.exe installieren und Stelex GPT vollständig beenden.
2. Im Startmenü **Stelex GPT → Modell einrichten** oder die beiliegende **Setup-Stelex-Model.bat** starten.
3. Die Einrichtung installiert bei Bedarf Ollama über winget, lädt huihui_ai/qwen3.5-abliterated:9b, prüft den installierten Modelltag und speichert die Auswahl.
4. Stelex GPT neu starten. Das Modell erscheint automatisch zuerst im Modellmenü.

Der Modelldownload umfasst mehrere Gigabyte und erfolgt erst nach Bestätigung auf dem jeweiligen PC. Bereits installierte Modelle bleiben erhalten. Eine bestehende Stelex-Installation muss auf 1.1.0 aktualisiert werden, damit die gespeicherte Modellwahl automatisch übernommen wird. Für gemeinsam verwaltete Credits bleibt ein Betreiber-Server erforderlich; lokale Modelle laufen auf dem jeweiligen Rechner.

Es wird ein Drittanbietermodell eingebunden. Die Anwendung verändert keine Modellgewichte und fügt keinen Prompt zur Umgehung von Schutzmechanismen hinzu. Bestimmte Antworten werden nicht garantiert.

Validiert: automatische Modellwahl, fehlende Modelle, beschädigte Einstellungen, bestehende Backend-Tests und Build. Die Windows-Einrichtung wird mit --help geprüft; ein vollständiger Download und echte 9B-Inferenz wurden in der Cloud nicht ausgeführt. Genügend RAM/VRAM und Speicherplatz sind erforderlich.

## English

Install the 1.1.0 setup, fully quit Stelex GPT, then run **Model setup / Modell einrichten** from the Start menu or launch **Setup-Stelex-Model.bat**. Confirm the several-gigabyte download. The script installs Ollama through winget if needed, pulls the specified model, verifies its installed tag and saves the choice. Restart Stelex GPT to select it automatically. Existing models are preserved.

This integrates a third-party model without modifying its weights or adding a safeguard-bypass prompt. Responses are not guaranteed. Model selection and builds are tested; a full Windows model download and real 9B inference remain unverified here.
