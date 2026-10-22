<!-- stelex-customer-release:1.4.0 -->
# STELEX GPT 1.4.0 – App + geschütztes Admin-Tool

ZIP vollständig entpacken, alte Stelex-Fenster schließen, **Install.bat** starten. Die enthaltene **Stelex-GPT-Setup-1.4.0.exe** installiert App und Admin mit Logo und eigenen Verknüpfungen. Install.bat richtet zusätzlich Ollama und das Modell ein. Danach Stelex GPT oder Stelex Admin starten. Den bereits vereinbarten privaten Admin-Code verwenden; er steht nicht in diesem Download.

## Neu

- Kein automatisches 500-Credit-Startgeschenk. Neue Konten starten mit 0 Kauf-Credits und erneuerbarem Free-Kontingent. Auf diesem lokalen Desktop werden nur nachweislich unverbrauchte alte 500er-Willkommensgeschenke zurückgenommen; Kaufguthaben bleibt erhalten.
- Deutlich mehr enthaltenes Kontingent: Free 6.000 / 36.000, Starter 30.000 / 150.000, Pro 90.000 / 500.000, Max 225.000 / 1.400.000 Verbrauchseinheiten pro 5 Stunden / Woche. Oberfläche zeigt Prozent und Rücksetzzeit. 1 Einheit entspricht 100 tatsächlich gemessenen, modellgewichteten Eingabe- und Ausgabetokens. Eine normale Stunde Arbeit mit 60 modellierten Anfragen und Chatverlauf wird automatisiert geprüft; lange Eingaben und große Dateien können mehr verbrauchen. Eine feste Nutzungsdauer ist nicht garantiert.
- Starter 7,99 €, Pro 14,99 €, Max 29,99 € für jeweils 30 Tage; manuelle Code-Aktivierung, keine automatische Zahlungsabwicklung. Zusatz-Credits ab 5 €; Preise, Pakete, Kontingente, Zeitfenster und kostenlose Pro-Tage im Admin editierbar. Bereits angepasste Kontingente bleiben bestehen.
- App und Admin verwenden auf demselben Windows-Konto denselben lokalen Dienst und dieselbe Kundendatenbank. Der Dienst bleibt bei geschlossener App aktiv, solange Admin ihn braucht. Ungenutzte alte lokale Admin-Codes werden einmalig übernommen; bereits eingelöste werden nicht reaktiviert.
- Native Ollama-Schnittstelle mit Antwort-Streaming, schnellem Modus ohne vorgeschaltete interne Denkausgabe, 15 Minuten Modellvorhaltung und bis zu 10 Minuten für langsamen Kaltstart. Free-Kontext wird begrenzt; keine künstliche Verzögerung.
- Live-Status und Laufzeit für Warteschlange, Modellladen, Verarbeitung und Antwortausgabe. Bereits erzeugter Antworttext erscheint während der Verarbeitung. Interne Gedankengänge werden nicht angezeigt.
- Fehlendes Modell, Zeitüberschreitung, fehlender Antworttext und Ollama-Fehler erhalten eigene Meldungen. Fehlgeschlagene Anfragen geben reserviertes Kontingent und Credits zurück.
- Bestehendes rot-schwarzes Design, Anmeldung, Chat-Anweisungen, Dateianhänge, Bildunterstützung nach Modellfähigkeit und Ausgabeordner bleiben erhalten.

## Modell und Betrieb

Standard: `qwen3.5-abliterated:9b`, installiert aus `huihui_ai/qwen3.5-abliterated:9b` über Ollama. Modell muss auf deinem PC ausführbar sein; RAM/VRAM und GPU bestimmen die Geschwindigkeit. Es wird kein anderes Modell heimlich eingesetzt. Der Installer prüft eine echte native Modellantwort. Bei fehlendem Modell wird im normalen Desktopbetrieb kein Demo-Erfolg vorgetäuscht.

**Codes auf anderen PCs:** Alle Kunden und Admin müssen denselben betriebenen HTTPS-Stelex-Server verwenden. Ein nur lokaler Dienst kann Codes nicht zwischen unabhängigen PCs synchronisieren. Einstellungen → Serververbindung. Dieses Paket stellt keinen öffentlichen Kundenserver bereit.

**Admin-Schutz:** Die privaten Admin-Dateien und der Zugangscode-Prüfer sind im öffentlichen Paket verschlüsselt. Erst nach Eingabe des richtigen Codes werden sie in deinem persönlichen AppData-Ordner entschlüsselt. Windows-Konto und PC müssen geschützt bleiben. Das Paket enthält keinen Klartext-Zugangscode. Das Admin-Tool protokolliert Konto-/Kauf-/Code-Vorgänge, keine Fragen in den Verwaltungslogs.

## Download prüfen

SHA-256-Dateien liegen bei. Der Windows-Installer ist nicht mit einem kommerziellen Herausgeberzertifikat signiert; Windows kann daher eine Herausgebermeldung anzeigen. Die GitHub-Veröffentlichung erfolgt erst nach Backend-/Browserprüfungen und echtem Start des portablen und installierten Programms sowie Prüfung der Admin-Sperre auf Windows. Der lokale 9B-Modellbetrieb auf deiner konkreten Hardware kann nicht durch GitHub geprobt werden.
