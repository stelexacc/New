<!-- stelex-customer-release:1.5.0 -->
# STELEX GPT 1.5.0 – lokal, Offline-Codes und automatische Dateien

## Installation

ZIP vollständig entpacken. Alte Stelex-GPT- und Admin-Fenster schließen. **Install.bat** starten: Es installiert das enthaltene gebrandete Setup, richtet Python 3.13 mit PyInstaller 6.16.0 ein und installiert/prüft Ollama samt Modell. Internet wird für diese Downloads benötigt. Danach **Stelex GPT** oder **Stelex Admin** über die neuen Verknüpfungen starten. Einmal den Ausgabeordner wählen.

Enthalten: Install.bat, Stelex-GPT-Setup-1.5.0.exe, zusätzlich die einzeln startbare **Stelex-Admin-Portable-1.5.0.exe**, Prüfsummen und diese Anleitung. Das Setup installiert App und geschütztes Admin-Tool gemeinsam. Die Admin-EXE allein immer aus dem Paket verwenden, nicht die interne Electron-EXE aus einem anderen Verzeichnis kopieren. Den bereits vereinbarten privaten Zugangscode verwenden; er steht nicht im Download.

## Codes auf anderen PCs – ohne öffentlichen Server

Im neuen Admin neue **STXO1.**-Codes erstellen und vollständig kopieren. Im Kundenprogramm unter „Tarife & Credits“ einfügen. Credits und Starter/Pro/Max für die eingestellten Tage werden mit einer Ed25519-Signatur lokal geprüft. Zum Beispiel kann ein Pro-Tarif-Code 30 kostenlose Pro-Tage freischalten. Dein PC muss bei der Einlösung nicht laufen. Es wird kein Hosting-Konto, keine Domain und kein öffentlicher HTTP-/HTTPS-Server benötigt. Die App startet weiterhin ihren internen lokalen Dienst automatisch; dafür ist keine Servereinrichtung nötig.

**Offline-Grenze:** Jeder Code ist nur einmal pro lokaler Datenbank einlösbar. Auf getrennten PCs lässt sich dieselbe Kopie ohne Verbindung nicht zentral sperren. Auch Neuinstallation mit gelöschten Daten/Backups, eine globale Sperrung, gemeinsame Kaufprotokolle und eine verbindliche gemeinsame Kontenliste sind offline nicht zuverlässig kontrollierbar. Der Admin sieht seine ausgestellten Codes und lokale Vorgänge, nicht die Einlösungen auf unabhängigen Kunden-PCs. Für verbindlich weltweit einmalige Codes wäre eine Online-Datenbank nötig.

Alte STX-Codes sind lokale Datenbank-Codes. Sie werden nicht automatisch zu übertragbaren Offline-Codes: Für andere PCs neue STXO1-Codes erzeugen. Groß-/Kleinschreibung des neuen Codes beibehalten. Den privaten Admin-Code und das private Signiermaterial niemals an Kunden weitergeben. Das enthaltene Admin-Tool bleibt durch den vereinbarten Code verschlüsselt geschützt.

## Dateien und echte EXEs

In der Windows-App werden vollständige Codeblöcke einer neuen Antwort automatisch im ausgewählten Ordner gespeichert. Die KI erhält bei Datei-Aufträgen einen kurzen Format-Hinweis für vollständige Dateien mit Namen. Wenn noch kein Ordner gewählt wurde, erscheint die Ordnerauswahl. Bestehende Dateien werden nicht überschrieben; neue Namen erhalten bei Bedarf eine Nummer. Eine wiederholte Übertragung derselben Anfrage erzeugt keine zweite Dateikopie.

Beispiel: „Erstelle eine Datei hallo.py, die Hallo ausgibt.“ Die tatsächliche .py-Datei wird gespeichert. „Erstelle daraus hallo.exe“ fordert vollständigen Python-Code an und startet danach einen echten lokalen PyInstaller-Build. Quellcode, fertige EXE und Build-Protokoll landen im gewählten Ordner. Die erzeugte EXE wird nicht automatisch gestartet. Bei einem Buildfehler bleiben Quellcode und echtes Fehlerprotokoll erhalten; es wird keine Textdatei als EXE ausgegeben.

Die KI muss vollständigen Code liefern. Eine EXE wird nicht aus jeder beliebigen Antwort oder Programmiersprache automatisch möglich. Externe Python-Bibliotheken, Daten-Dateien, native Bibliotheken und komplexe Projekte können zusätzliche Build-Konfiguration erfordern. Fehlende Abhängigkeiten stehen im Protokoll; sie werden nicht blind aus Modelltext installiert. Die mitgelieferte Basis unterstützt Python-Programme mit Standardbibliothek und bereits in der Builder-Umgebung vorhandenen Paketen. Der erste Build kann länger dauern.

## Anzeige und Modell

Sekunden zählen während Modellverarbeitung, Speichern und Build hoch. Danach bleibt „Fertig · … s“ an der Antwort stehen; die Dauer wird mit dem lokalen Chat gespeichert. Live-Text und Markdown-Überschriften bleiben im kleinen Chat-Stil. Bestehendes rot-schwarzes Design, Kontingente, Tarife, Anhänge, Anweisungseditor und Ausgabeordner bleiben erhalten.

Standardmodell unverändert: **qwen3.5-abliterated:9b**, installiert aus **huihui_ai/qwen3.5-abliterated:9b** über Ollama. Kein GPU-Server wird gebucht. Jeder PC braucht geeignete Hardware und sein lokal installiertes Modell. Kein pauschales 500-Credit-Startgeschenk; Free erhält erneuerbares Kontingent. Eine bestimmte Rechengeschwindigkeit oder Antwortqualität kann nicht garantiert werden.

## Prüfung und Betrieb

Die Veröffentlichung erfolgt erst nach automatisierten Backend-/Dateisystemtests, Browserprüfungen und echtem Windows-Start von App, Setup und Admin. Zusätzlich wird auf Windows mit der installierten Builder-Komponente eine harmlose Python-Datei gespeichert, eine echte EXE gebaut und nur diese Test-EXE gezielt ausgeführt. Der private Produktionscode oder private Signierschlüssel werden nicht im GitHub-CI entschlüsselt.

SHA-256-Manifeste liegen bei. Die Windows-Pakete sind nicht mit einem kommerziellen Herausgeberzertifikat signiert. AppData und der gewählte Ausgabeordner enthalten deine lokalen Daten; sichere sie bei Bedarf. Ein vollständiger modell- und hardwareabhängiger Betrieb auf deinem PC muss dort geprüft werden.
