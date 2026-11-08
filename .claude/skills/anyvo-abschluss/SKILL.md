---
name: anyvo-abschluss
description: Prüft und dokumentiert den Abschluss einer ANYVO-Änderung mit Diff, Typecheck, Lint, relevanten Tests und offenen Geräteprüfungen. Führt keine Releases aus.
---

# ANYVO Abschlussprüfung

Prüfe den Abschluss gegen den tatsächlichen Auftrag und seine Akzeptanzkriterien.
Die Ausführung dieses Skills ist keine Commit-, Build- oder Release-Freigabe.

## Änderungen zuordnen
Prüfe Git-Root, Branch, HEAD und Status einschließlich unversionierter Dateien.
Unterscheide die Änderungen des aktuellen Auftrags von vorbestehender Arbeit;
Git-Diff allein beweist keine Urheberschaft. Lies relevante Diffs und neue Dateien.
Prüfe Scope, unbeabsichtigte Verhaltensänderungen, Geheimnisse und Debugreste.
Keine fremden Änderungen formatieren, zurücksetzen oder als eigene ausgeben.

## Checks passend zum Scope
Lies package.json, Lockfile, Testkonfiguration und die aufgerufenen Skripte,
bevor du Befehle startest. Keine fehlenden Werkzeuge automatisch nachinstallieren.
Im geprüften App-Checkout existieren derzeit typecheck, lint und test;
vor Verwendung erneut verifizieren. Bei Codeänderungen passende TypeScript-,
ESLint- und Verhaltens-/Regressionstests ausführen. Jest ohne Watch-Modus nutzen.
Bei reinen Regeln-/Dokumentänderungen Struktur, Syntax und Verweise prüfen;
App-Typecheck und Jest dafür nicht unnötig starten.
Führe git diff --check aus und prüfe neue unversionierte Textdateien ebenfalls
auf Formatfehler, da sie im normalen Diff fehlen können.

Globales preflight/check nicht blind als Qualitätsnachweis verwenden: Skripte
können veraltete Produktannahmen oder nur Warnungen enthalten. Fehlgeschlagene
Checks konkret berichten. Keine Fehler durch any, blanket ignores, skipLibCheck,
Testabschaltungen oder abgesenkte Schwellen kaschieren.
Bei vorbestehenden Fehlern Basis nur soweit sicher vergleichbar prüfen;
sonst Zuordnung offenlassen. Testabbruch/Timeout ist kein bestandener Check.

## Abnahme
Für betroffene Abläufe Erfolg, Fehler, Offline, Resume, Berechtigungen und
Account-/Hundwechsel angemessen prüfen. Bei UI zusätzlich iOS/Android,
Tastatur/Safe Areas, Dark Mode und Accessibility berücksichtigen.
Native, GPS- und Sensoränderungen brauchen passende Geräte-/Feldabnahme.
Nicht verfügbare Prüfungen mit konkretem nächsten Testschritt aufführen.

## Abschlussausgabe
- Ergebnis: was wurde geändert und welches Problem löst es?
- Scope: wesentliche Dateien und Verhalten.
- Checks: exakte Befehle/Verfahren, Ergebnis und Grenzen; nicht gelaufene Tests
  ausdrücklich als nicht ausgeführt kennzeichnen.
- Offene Befunde: Priorität, Auswirkung und nötige Abnahme.
- Git/Release: lokale Änderung, Commit, Push, OTA, nativen Build und Store-Release
  getrennt und ausschließlich entsprechend tatsächlich ausgeführter Aktionen nennen.
Bei größerer Arbeit vorhandenen Aufgabenreport passend aktualisieren; keine
historischen Gesamtstände pauschal überschreiben. Danach keine automatische
Veröffentlichung oder weiteren Aktionen außerhalb des Auftrags ausführen.
