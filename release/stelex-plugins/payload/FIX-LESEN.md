# DeepSeek fehlt in der Modellauswahl – Reparatur

1. Stelex GPT und Stelex Admin vollständig schließen.
2. Reparatur-ZIP vollständig entpacken.
3. **DeepSeek-Reparieren.bat** starten.
4. Warten, bis der bisherige Hintergrunddienst beendet ist (gegebenenfalls bis 75 Sekunden).
5. DeepSeek wird gezielt über Ollama heruntergeladen und mit einer echten Antwort geprüft. Der Download beträgt etwa 5 GB und kann dauern.
6. Danach startet Stelex mit fünf Modellen neu. DeepSeek auswählen.

Die Reparatur installiert die Programmdatei-Ergänzungen erneut, schreibt DeepSeek in beide Modellkataloge und berücksichtigt auch alte Dienst-Startkonfigurationen. Sie löscht keine Chats oder Modelle. Bei einem Fehler wird keine erfolgreiche Modellinstallation behauptet; die Fehlermeldung bleibt sichtbar.

Die vorherige ZIP enthielt die ursprüngliche Setup-EXE, deren Direktstart die nachgelagerten Ergänzungen nicht ausführte. Der separate neue **STELEX-GPT-Setup-1.8.1-DeepSeek-Fix.exe** bündelt nun auch diese Ergänzungen; er kann für eine vollständige Neuinstallation oder Aktualisierung direkt gestartet werden. Ein alter Hintergrunddienst wird vor Dateiänderungen abgewartet.

Eintrag: DeepSeek R1 Abliterated · 8B
Ollama-Quelle: huihui_ai/deepseek-r1-abliterated:8b
Lokaler Alias: stelex-deepseek-r1-abliterated:8b
Die Modellgewichte sind nicht in der Reparatur-ZIP enthalten und werden bei der Ausführung heruntergeladen.

Prüfung: 23 automatisierte Tests bestanden, darunter die Auslieferung des fünften Modells in Desktopkatalog und Dienst-API bei veralteter Startkonfiguration. PowerShell-Syntax und Dateianwendung unter Linux geprüft. Kein vollständiger Windows-End-to-End-Test. Der neue EXE-Wrapper wird unter GitHub Actions gebaut und sein eingebetteter Inhalt vor Veröffentlichung geprüft.
