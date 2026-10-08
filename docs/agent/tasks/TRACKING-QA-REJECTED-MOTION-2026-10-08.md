# Persönliche QA: Motion bei verworfenen Geometriekandidaten

Stand: 2026-10-08. Verantwortlich: Chat 02. Lokal implementiert, uncommitted; keine Veröffentlichung.

## Auftrag und Grenzen

Aus dem autorisierten FN1/FN2-Analyse-/Fehlerbehebungsauftrag und der abgestimmten Fortsetzung mit 00: zuerst begrenzte persönliche QA für bisher ausgeschlossene Geometrie-Rejects, getrennte Background-Dropgründe, danach belastbare Winkelanalyse. Der Nutzer bestätigt FN1 (~21:33, 19 m): rechts, links, Ende. FN2 (~21:38, 34 m): spitz rechts, spitz links, rechts, links, Ende. Exakte Scheitelkoordinaten/-zeiten und Winkelgrade sind nicht bekannt.

Arbeitsverzeichnis: `anyvo-tracking-qa-rejected-motion`, Branch `fix/tracking-qa-rejected-motion`, Basis/HEAD `37418dbd404c7ead7d795dea7698810dbf8b030c`. Bei Beginn sauber. Die Basis war der Integrationsstand von 01, keine hier frisch verifizierte Production-Baseline. Kein Commit, Push, Merge, OTA, Build, Store- oder DB-Schritt. Kein Eingriff in andere Worktrees oder globale Statusdateien. Die zuvor übergebenen FN- und Continuity-/Android-Patches bleiben unverändert.

## Ursache und Änderung

Der bisherige QA-Block übersprang alle Kandidaten ohne `headingDeltaDeg`. Damit fehlte gerade für `no_window_before`/`no_window_after` die vorhandene Motion im Export. Außerdem verhinderte der Vergleich auf stärkere Evidenz das Ergänzen später eintreffender Kontextsamples bei gleicher Evidenz.

`QaMotionCapture` liest ausschließlich den bereits laufenden Motion-Ring. Es aktiviert keine Sensoren und liefert keine Werte an GPS-Zulassung, Fusion, Score oder Erkennung zurück. Auch die acht bestehenden Geometrie-Rejects werden erfasst. Die stärkste beobachtete Motion-Auswertung bleibt erhalten, der letzte GPS-/Fusion-Entscheid ist separat als `geometryAtLastEvaluation` gekennzeichnet. Dessen `accepted` bedeutet Zugehörigkeit zu den aktuell fusionierten Ecken, nicht den Beweis eines bereits gespeicherten Markers. Kontextsamples können sich bei gleicher Evidenz ergänzen. Fehlende Samples werden nicht rekonstruiert.

Grenzen: letzte 128 Kandidaten des vollständigen Detektor-Diagnosedurchlaufs, jeweils höchstens 32 beobachtete Samples im bestehenden Kontext von ±3 Sekunden. Bei Überschreitung wird der Samplekontext ausgedünnt, einschließlich beider zeitlicher Randwerte. `contextSamplesTruncated`, ausgelassene Kandidatenzahl und Retention-Metadaten machen die Grenzen sichtbar. Gedrosselte/fehlende Daten sind keine Aussage über die tatsächliche Bewegung. Die Begrenzung gilt für den neuen Motion-Block, nicht als neue globale Grenze für alle vorhandenen QA-Blöcke. Es gibt kein unbegrenzt wachsendes Seen-Set mehr.

Zeitangaben bleiben relativ zum ersten Rohfix bzw. zum Kandidaten. Sensorfelder werden explizit ausgewählt; keine Position, native Gerätekennung oder Berechtigungstoken wird in diesen Block übernommen. Neue Session/Origin, Account-/Berechtigungswechsel, Ablauf und expliziter Neustart leeren den Collector. Snapshots werden kopiert und prüfen die aktuelle persönliche QA-Autorität erneut. Der bestehende persistierte persönliche QA-Zugriff bleibt zusätzlich bestehen.

Background: `runtimeDropReasons` zählt bestehende `backgroundSessionMismatch`, Duplicate- und Finalized-Events getrennt von `rejectReasons` für GPS-Gates. Nur feste Runtime-Codes werden ausgegeben; unbekannte Werte landen unter `unknown`. Die bisherige Kunden-Supportausgabe erhält diesen Zusatz nicht. Der persönliche QA-Export fordert ihn explizit an; die Autorität wird vor und nach asynchronem Storage-Lesen verglichen. Keine neuen Background-Ereignisse, keine Änderung der Runtime-Entscheidungen.

Schema: additive QA-Version 2.11, Capture-Version 2 bleibt kompatibel. Alte Captures bleiben lesbar; bei ihnen fehlen die neuen Retention-Metadaten. Der Service kennzeichnet seinen erweiterten Export als 2.11. Nichtfinite Motion-Zeiten werden vom Export-Privacy-Check abgewiesen.

## Dateiliste

Produkt (7):
- `features/tracking/utils/qaMotionCapture.ts` (neu)
- `features/tracking/engine/layProcessingSession.ts`
- `features/tracking/hooks/useTrackRecorder.ts`
- `features/tracking/utils/qaSessionCapture.ts`
- `features/tracking/utils/qaTrackExport.ts`
- `features/tracking/utils/backgroundLayDiagnostics.ts`
- `features/tracking/services/qaTrackExportService.ts`

Tests (5): `qaMotionCapture.test.ts` (neu), `backgroundLayDiagnostics.test.ts`, `qaExportV21Motion.test.ts`, `layProcessingSession.test.ts`, `qaTrackExportService.test.ts`. Zwei alte textuelle Wiring-Assertions wurden durch echte Collector-/Processor-Verhaltenstests ersetzt. Hinzu kommt dieser eigene Bericht.

