# Prüfstand Kunden-Release 1.3.1

Die Ausgangsversion bestand 52 automatisierte Tests und 31 Browser-Prüfgruppen, einschließlich privater Betreiberabläufe. Dieser öffentliche Kunden-Branch enthält das Betreiber-Frontend und den privaten Launcher nicht. Seine Pipeline wiederholt die 52 Backend-/Dateisystem-/Authentifizierungstests und Kunden-Browserprüfungen, baut die ZIP und das gebrandete Setup und prüft dann den portablen sowie installierten Windows-Start im Demomodus.

Erst nach diesen Prüfungen wird der Release öffentlich. Es werden keine privaten Hash-Konfigurationen, Tokens, Datenbanken, Testkonten oder Betreiber-EXEs hochgeladen. Vollständige Ollama-Installation und echte Modellinferenz erfolgen auf dem Zielrechner. SMTP und ein zentraler HTTPS-Kundenserver müssen separat eingerichtet werden. Die Windows-Pakete sind unsigniert.
