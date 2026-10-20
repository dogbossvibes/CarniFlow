# Joker-/Gummi-Kandidat ios105, Review R2 — 2026-10-18

Basis `9224483d7156cbc116ccb75aeff0c1dc582e5e53`; isolierter Worktree `anyvo-tracking-jokers-ios105`. Kein Commit, Push, Build, OTA oder DB-Eingriff durch diesen Clientauftrag. Originalfreeze `3e7cf655c17e456625daddc902d2ddad5e7a393ce346b6ad74aa5e82f43236d4` unverändert erhalten. Diese Übergabe ersetzt dessen Clientkandidaten; unabhängige Prüfung und Veröffentlichung bei Chat 01.

## Umsetzung

Dübel/Ball sind optionale Joker, Gummi ist ein regulärer Gegenstand. Material-/Markererhalt, kompakte Gegenstandsnummern, Recovery-Identitäten, historische Auswertung, versionierte C1-/Transfer-RPCs und BW/OW/GW-Geometrie. Keine pauschale Lockerung von GPS-/Winkelschwellen; keine nativen, Runtime- oder Dependencyänderungen.

Reviewkorrekturen: Ein separat angezeigter Lauf benötigt eine nichtleere, exakt passende Snapshot-Laufkennung. Alle Snapshot-Objektidentitäten müssen vor Jokerfilterung nichtleer/eindeutig sein, und ihre Indizes müssen die ursprüngliche lückenlose Reihenfolge bestätigen. Sonst bleibt die Fundzahl unbekannt. Keine Änderung gespeicherter Aufnahmen; keine falsche Gleichsetzung von lokalen DB-Marker-IDs mit Snapshot-IDs. 24 Projektionstests decken Bindung, Duplikate, ungültige Indizes, Legacy-Joker, neue kompakte Snapshots und unveränderte Eingaben ab.

iOS: Originale Material-/Winkel-Erweiterung auf dem exakten veröffentlichten R2-Zielstand, ergänzt um die beiden unabhängigen Reviewkorrekturen.

## Prüfungen

Breiter Portlauf **vor** den abschließenden Reviewkorrekturen: 253/253 Suites, 3046/3046 Tests PASS.

Endstand nach Reviewkorrekturen: **14 Suites / 165 Tests PASS**, TypeScript PASS, ESLint 0 Fehler (Warnungen siehe Log), git diff --check PASS. Laufprotokolle in `outputs/tracking-joker-ports-2026-10-18/ios105/review-r2/`. Zahlen überschneiden sich und werden nicht addiert. Patch-Anwendung auf exakter Basis plus sämtliche Ergebnis-Hashes verifiziert.

## Offene Releasegates

R4-Serveränderung installiert und strukturell geprüft; Live-HTTP-Abnahme bei Chat 05 noch offen (konkret angefragte zusätzliche QA-Konten und verdeckte Anmeldung). Lokale Tests ersetzen weder diesen Servernachweis noch einen Gerätetest. Direkte OTA-Beauftragung vorhanden, aber keine Joker-OTA veröffentlicht. Chat 01 prüft, integriert und führt den frischen Releasepreflight durch. Neue Quellrefs dürfen nicht stillschweigend auf eine alte Push-Freigabe gestützt werden. Android47/native1.0.5 ist kein vorbereiteter Zielport dieser Übergabe.
