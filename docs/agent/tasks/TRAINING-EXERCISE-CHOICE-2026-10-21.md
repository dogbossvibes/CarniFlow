# Einheitliche Übungsauswahl – 07 – 2026-10-21

## Auftrag und Ausgangslage

Nutzer meldet mehrfaches „Revieren“ samt automatisch sichtbaren Speichern-Feldern im Dokumentationsformular und beauftragt die Korrektur. Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-journal-all-disciplines`, Branch `fix/journal-all-disciplines`, Basis `cebf579a7fa4382e97b8ed50651c7d69320d143d`. Anfangs sauber; temporärer eigener node_modules-Link nur für Prüfungen.

## Ursache und Änderung

Das Formular zeigte Registry und Vorlagen getrennt. Vorlagen erzeugten beim erneuten Auswählen jeweils neue Identitäten. „Mehr anzeigen“ öffnete zusätzlich alle Umbenennungsfelder. Die neue gemeinsame Auswahl gruppiert gleichnamige Einträge ausschließlich für die Darstellung. Bei mehreren gespeicherten Identitäten wählt der Nutzer eine konkrete Variante; Identitäten werden weder gelöscht noch zusammengeführt. Verfügbare aktuelle Hundehistorie liefert Datum und Übungsnotiz als Kontext. Ein einzelner gespeicherter Eintrag wird bei Auswahl wiederverwendet. Vorlagen ohne Registry-Eintrag behalten das bestehende Neuanlegen. Explizites Erstellen eigener Übungen bleibt verfügbar.

Umbenennen ist eine separate Aktion mit einem Editor, idempotentem Retry und synchronem Doppeltipp-Schutz. Fehler erhalten den Text. Während des Registry-Ladens oder nach Lesefehlern bleibt die automatische Vorlagenauswahl gesperrt; Retry ist verfügbar. Account-/Spartenwechsel blenden alte Registry/Editor-Daten sofort aus und ignorieren verspätete Antworten. Archivierte/fremde Einträge werden nicht angeboten. Bestehende Trainings-/Notiz-/Bewertungsdaten und geplante/trainierte Semantik bleiben erhalten. Keine Schema- oder DB-Änderung.

## Selbst ausgeführte Prüfungen

- Vorher: sechs neue Interaktionstests scheitern gegen die alte Oberfläche.
- Abschließend: 17 Suites / 246 Tests PASS, inklusive UI, Speichern bestehender Identität ohne neuen Registry-Insert, Accountwechsel, Netzwerkfehler/Retry, Journal, Historie und i18n.
- TypeScript `--noEmit`: Exit 0.
- ESLint für alle zehn geänderten/neuen Code-/Test-/Sprachdateien: Exit 0, keine Warnungen.
- `git diff --check`: PASS.
- Zwischenlauf: zwei bestehende Custom-Sheet-Tests scheiterten bei gesperrtem explizitem Hinzufügen während Registry-Laden; explizites Hinzufügen davon entkoppelt und Tests anschließend PASS. Ein neuer History-Test verwendete zunächst zyklische React-Serialisierung; Test auf sichtbare Texte korrigiert und vollständiger Lauf anschließend PASS. Kein Produktfehler im letzten Lauf.

Evidenz: `outputs/training-exercise-choice-07-2026-10-21/verification.json` im übergeordneten Projektordner, einschließlich Quellhashes und gesicherter Testlogs.

## Auslieferungsgrenze

Gerätetests zurückgestellt. Diese neue Korrektur ist nicht als OTA veröffentlicht. Der bestehende FINAL-FREEZE-V2 und die vorherigen Veröffentlichungsnachweise wurden nicht verändert. Keine Migration, keine Kundendatenkorrektur, kein Build, Merge oder Store-Release.
