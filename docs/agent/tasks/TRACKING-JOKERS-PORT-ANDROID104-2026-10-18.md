# Joker-/Gummi-Kandidat android104, Review R2 — 2026-10-18

Basis `25dd497c188d1eddeb566ef6989343a4bfe8e085`; isolierter Worktree `anyvo-tracking-jokers-android104`. Kein Commit, Push, Build, OTA oder DB-Eingriff durch diesen Clientauftrag. Originalfreeze `3e7cf655c17e456625daddc902d2ddad5e7a393ce346b6ad74aa5e82f43236d4` unverändert erhalten. Diese Übergabe ersetzt dessen Clientkandidaten; unabhängige Prüfung und Veröffentlichung bei Chat 01.

## Umsetzung

Dübel/Ball sind optionale Joker, Gummi ist ein regulärer Gegenstand. Material-/Markererhalt, kompakte Gegenstandsnummern, Recovery-Identitäten, historische Auswertung, versionierte C1-/Transfer-RPCs und BW/OW/GW-Geometrie. Keine pauschale Lockerung von GPS-/Winkelschwellen; keine nativen, Runtime- oder Dependencyänderungen.

Reviewkorrekturen: Ein separat angezeigter Lauf benötigt eine nichtleere, exakt passende Snapshot-Laufkennung. Alle Snapshot-Objektidentitäten müssen vor Jokerfilterung nichtleer/eindeutig sein, und ihre Indizes müssen die ursprüngliche lückenlose Reihenfolge bestätigen. Sonst bleibt die Fundzahl unbekannt. Keine Änderung gespeicherter Aufnahmen; keine falsche Gleichsetzung von lokalen DB-Marker-IDs mit Snapshot-IDs. 24 Projektionstests decken Bindung, Duplikate, ungültige Indizes, Legacy-Joker, neue kompakte Snapshots und unveränderte Eingaben ab.

Android: ursprünglicher Recorder, Scoring, Recovery-Abschluss, Gap-Sperren und ParentReference erhalten. Kein Native52-Processor und keine fremde Continuity-Semantik übernommen. BW/OW/GW verwenden vorhandene Detektorpuffer/Klassifikation. SQLite-Materialerhalt separat geprüft. Historische Joker-Scores im Anzeigemodell nullable.

## Prüfungen

Breiter Portlauf **vor** den abschließenden Reviewkorrekturen: 248/251 Suites, 2890/2893 Tests PASS. Drei veraltete Testannahmen wurden korrigiert und im Endstand erneut bestanden: Dübel im regulären Snapshot durch Gummi ersetzt plus explizite Joker-Ausschlusstests; unbekannte historische Punktzahl als Gedankenstrich; bereits auf Baseline vorhandenes stopAll(false) im QA-Quelltest. Tracking-Abschlusslogik hierfür unverändert.

Endstand nach Reviewkorrekturen: **14 Suites / 155 Tests PASS**, TypeScript PASS, ESLint 0 Fehler (Warnungen siehe Log), git diff --check PASS. Laufprotokolle in `outputs/tracking-joker-ports-2026-10-18/android104/review-r2/`. Zahlen überschneiden sich und werden nicht addiert. Patch-Anwendung auf exakter Basis plus sämtliche Ergebnis-Hashes verifiziert.

## Offene Releasegates

R4-Serveränderung installiert und strukturell geprüft; Live-HTTP-Abnahme bei Chat 05 noch offen (konkret angefragte zusätzliche QA-Konten und verdeckte Anmeldung). Lokale Tests ersetzen weder diesen Servernachweis noch einen Gerätetest. Direkte OTA-Beauftragung vorhanden, aber keine Joker-OTA veröffentlicht. Chat 01 prüft, integriert und führt den frischen Releasepreflight durch. Neue Quellrefs dürfen nicht stillschweigend auf eine alte Push-Freigabe gestützt werden. Android47/native1.0.5 ist kein vorbereiteter Zielport dieser Übergabe.
