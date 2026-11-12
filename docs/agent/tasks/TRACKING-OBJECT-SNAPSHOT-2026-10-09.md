# Gegenstands-Aufzeichnungsgrundlage – isolierter OTA-Baustein

Stand 09.10.2026, Chat 02. Auf dem veröffentlichten iOS-Stand 87d5e2b3b3ed931b655464eec971b95225dcf0ff vorbereitet. Eigener Worktree anyvo-tracking-object-review-v1, Branch feat/tracking-object-review-v1. Noch uncommitted/unveröffentlicht. Der ältere Freeze vom 08.10. im separaten Worktree bleibt unverändert.

## Zweck und Scope

Neue vollständige Suchabschlüsse bewahren die bestehenden Referenz-IDs/Indizes, ursprünglichen Gegenstandszustände, optionales Material (einschließlich Dübel) und die exakten ungerundeten Bestandteile des bestehenden Scores in `run.object_snapshot` Version 1. Die Aufnahme-/GPS-/Winkel-/End-/Recovery-Logik und Scoreformel bleiben unverändert. Keine nachträgliche Änderung vorhandener Aufnahmen. Fehlende oder widersprüchliche Identitäten/Zustände erzeugen keinen erfundenen Snapshot; der Recovery-Kurzabschluss bleibt unverändert.

Die unveränderlichen Originaldaten sind Voraussetzung für spätere nachvollziehbare menschliche Korrekturen. Dieser OTA-Baustein enthält **keine Korrektur-UI, keine neue SQLite-Migration, keine neue Sync-Outbox, keinen RPC und keine Live-DB-Abhängigkeit**. Die bestehende JSON-Persistenz/Cloudübertragung erhält das additive Feld bereits. Es ist keine vollständige Gegenstandskorrektur.

Enthaltene Produktdateien ausschließlich:
- app/track/run.tsx
- features/tracking/hooks/useSearchRecorder.ts
- features/tracking/utils/localTrackRun.ts
- features/tracking/utils/trackObjectReview.ts

Dazu vier Testdateien und dieser Bericht (Dateiliste/Hashes im separaten Manifest).

## Verifikation

- 7 gezielte Suites / **87 Tests PASS** auf 87d5-Basis einschließlich bestehender FN-/Motion-QA-Regressionen.
- Recorder-Scoreparität, IDs/Material/Zustände, JSON-Roundtrip, ursprüngliche Geometrie/Lücken/Sensoranalyse/manuelle Bewertung, Recovery-Abschluss und Replay geprüft.
- Vollständiges TypeScript PASS. ESLint 0 Fehler, vier bestehende Warnungen. diff-check und Reverse-Apply des isolierten Patches PASS.
- Kein Geräte-/Feld-/Live-Supabase-Schreibtest daraus ableiten.

## Integration / Veröffentlichung

01 ist einziger OTA-Publisher. Nutzer hat im MASTER am 09.10. fortlaufend beauftragte OTAs ausdrücklich freigegeben; notwendige isolierte Release-Commits nach bestehender Regel. Vor Veröffentlichung aktuelles plattform-/runtimebezogenes Live-HEAD, Ancestry, Production-Environment und Native-Kompatibilität frisch prüfen, unabhängiges Review sowie Tests im tatsächlichen zusammengesetzten Release durchführen. Unterschiedliche Android-/iOS-Basen nicht blind vereinigen. Gültige Null-Gegenstand-Referenzen und die bereits veröffentlichten FN-/Motion-Fixes erhalten.

Die parallel im selben Worktree erarbeitete vollständige Korrektur-UI/Outbox ist NICHT Bestandteil dieses Patches. Sie darf erst mit kompatibel bereitgestelltem, gesondert freigegebenem Audit-Backend ausgeliefert werden. Keine SQL-/DB-/Build-/Store-Freigabe aus dieser Übergabe ableiten. Kein Commit/Push/Merge/OTA/Build/DB-Eingriff durch Chat 02.
