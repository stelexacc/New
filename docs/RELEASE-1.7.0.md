<!-- stelex-customer-release:1.7.0 -->
# STELEX GPT 1.7.0 – kleinere Installation, GitHub, KI-Prüfer und Website

## Download und Installation

ZIP vollständig entpacken. Alte Stelex-Fenster schließen. **Install.bat** starten oder **Stelex-GPT-Setup-1.7.0.exe** öffnen. Im Setup Modelle und Zusatzkomponenten anhaken. Die Standardauswahl enthält nur **Qwen HauhauCS 9B Q4_K_M**, nicht alle vier Modelle. Mit App und Spracheingabe sind dafür ungefähr **6–7 GB** statt rund 40 GB einzuplanen. Der Python-EXE-Builder ist optional (etwa 0,35 GB). Modellgrößen sind Richtwerte, Downloads und temporäre Dateien benötigen zusätzlich freien Speicher.

Zur Auswahl stehen das bisherige qwen3.5-abliterated:9b (ca. 6,5 GB), Qwen HauhauCS (ca. 5,6 GB), Dolphin 3.0 (ca. 4,9 GB) und Gemma HauhauCS (ca. 5,3 GB). Modellalias und Quelle verwenden dieselben Ollama-Blobs; vorhandene Downloads werden wiederverwendet. Alte Modelle werden nicht automatisch gelöscht. Nicht mehr gewünschte Aliase und Quellen können in Ollama mit `ollama list` geprüft und gezielt mit `ollama rm MODELLNAME` entfernt werden; ein Blob wird erst frei, wenn kein verbleibender Alias ihn mehr braucht.

Später: Startmenü → Komponenten auswählen, danach Modell einrichten; für neue Python-Komponenten `Setup-Selected.ps1` im Installationsordner starten. Die Spracheingabe ist mit rund 0,16 GB gebündelt; ihre Prüfung kann abgewählt werden, die Dateien bleiben im Setup enthalten. Das vorhandene rote/schwarze Design, Konten, Credits, Monatspläne und der geschützte Admin-Bereich bleiben erhalten. Die zusätzliche portable Admin-EXE ist in der ZIP enthalten. Dein privater Admin-Code bleibt gültig.

## GitHub

Einstellungen → Integrationen → GitHub. Einen **Fine-grained Personal Access Token** auf GitHub erstellen und nur gewünschte Repositories freigeben. Lesen benötigt Contents-Leserecht. Entwurfs-PRs benötigen zusätzlich Contents und Pull requests mit Schreibrecht. Keine GitHub-Anmeldung oder Berechtigung wird vorgetäuscht; ohne eigenen gültigen Token sind diese Funktionen nicht verbunden.

Token werden verschlüsselt im lokalen Benutzerprofil gespeichert; der lokale Schlüssel liegt zugriffsbeschränkt daneben. Kein Token steht im KI-Prompt oder im Download. Die Verschlüsselung ersetzt keinen Schutz des Windows-Benutzerkontos. Repositories und Textdateien bis 200 KB laden, ausgewählte Datei bewusst als Chat-Kontext verwenden. Änderungen bearbeiten, PR-Vorschau prüfen und erst dann bestätigen. Stelex erstellt einen neuen Branch und einen **Entwurfs-Pull-Request**; es führt keinen automatischen Merge aus. Ein Vorschau-Auftrag ist kontogebunden, zehn Minuten gültig und einmal bestätigbar.

## Zweite KI als Prüfer

Einstellungen → Integrationen → Prüfermodell wählen und aktivieren. Jede neue Antwort wird danach vor der Ausgabe von diesem Modell geprüft. Beide Aufrufe laufen **nacheinander**. Beim Wechsel wird das vorherige Modell entladen. Für die kleinste Installation dasselbe Modell für Hauptantwort und Prüfer wählen: zwei Durchläufe, kein zusätzlicher Modelldownload. Ein anderes Prüfermodell muss angehakt und installiert sein. Uncensored-Varianten bleiben auswählbar; sie garantieren weder vollständige Fehlererkennung noch jede gewünschte Antwort.

Die Oberfläche zeigt „Zweite KI prüft die Antwort“. Beide tatsächlich gemessenen Verbräuche zählen zum Kontingent. Der Prüfkontext ist begrenzt; sehr lange Eingaben oder Ausgaben werden nur ausschnittsweise geprüft. Das dauert länger als eine einzelne Antwort. Bei Prüferfehlern wird kein ungeprüfter Entwurf als geprüft ausgegeben; die Anfrage wird nicht abgerechnet. Keine internen Gedankengänge werden als echte Gedanken angezeigt.

## Website für Handy und Desktop

**https://stelex-gpt-workspace.citrusacorn1024.chatgpt.site**

Die Seite ist zunächst **privat für dein ChatGPT-Konto**. Danach meldest du dich mit deinem lokalen Stelex-Konto an. Auf der Website „PC verbinden“ wählen und die Verbindungsdatei herunterladen. Am Windows-PC unter Einstellungen → Integrationen importieren, die angezeigten Rechte prüfen und bestätigen. Stelex muss auf diesem Rechner geöffnet bleiben. Es wird kein Router-Port freigegeben. Die App baut die Verbindung ausgehend per HTTPS auf.

Die Website verwendet die gleichen Modelle, Chats, Kontingente, GitHub-Zugriffe und den Prüfer auf deinem verbundenen PC. Spracheingabe benötigt zusätzlich die Mikrofonfreigabe des Browsers und wird auf dem PC erkannt. Für Dateiausgaben zuvor in der Windows-App einen Ausgabeordner wählen. Dateien und Python-EXE-Builds landen dort. Ein Handy führt keine Windows-EXEs aus und kann deinen Desktop-Ordner nicht selbst öffnen.

Die Verbindung darf nach deiner ausdrücklichen Bestätigung auf lokale Stelex-Funktionen zugreifen. Die Verbindungsdatei ist ein Zugangsschlüssel: vertraulich behandeln und nach dem Import sicher entfernen. Die App speichert sie mit Windows-DPAPI. Verbindung in der App beenden oder auf der Website eine neue Verbindungsdatei erstellen, um den alten Zugang zu widerrufen. Neue Paarung widerruft den alten Schlüssel.

Anfragen, Anhänge und Antworten werden über den privaten Website-Dienst weitergeleitet. Aufträge sind höchstens 15 Minuten abrufbar. Normale Antworten werden nach Abruf gelöscht; liegengebliebene Aufträge werden beim nächsten Kontakt des PCs bereinigt. Chat-Verlauf und Konten liegen weiterhin in der lokalen Stelex-Datenbank. Der Website-Dienst ist damit eine zusätzliche Infrastruktur; „lokal“ bedeutet hier, dass die Modellberechnung auf deinem PC stattfindet.

## Grenzen und Prüfung

Offline-Codes bleiben einmal je lokaler Datenbank einlösbar; unabhängige PCs haben ohne gemeinsamen Kontoserver keine weltweite Einlösesperre. Laufende KI-Zugriffe setzen das installierte Modell und ausreichend RAM/VRAM voraus. GitHub benötigt deinen Token, die Website eine aktive Paarung. Die Veröffentlichung prüft Backend, GitHub-Vorschauen, den echten Prüfer-Durchlauf mit Provider-Fixtures, Paarung/Widerruf, mobile und Desktop-Oberflächen sowie Windows-Setup, Admin-Schutz, echte EXE-Erstellung und lokale Spracherkennung. Downloads sind nicht mit einem kommerziellen Windows-Herausgeberzertifikat signiert.