## Prüfung

16 unterschiedliche Suites / 332 unterschiedliche Tests bestanden (überlappende Wiederholungen nicht addiert):
- Die drei erfolgreichen Suites des ersten gezielten Laufs: 80 Tests.
- Nach Korrektur von zwei Test-Harness-Problemen (fehlender AsyncStorage-Mock, in Jest unzulässiger dynamischer Import): Background + Collector, 2 Suites / 19 Tests PASS.
- Zusätzlich verschärfte Prüfung auf exakt gleichbleibende Evidenz bei späterem Kontext sowie begrenzte Anzahl Motion-Lookups: Collector 1 Suite / 13 Tests PASS (in den 19 enthalten).
- Regressionen: 11 Suites / 233 Tests PASS. Enthalten sind QA-Capture/Export, persönlicher Exportzugriff, Authority-Lifecycle, Lay-Runtime, Start-/Background-Hooks, Fusion und Motion-Confidence.

Die Processor-Prüfung vergleicht QA an/aus für reale Verarbeitungsketten: komplette Ergebnisse, Punkte, Marker, Winkel und Distanz identisch, einschließlich Gerade, Jitter, schlechter Accuracy und Pause. Collector-Daten existieren nur im freigegebenen QA-Lauf. Die unabhängigen bestehenden Gegenproben umfassen u. a. Gerade/Drift, sanfte Bögen, S-Kurve, Stop-and-go, GPS-Wackler, Bücken und Handydrehung. Das ist Regressionsevidenz, kein Feld-PASS.

Full TypeScript PASS (Exit 0), abschließendes ESLint 0 Fehler / 0 verbleibende Warnungen und `git diff --check` PASS. Prüflogs im begleitenden eingefrorenen Manifest. Vorläufige Import-Warnungen im neuen Test wurden durch Umordnen der Mock-Zeile behoben; kein Produktverhalten geändert. Dependencies nur über einen vorübergehenden Symlink lesend verwendet, ohne Installation.

Unveränderte fachliche Module, gegenüber HEAD bytegleich geprüft:
- shortLegCornerDetection: `3b23c9973acb5ced13913bae615c68384827735502e43e7c73e72899f862b049`
- turnFusion: `723a208fdc4f3d8094641c5727d2c005d3eb482e6d09d08a29f638e1afc26b7a`
- motionTurnEvidence: `eabf1d2350efc047fd576990c053865130cc3aeede001ecda371def6903e4a7a`
- laySessionRuntime: `87ee9eaa72f8c52898cea117454271db59bcbe3dd75e3350a0ed66be7a552`
- useSearchRecorder: `c5fc4cb7608a8cd092990e109c5efecfcc545e3083ae2f35a48791bfa34556b4`

## FN1/FN2 und nächste Algorithmik-Grenze

Der vorhandene read-only Corner-Audit wurde mit den eingefrorenen Original-Fixtures gegen die unveränderte aktuelle Algorithmik erneut ausgeführt. FN1 bleibt `[links]` statt `[rechts, links]`; FN2 bleibt `[links, rechts]` statt `[spitz_rechts, spitz_links, rechts, links]`. Beide Feldabnahmen: FAIL/offen. Die gespeicherten Motion-Kontexte beginnen erst bei 16,055 s bzw. 17,115 s; das ist keine Aussage darüber, ob der Sensor vorher lief.

FN1: vor/nach-Fenster liegen teilweise an benachbarten Scheiteln; der Einsegment-Abstand 1,07 m überschreitet die bestehende 1-m-Rescuegrenze. Eine größere Kombination hat einen gegenläufigen Zwischenabschnitt. FN2: zu Beginn fehlt ein zugelassener stabiler Eingangsschenkel; der letzte Linksübergang erstreckt sich über drei Segmente und enthält Überschwingen. Motion-Richtung allein beweist weder geografischen Weg noch Spitzwinkelschärfe. Deshalb keine Schwellenänderung zum bloßen Bestehen dieser zwei Läufe. Neues Motion-Capture kann bereits fehlende Felddaten nicht rückwirkend ergänzen und liefert keine Rohdaten vor Eintritt in die Detektor-Diagnose.

Nächster Schritt für Algorithmik: zusätzliche vollständige Live-Evidenz der verworfenen Kandidaten aus einem Testlauf; dann einen begründeten Startup-/Split-Apex-Kandidaten mit diesen Fällen und den unabhängigen Fehlwinkel-Gegenproben vergleichen. Nur nach nachgewiesenem Gewinn ohne zusätzliche Fehlwinkel eine fachliche Änderung übergeben. Reale Geräte-/Locked-screen-/Audioabnahme bleibt offen.

## Integration und Release

01 erhielt separat einen read-only Abhängigkeitshandoff zur Continuity-Integration: der 79-Dateien-Freeze auf 0c5a1ed setzt Accuracy-aware-Score-/Recovery-Semantik aus `6b103c17d1a6eec4510d45c77865a1df3e396a3d` voraus. Dieser Commit ist kein Vorfahre von 37418db. Der neue QA-Patch löst oder ersetzt diese getrennte Integrationsaufgabe nicht. Keine alte Vollversion des Search-Hooks über neuere persönliche QA/Export-C/Tempo-Guards kopieren.

Dieser Patch ist JS/TS ohne neue native Fähigkeit. OTA-Eignung der tatsächlich installierten Binaries/Runtimes und aktuelle Production-Abstammung wurden hier nicht geprüft; Integration/Preflight liegen bei 01. Der frühere FN-Patch (731d8274…) und dieser QA-Patch haben verschiedene Basen und müssen einzeln integriert und gemeinsam erneut getestet werden. Kein automatischer Publish-Auftrag aus diesem Diagnosebericht.
