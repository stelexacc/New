# STELEX GPT 1.8.1 – Installationsreparatur

Behebt den Python-Installationsfehler bei alten oder fehlenden winget-Versionen. Der nicht überall unterstützte Parameter --disable-interactivity entfällt. Ein funktionierendes 64-Bit-Python 3.10 bis 3.13 wird wiederverwendet. Python 3.14/3.15 wird nicht als Builder verwendet; bei Bedarf wird ein separates Python 3.13.17 von python.org mit gültiger Herausgebersignatur installiert. Andere Python-Installationen und PATH werden dabei nicht verändert.

Auch bei fehlgeschlagener Ollama-Installation durch winget wird der offizielle signaturgeprüfte Installer verwendet. Downloads erhalten Wiederholungen; Python-Setup-Protokolle liegen unter %APPDATA%\Stelex GPT\logs.

ZIP vollständig entpacken, Stelex schließen und Install.bat ausführen. Gewünschte KI-Modelle und für EXE-Erstellung den Python-Builder auswählen. Vorhandene Ollama-Modelle werden wiederverwendet. Alle vier Modelloptionen, Ordnerimport, Anmelde-Checkbox und Deinstall.bat bleiben erhalten.

Unterstützt: Windows 10/11 x64. Verfügbarkeit und Geschwindigkeit der Modelle hängen von Modellquelle, freiem Speicher und Hardware ab. Keine Garantie für beliebige Windows-, Python- oder Modellversionen.
