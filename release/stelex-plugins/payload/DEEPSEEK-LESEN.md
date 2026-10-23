# STELEX GPT 1.8.1 – optionale DeepSeek-Ergänzung

Die ZIP vollständig entpacken, Stelex schließen und **Install.bat** starten.
In der vorhandenen Modellauswahl ist zusätzlich **DeepSeek R1 Abliterated · 8B** verfügbar (nicht vorausgewählt, Download ca. 5 GB).

Quelle: `huihui_ai/deepseek-r1-abliterated:8b` über Ollama.
Lokaler Modellname: `stelex-deepseek-r1-abliterated:8b`.
Community-Modell auf Basis von DeepSeek R1 Distill Llama 8B; kein offizieller „Jailbreak“-Modus und keine Garantie für bestimmte Antworten. Modellgewichte werden bei Auswahl heruntergeladen, sie sind nicht in der ZIP enthalten. Empfehlenswert sind mindestens 16 GB RAM; Geschwindigkeit und GPU-Nutzung hängen von der Hardware ab.

Die beiden ursprünglichen EXE-Dateien und Deinstall.bat sind unverändert. Der neue Install.bat-Aufruf registriert die zusätzliche Option nach der Basisinstallation und vor der Komponentenauswahl. Direktes Ausführen der ursprünglichen Setup-EXE enthält diese Ergänzung nicht. Bei erneutem Ausführen von Install.bat wird die Ergänzung erneut angewendet.
Die bisherigen vier Modelle, Standardauswahl, Sprachmodul und Python-Builder bleiben erhalten. Die Oberfläche der Komponentenauswahl wird nach unten erweitert. Die Anwendung liest den ergänzten Modellkatalog; das vorhandene Ollama-Setup installiert und prüft das ausgewählte Modell wie bisher.

Prüfstand: PowerShell-Syntax geprüft; Registrierung mit den extrahierten Originaldateien unter PowerShell 7 ausgeführt; Wiederholung ohne Duplikate geprüft; beide Kataloge und die Modell-Verfügbarkeitsanzeige mit dem vorhandenen Node-Modul geprüft; ursprüngliche vier Einträge unverändert. Keine vollständige Windows-Installation oder Modellantwort getestet. Der Zugriff auf ollama.com ist in dieser Cloud-Umgebung gesperrt, daher sind Verfügbarkeit des Modell-Tags und Download noch nicht unabhängig bestätigt. Die vorhandene Einrichtung meldet Downloadfehler und prüft eine echte Antwort nach der Installation.
