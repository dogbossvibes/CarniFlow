# BW/OW/GW und Abriss — Android 1.0.4 Port

Stand: 2026-10-14. Lokal implementiert/geprüft, uncommitted; Veröffentlichung ausschließlich durch Chat 01.

## Arbeitsplatz und Auftrag

Eigener Worktree `anyvo-tracking-special-angle-android104`, Branch `fix/tracking-special-angle-android104`. Basis und HEAD unverändert `d620222682ade9abc5f2d1ba1408722ba04c2f64` (Android Recovery UI). Der Worktree war vor Änderungen sauber. Kein Schreiben in den Release-Worktree von Chat 01, kein main-Eingriff.

Der geprüfte iOS-Winkelpatch konnte wegen realer Android-104-Unterschiede nicht unverändert angewendet werden. Dieser separate Gesamtpatch portiert nur die Winkeländerungen. Er wird statt des iOS-Winkelpatches auf Android angewendet, zusammen mit den separat gelieferten MAP-DIRECTION-R2- und DISTRACTION-FLOW-R2-Paketen.

## Umsetzung und bewusst erhaltene Android-Pfade

- BW/OW/GW behalten ihren Fachtyp und erhalten links/rechts/spitz links/spitz rechts. Abriss erhält eine ausdrückliche Links-/Rechtswahl. Nicht ausreichend belegte automatische Richtung bleibt unbekannt.
- Auswahl, Markeranzeige einschließlich Aktualisierung bei gleicher Anzahl, analytische Einordnung, eindeutige Zählprojektion, Pending/SQLite/Normalsync und abgeschlossene Track-Recovery entsprechen fachlich dem geprüften iOS-Paket. Originalmarker bleiben erhalten.
- Der Android-Recorder nutzt weiterhin seinen bestehenden Detektorpuffer und `fuseTurns`. Es gibt keinen Import der iOS-Section-/Continuity-/LayResume-Pipeline, kein `loadLayRecovery`, keinen `beginFinalizeLaySession` und keine neue Native-Gap-Unterstützung.
- Neue Marker bewahren `sourceMarkerId`, `recordedAtMs` und Geometriefelder im vorhandenen SQLite-JSON. Bei übergebener expliziter Markerzeit entspricht `created_at` genau dieser Zeit, damit die bestehende Transferprüfung Zeit und Identität überprüfen kann. Der bisherige Fallback für Aufrufer ohne explizite Zeit bleibt erhalten. Bestehende Marker werden nicht repariert/umgeschrieben; Altbestände ohne erforderliche Source-Identität unterliegen weiterhin der bestehenden Transfervalidierung.
- Normalsync ergänzt nur `manualAngleGeometry`, keine iOS-`layContinuity`. Metadaten werden an die bestehende abgeschlossene Session-Recovery angehängt. Unfertige Legeaufnahmen bleiben dort abgelehnt.
- Bestehende Android-Sperren für übergebene Fährten mit Aufzeichnungslücken bleiben erhalten. Neue gerichtete Abrisse bleiben zusätzlich vor einer verlustbehafteten V1-Kontoübergabe gesperrt. Keine V2-Serverinstallation und keine Erweiterung der Android-Gap-Unterstützung.
- 61 Native-/Guard-/Konfigurationsdateien sind gegenüber der Android-Basis bytegleich. Alle bisherigen Android-Gapguard-Zeilen in den betroffenen Screens und Recovery-/Detail-Helfern sind erhalten. Audit: `outputs/SPECIAL-ANGLE-02-ANDROID104-PLATFORM-PRESERVATION-2026-10-14.json`.

## Prüfungen

- Gezielte Android-Prüfung: 5 Suites / 44 Tests PASS. Enthalten sind echte Recorder-Hooks, Background-/Diagnostikfälle, GapSafety, echte SQLite-Metadatenpersistenz und Recovery abgeschlossener Fährten. Neue Finish-Fälle prüfen alle vier Fachtypen, Richtung, bestehende Gegenstände, Summary, Zählung und Markerübergabe.
- Breite betroffene Regression: 55 Suites, davon 54 PASS; 569 Tests PASS, 1 Test mit dem Standardlimit von 5 Sekunden abgebrochen (`TrackResumeCta`, Doppeltippen/Async-Isolation).
- Unveränderte Wiederholung der gesamten betroffenen Recovery-UI-Suite mit 30 Sekunden Timeout plus unveränderter externer Parent-Map-Repro aus Chat 01: 2 Suites / 43 Tests PASS. Kein Produkt- oder Testcode-Fix für den Timeout; Testzahlen überlappen und werden nicht addiert. Kein unqualifizierter Full-Suite-PASS behauptet.
- Gesamter TypeScript-Lauf `--noEmit --incremental` PASS, Buildinfo nur in /private/tmp.
- ESLint gesamter betroffener TS/TSX-Scope: 0 Fehler / 7 Warnungen. Kein unspezifisches Autofix.
- `git diff --check` PASS; rückwärtige Prüfung des eingefrorenen Patches PASS.
- Read-only Apply-Check gegen den tatsächlichen Android-Release-Worktree von Chat 01 auf d620222 mit bereits angewendeten Camera/Flow-R2-Paketen PASS. Dort wurden keine Dateien geschrieben.
- Chat 05: begrenzter unabhängiger Metadaten-/Guardreview PASS; 30 Candidate-Dateihashes vor/nach Tests identisch, 3 Suites / 16 Tests PASS. Vier gemeinsame Transfer-/Geometriequellen bytegleich mit dem geprüften iOS-Stand, 61 Guard-/Native-Dateien unabhängig bytegleich geprüft. Bericht: `outputs/SPECIAL-ANGLE-05-ANDROID104-REVIEW-2026-10-14.json`.

Die iOS-Recorder-Testmock-Ergänzung wurde separat als TEST-ONLY-Patch übergeben. Der iOS-Produktfreeze wurde nicht geändert. Android-Mocks bilden denselben erweiterten Store-Vertrag mit der echten Geometriezuordnung ab; keine produktiven optionalen Fallbacks zum Umgehen von Testfehlern.

## Releasegrenzen

Nur JS/TS und vorhandenes SQLite-JSON, keine SQLite-Migration/Cloud-DDL, keine native Änderung, kein Build. Geräte-/Feldprüfung und frischer Live-Cloud-Roundtrip OPEN. Kein Locked-screen-/Hardware-/nativer Karten-PASS aus Mocktests abgeleitet. Keine Änderungen an GPS-Zulassung, Fusion-Schwellen, Distanz oder Background-Ownership.

Chat 01 muss den Android-Port unabhängig nachprüfen, die drei getrennten Pakete auf seiner aktuellen Plattformbasis integrieren und Runtime-/Environment-/Source-/Asset-/Bundle-Preflight/Postflight ausführen. Keine Veröffentlichung durch Chat 02; kein Commit, Push, Merge, OTA, Store-, Build- oder Live-DB-Schritt.

## MASTER-Vorlage (nicht global gespeichert)

2026-10-14 · Android104 Winkelport · lokal geprüft/eingefroren auf d620222 · Richtungen/Marker/Sync/Recovery platformgerecht, Native-/Gapguards erhalten · gezielt5/44 PASS; breit569PASS/1Timeout, unveränderter Nachlauf2/43 PASS; TSC PASS, Lint0/7, diff/apply PASS,05 scoped3/16 PASS · an01 für Integration/OTA · Geräte-/Cloud-QA und V2-Abrissübergabe OPEN.
