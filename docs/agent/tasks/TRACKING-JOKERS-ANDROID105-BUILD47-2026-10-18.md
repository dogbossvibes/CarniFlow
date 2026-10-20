# Joker/Gummi — Android 1.0.5 Build 47 — 2026-10-18

## Auftrag und Basis

Durch Chat01 weitergegebener Nutzerauftrag zur Ergänzung des Build47-Pakets. Eigener Worktree `anyvo-tracking-jokers-android105-build47`, Branch `feat/tracking-jokers-android105-build47`, HEAD `39964e1f073e34783fa80d7603b12c0591688826`. Keine Writer-Kollision: Sharing/Hilfe integriert Chat01 separat. Kein Commit, Push, Merge, DB-Eingriff, OTA oder Build durch diesen Auftrag.

## Umsetzung und Bestandsschutz

Der von Chat01 unabhängig abgenommene Android104-R3-Kandidat (`460bc93b7c8998a1e1bcd1ab72aacbcd2d5cc086dce381911a9e5f9f56cb31ad`) wurde auf den exakten Build47-Quellstand portiert. Dieser ist Nachfahre von25dd. Alle80Vorher-/Nachher-Dateihashes passen exakt, keine Produktkonflikte oder zusätzlichen semantischen Anpassungen. Enthalten sind optionale Dübel/Ball-Joker, reguläres Gummi, korrekte Gegenstandsnummern und Wertung, historische Snapshot-Schutzkorrekturen, Materialerhalt/Recovery/Transfer sowie Ausschluss von Jokern aus Such-Voice und Haptik. Bestehende R3-Winkel-/Darstellungskorrekturen unverändert mitgeführt.

Alle47Build47-Zusatzdateien bleiben bytegleich zu39964e1: DailyWidget einschließlich Androidmodule, Appkonfiguration/Layout, Paket-/Postinstall-Quellstamp, Dienste und zugehörige Tests. Keine Native-/Runtime-/Dependency-/TaskManager-Konfiguration verändert. Keine fremden Recorder-, Gap- oder Recoverypfade übernommen. Keine Lockerung von GPS-/Winkelschwellen.

## Prüfung

Gezielt **37 Suites / 432 Tests PASS**, TypeScript PASS, ESLint0Fehler (Warnungen imLog), diff-checkPASS. Umfang: Material/Joker/Snapshot, Such-Guidance und Aktivierung/Recovery, Recorder-Start/Winkel, SQLite, Transfer/Gap/ParentReference, Analyse/Export, Widget und Build-SourceCommit-Vertrag. JSON/Logs unter `outputs/tracking-joker-android105-build47-2026-10-18/`. Alle Tests laufen aus diesem Worktree; keine neue Geräte-/Audio-/Native-Abnahme behauptet. Neue unabhängige Prüfung des Ports beiChat01 erforderlich; alteR3-Prüfungen sind ergänzende Evidenz.

Vollpatch gegen39964e1 auf Ausgangsdateien angewendet und sämtliche Resultathashes verifiziert. Historische Berichte des Android104-R3-Pakets bleiben erhalten; dieser Bericht beschreibt das zusätzliche Build47-Ziel.

## Veröffentlichung

Keine Veröffentlichung erfolgt. R4-Live-HTTP-Abnahme beiChat05 bleibt eigenes Gate, danach unabhängiger Port-/Gesamtpaketreview und frischer Runtime-/EAS-/Environment-/Quellstand-Preflight beiChat01. Hilfe/Sharing gehören nicht zu diesem Port. Android1.0.5Build47 ist damit vorbereitet, nicht automatisch bereits für Nutzer aktiv.
