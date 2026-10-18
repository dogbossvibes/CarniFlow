# Android 1.0.4 — Tracking-Feldkorrekturen 2026-10-18

Isolierter Port desselben Nutzerauftrags und des iOS-Pakets `tracking-field-corrections-2026-10-18`. Basis `ccb98c5296e6021c6a0839ab4c16fc15848f8fff`, Branch `fix/tracking-field-corrections-android104`. Basis enthält Chat01-UI-Fixes für Termine/Winkelliste/Logo. Kein Native-, DB-, Versions- oder Release-Guard-Eingriff. Main und Releaseworktrees unberührt.

## Gezielte Abweichungen vom iOS-Paket

- Doppelwinkelguard direkt im vorhandenen Callback-Recorder `useTrackRecorder`, keine Übernahme des iOS-Session-Processors. Regression über den echten Android-Hook mit verschobenem Scheitel 10/11,3/14 m.
- Distanz-/Schenkelanzeige bei kontinuierlichen Fährten über vorhandenes zeitabhängiges `buildSearchEventArcs`. Android-Transfer-Gap-Schutz bleibt erhalten. Die ältere Search-Geometrie unterstützt keine Lücken: Bei vorhandenen Unterbrechungen werden keine erfundenen Marker-Meter/Schenkel angegeben, sondern unbekannt. Keine allgemeine Continuity-Engine in diesem OTA-Port.
- Markergruppierung/Detaildialog wie iOS; Androids `ParentReferenceLines` und `mainReferencePoints` für Verleitungen bleiben erhalten. Keine Ersetzung ganzer iOS-Kartendateien.
- Endbeobachtung vollständig/teilweise/unbekannt wie Support-Fix2ee. Bestehender Android-Exporter bleibt ohne Hintergrundzähler und meldet diese weiterhin als `unavailable`; nur neue Endschema-Version12 wird erhalten. Keine fiktive Verfügbarkeit von iOS-Sensor-/Background-Funktionen.
- Locale-Ergänzungen additiv zum aktuellen UI-Stand. G7-Hookprüfung unverändert konservativ: Nähe allein kein Fund, bestätigtes Verweilen/Ende separat getestet. Historische Daten nicht geändert.

## Prüfung und Release

Eigene Android-Tests/Typecheck/ESLint/diff-check und hashgebundene Belege werden unter `outputs/tracking-field-corrections-android104-2026-10-18` abgelegt. Kein realer Geräte-PASS. Veröffentlichung ausschließlich durch Chat01 nach unabhängiger Review, frischem EAS-/Ancestry-/Runtime-/Environment-Preflight und GitHub-Backup durch00. Dieses Dokument behauptet keine Veröffentlichung.

Erster gezielter Lauf: 5 Suites, 118 Tests PASS, eine bereits im Ausgangsstand veraltete Quelltext-Assertion zum entfernten Footer-Kommentar fehlgeschlagen. Sie wurde test-only auf die tatsächliche Einbettung in `TrackEvaluationLayout` angepasst. Android-Hook-Doppelwinkeltest und Karten-Gruppentests bestanden. Endgültige zusätzliche Regression siehe Manifest; Testzahlen überlappen und werden nicht addiert.

## R2 — Referenzcache und verzögerte Markerladung

Die zusätzliche Android-Verleitungsregression deckte zwei reale Paritätsfehler auf: Grenzen aus Punkt-Payload bzw. Session-Zeitstempeln wurden erst nach der Marker-Meterzuordnung restauriert. Android normalisiert die vorhandenen Grenzen nun vor dem Detailmodell; unvermessbare Eventmeter bleiben initial und nach Cache-Reload gleichermassen unbekannt.

Für beide Plattformen bleiben die vorhandenen Punkt- und Markerzeitstempel im Detail-/Referenzcache erhalten. Ein neuer Regressionstest zeigt, dass ein Marker auf dem zurücklaufenden Schenkel vor und nach Reload bei etwa 19 m bleibt statt an den früheren Durchgang bei etwa 1 m zu springen. Alte Caches ohne Zeitachse behalten den vorhandenen Nearest-Fallback; es werden keine historischen Zeiten erfunden. Keine Datenbankmigration.

Die Kartenhöhe wird nun schon vor der asynchronen Markerladung gemessen. Neuer UI-Test: Marker nach Mount laden, ohne zweites Layout hineinzoomen, zusammengesetzte Beschriftung trennt sich wieder.

R2 gezielt: iOS 4 Suites / 56 Tests PASS; Android 4 Suites / 62 Tests PASS. Die vorherigen umfangreicheren Läufe bleiben Beleg für unveränderte Bereiche; Zahlen überlappen. Frischer R2-Typecheck/Lint und zusätzliche Referenz-Regression sind im separaten R2-Manifest gebunden. R1-Pakete sind durch R2 ersetzt und dürfen nicht veröffentlicht werden.
