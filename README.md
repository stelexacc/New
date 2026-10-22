# STELEX Admin — codegeschützter Download

Dieser Branch baut das separate Admin-Tool als portable EXE. Die Verwaltungsoberfläche und Betreiber-Konfiguration liegen ausschließlich als AES-256-GCM-verschlüsseltes Bündel vor. Der Schlüssel wird lokal aus dem eingegebenen Code mit scrypt abgeleitet. Weder Klartextcode noch Klartextverifier gehören ins Repository oder die Build-Logs.

Der Windows-Test prüft den echten Start bis zur Codesperre und einen falschen Code. Die korrekte Entschlüsselung wird vor dem Upload lokal geprüft; der echte Code wird nicht im CI verwendet. Für gemeinsame Kundenverwaltung ist ein eigener gemeinsamer HTTPS-Server erforderlich. Das Tool wird nicht vom Kunden-Setup installiert.
