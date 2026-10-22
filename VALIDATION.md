# Prüfstand 1.4.0

63 automatisierte Prüfungen bestanden lokal, einschließlich nativer Ollama-Streaming-Simulation, 60 typischer Anfragen über eine simulierte Stunde mit Chatverlauf, Rückerstattung bei Fehlern, Start ohne Kaufguthaben, Erhalt gekaufter Credits bei Geschenk-Korrektur, Code-Einlösung im gemeinsamen App/Admin-Dienst, Einmaligkeit, verschlüsselter Admin-Sperre und Windows-Dateipfadnormalisierung.

Zusätzlich: vorhandene Browser-Prüfungen für Anmeldung, Kontingente, Code-Einlösung, Dateianhänge und Einstellungen; eigener Chromium-Test für echte Statuswechsel aus einem simulierten Provider-Datenstrom, Laufzeitanzeige und Antwortvorschau ohne interne Gedankengänge. Die Oberfläche verwendet weiterhin das vorhandene Design.

Die Release-Pipeline wiederholt Regressionstests und Browserprüfungen, baut die portable ZIP und das NSIS-Setup und startet beide Kundenvarianten sowie die installierte Admin-Sperre auf echtem Windows. Erst danach wird der Release veröffentlicht. Die richtige Entschlüsselung wird lokal geprüft; der private Code wird nicht im CI verwendet. GitHub prüft keinen echten lokalen 9B-Modellbetrieb; Setup-Ollama.ps1 prüft ihn auf dem Ziel-PC. Windows-Pakete sind unsigniert.
