# Android: Original-Gegenstands-Snapshot, 2026-10-09

Status: Implementiert und lokal geprüft, Source-Freeze für unabhängiges Review durch01.
Kein Commit, Merge, Push, Publish, Build oder DB-Schritt durch02.

## Quelle und Isolation

- Android1.0.4: release/ui-dialog-android104, Basis208bc19329236af23729f007f12c74a0e94688bd.
- Android1.0.3: release/ui-dialog-android103, Basisb4ab8a5c08a185f844aa380e1297857776b14acd.
- Beide Release-Worktrees vor Start sauber. Recorder/run/localTrackRun auf beiden Basen identisch.
- Eigene Arbeitsverzeichnisse sind exakte Git-Archivexporte, ausdrücklich keine Git-Worktrees:
  `anyvo-tracking-android-object-snapshot/{104,103}-candidate` im ChatGPT-Projektspiegel.
  Keine Änderung gemeinsamer Git-Metadaten, keine Änderung fremder Release-WTs.
- Vergleichsexporte `{104,103}-base`: sämtliche1392/1381 Git-Blobs gegen jeweilige Basis geprüft.
  Temporäre alte-Formel-Testfixture im104-Basisexport nach Prüfung exakt wiederhergestellt.
- Dependencies nur über Symlink zur vorhandenen analysis-export/node_modules verwendet; keine Installation.

## Datenfluss und schmaler Adapter

Die Android-Aufzeichnung enthält bereits fünf explizite Objektzustände und stabile Marker-IDs.
Beim normalen Abschluss werden Zustand, ID, Reihenfolge und optional Material jetzt zusätzlich
unter payload_json.run.object_snapshot gespeichert. Der bestehende JSON-Transport erhält
object_snapshot in training_sessions.track_data.run. Keine neue Tabelle/Spalte/RPC.

Die vorhandene Android-Formel wird unverändert berechnet. computeScoreBreakdown liefert neben
dem gleichen gerundeten Ergebnis die schon berechneten ungerundeten Trackpunkte und bisherigen
79/21-Gewichte; der Live-score-Wrapper und stop nutzen dieselbe Formel. Keine neuen Schwellen,
keine Accuracy-aware- oder unobserved-Progress-Logik aus iOS transplantiert.

Erfasste Originalzustände: pending, manual_found, auto_dwell_found, missed, user_removed.
Android erzeugt in dieser Basis kein unobserved; es wird hier nicht erfunden. Pending bleibt
unbekannt, manuell und automatisch gefundene Gegenstände bleiben unterscheidbar. Dübel bleiben
wie bisher im tatsächlichen Gegenstandssatz enthalten. Kein nachträglicher Kundendaten-Backfill.

Nur vollständige, intern konsistente Referenzen mit eindeutigen vorhandenen IDs erhalten einen
Snapshot. Fehlende IDs, inkonsistente Zustands-/Fundzahlen oder frei erfundene Regelwerksobjekte
werden nicht ergänzt. Ungültige/fehlende Bewertungsbasis ergibt null; das vorhandene Run-Ergebnis
bleibt erhalten. Ein alter Recovery-Kurzpfad ohne Recorderdaten bleibt unverändert. Der normale
Abschluss eines wiederaufgenommenen Runs kann seine tatsächlich verfügbaren Zustände speichern.

Der Adapter ist ein Datenbaustein für spätere Korrekturen. Er führt keine Bedienoberfläche,
Änderungshistorie, SQLite7, Outbox, RPC oder Backendmigration ein und gibt keine vollständige
Continuity-/Bewertungsparität zwischen Android und iOS vor.

## Änderungen

Vier Produktdateien:
- features/tracking/utils/trackObjectReview.ts (neuer validierender Snapshot-Builder/Typen)
- features/tracking/hooks/useSearchRecorder.ts (ursprüngliche Scoreanteile additiv liefern)
- features/tracking/utils/localTrackRun.ts (optionale Speicherung)
- app/track/run.tsx (normaler Abschluss verbindet Originaldaten)

Fünf Testdateien: trackObjectReview, localTrackRun, useSearchRecorder.recovery,
createRemoteTrainingSession.rating und run-object-snapshot. Dazu ausschließlich dieser Bericht.
Keine weiteren Quellen, Konfigurationen, Runtimewerte, Dependencies, nativen Dateien oder DB-Dateien geändert.

## Tatsächlich ausgeführte Prüfungen

- Alte Android-Basis: bestehender Recorder-Harness plus vier Score-Charakterisierungen:
  1Suite/15Tests PASS. Gleiche Scorefälle gegen beide Kandidaten PASS.
- Je Kandidat reguläres jest-expo:17Suites/140Tests PASS.
- Je Kandidat explizites jest-expo/android:16Suites/135Tests PASS, eine vorhandene Heat-Suite
  zunächst vor Teststart blockiert durch fehlenden RNCDatePicker-Testmock. Auf unveränderter104-Basis
  identisch reproduziert. Mit ausschließlich externem Testsetup für die native Datepicker-Grenze
  je1Suite/5Tests PASS. Native Datepicker-Funktion wird dadurch NICHT abgenommen.
- Tests decken manuelle/Auto-Funde, Entfernen, bestätigte Misses, pending, Resume, Run-Isolation,
  Null-Gegenstände, fehlende IDs, unveränderte alte Payloads, exakte Scoreanteile, JSON-Roundtrip,
  simulierten Offlinefehler/idempotenten Retry sowie existierende Persistence/Recovery/Replay und
  Heat-/Help-Regressionen ab. Wiederholungen und Plattformläufe nicht als einzigartige Tests addieren.
- Vollständiges tsc --noEmit je Kandidat: tatsächlicher Prozessabschluss Exit0. Initialer Fehler in
  neuem Testfixture (startedAtSec fehlte) korrigiert; finale Logs maßgeblich.
- ESLint scoped je Kandidat: Exit0,0Fehler/4vorbestehende Warnungen (3run.tsx,1Recovery-Test).
- git diff --no-index --check: keine Whitespacefehler; read-only git apply --check --whitespace=error
  gegen die beiden sauberen exakten Release-WTs PASS. Patch-/Dateihashes im Freeze-Manifest.
- Alle Nicht-Scope-Dateien byteidentisch zum jeweiligen Basisexport, Plattformgrenzen erhalten.

Belege unter `anyvo-tracking-android-object-snapshot/`: test-suites.json, baseline-score.log,
104/103-tests-final.log,104/103-tests-android.log,104/103-heat-android-mocked-final.log,
104/103-tsc-final.log,104/103-lint-final.log sowie Source-Audits und Exitcode-Dateien.

## Releasegrenzen und nächste Aktion

01 prüft unabhängig, integriert nur diesen Snapshot auf jeweils frisch bestätigter Androidbasis,
committet isoliert und publiziert unter bestehender OTA-Freigabe mit komplettem Runtime-/Native-/DB-/
Environment-/Ancestry-Preflight und Bundle-/Live-/Manifest-CDN-Nachprüfung. Keine direkte iOS-Übernahme.
Dieser Bericht selbst ist kein frischer EAS-/Bundle-/OTA-Nachweis.

Geräteempfang, Feldwinkel, Locked-Screen-/Hardware-QA und native Integration bleiben OPEN.
Volle Gegenstandskorrektur und freie HEX-Farben behalten ihre separaten unbeantworteten DB-Gates.
Keine Publikation dieser vollen UI aus dieser Snapshot-Übergabe ableiten.
