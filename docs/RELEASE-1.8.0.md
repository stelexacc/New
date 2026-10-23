# STELEX GPT 1.8.0

Projektordner lassen sich in das Eingabefeld ziehen oder über „Projektordner hinzufügen“ auswählen. Eingelesen wird ein Snapshot von bis zu 200 unterstützten Quellcode-Dateien und 90 KB Inhalt; Abhängigkeiten, Build-Ordner und typische geheime Dateien werden ausgelassen. Der Snapshot enthält relative Pfade. Spätere Änderungen am Originalordner werden erst nach erneutem Import sichtbar.

KI-Code wird als echte Datei im gewählten Ausgabeordner gespeichert. Vorhandene Dateien bleiben erhalten; neue Versionen bekommen eine Nummer. Für Windows-EXE bitte den Python-Builder im Setup auswählen. Die EXE wird mit PyInstaller aus vollständigem Python-Code gebaut. Fehlende Abhängigkeiten und Buildfehler erscheinen im Build-Log. Nicht jede Bibliothek oder jeder Dateityp lässt sich automatisch bauen.

„Angemeldet bleiben“ setzt ein persistentes, geschütztes 30-Tage-Cookie. Ohne Häkchen gilt ein Sitzungscookie; Browser-Sitzungswiederherstellung kann dieses wiederherstellen. Abmelden widerruft die Sitzung.

Deinstall.bat startet den Windows-Uninstaller. Eigene Projekte, lokale Kontodaten und Ollama-Modelle werden nicht automatisch gelöscht.

Das Admin-Tool ist separat geschützt und bleibt vollständig von der Website ausgeschlossen.
