# STELEX Admin 1.3.1

Eigenständige portable EXE, ohne Installation. Starten und deinen festgelegten Zugangscode eingeben. Verwaltungsoberfläche und private Zugangskonfiguration sind im Download verschlüsselt und werden erst mit dem richtigen Code lokal entschlüsselt. Das Tool gehört nicht ins Kundenpaket.

Für zentrale Kundenverwaltung einen gemeinsamen eigenen HTTPS-Server verwenden und im Tool verbinden. Lokale Daten liegen getrennt unter `%APPDATA%\Stelex Admin`. Bestehende alte Admin-Installationen gegebenenfalls über Windows deinstallieren.

Die EXE ist unsigniert. Die Veröffentlichung prüft den Windows-Start bis zur Codesperre und die Ablehnung eines falschen Codes. Der echte Zugangscode wird nicht an GitHub Actions übergeben.

<!-- stelex-admin-release:1.3.1 -->
