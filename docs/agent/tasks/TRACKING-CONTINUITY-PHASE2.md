# Tracking Continuity – Phase 2

Stand: 2026-10-08. Owner: Chat 02. Lokale Implementierung mit gezielten Abschlussprüfungen, uncommitted. Integrations-/Geräteabnahme offen. Kein Release-Beleg.

## Auftrag und bestätigte Entscheidungen

Der Nutzer hat ausdrücklich bestätigt: Nach Pause, App-Neustart oder erkannter Aufzeichnungslücke beginnt ein neuer Abschnitt. Der unbekannte Zwischenweg zählt weder als gemessene Strecke noch als bewertete Suche. Endbestätigung verlangt neue Fix-Evidenz; eine bereits bestätigte Endmeldung wird nicht erneut ausgelöst. Kein automatisches Beenden/Speichern.

Reihenfolge: Continuity, Gegenstandskorrekturen, GPS/Shelly-Praxis, Planer/Verleitungen, Watch/gemeinsames Training. DTW bleibt eine spätere Vergleichsentscheidung. Neue Fachaufträge ergänzen Fremdfährtenübernahme sowie sicheren Import; Mantrailing ausdrücklich nur prüfen.

Geräteplanung direkt vom Nutzer: Shelly BLU Button Tough 1 ZB muss noch gekauft werden. Apple Watch mit Testperson und Simulator verfügbar; Wear OS nur Simulator. Externer GNSS-Empfänger nicht benannt. Daraus folgt kein Geräte-PASS.

## Arbeitsplatz und Grenze zur Production

Worktree: `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-preview-recovery-colors`.
Branch: `feat/tracking-continuity-corrections`.
Basis/HEAD: `0c5a1ed37bba347257ea71729cf83780c0c6043a`, unverändert.
Nur eigener WIP in diesem Worktree. Main/globaler Status und fremde Release-Worktrees bleiben unverändert.
Node-Dependencies wurden ohne Installation per eigenem temporärem Symlink gelesen, zuletzt aus `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-analysis-export/node_modules`. Fremde Dependency-Bäume unverändert; der eigene Symlink wurde nach Abschluss entfernt.

Dieser Stand enthält nicht automatisch alle komponierten Production-Änderungen aus Export C/Tempo/Diagnose. Chat 01 ist alleiniger Publisher. Die aktuelle iOS-/Android-OTA enthält diese neue Continuity nicht. Integration benötigt frische Baseline, Review, Export-Anpassung und getrennte Runtime-Prüfung. Android 1.0.3 verwendet eine ältere aktive Lay-Pipeline; der moderne iOS-Processor darf nicht pauschal hineinkopiert werden. Android-Build 1.0.4 ist ein separater Auftrag.

## Datenvertrag und Umsetzung

- Additives `breakBefore` am ersten tatsächlich akzeptierten Punkt nach einer Unterbrechung. Keine rückwirkende Erfindung historischer Lücken aus ausgedünnten Kartenpunkten.
- Zeitlücke: mehr als 5 Sekunden zwischen tatsächlich verfügbaren Fixes (an bestehenden Analyse-Grenzen orientiert). GPS-Zulassung und Fusion-Schwellen werden nicht neu abgestimmt. Die Grenze braucht Feld-QA.
- Lege-/Suchpunkt-Metadaten in bestehendem SQLite `payload_json`; Lege-Grenzen zusätzlich als versionierte Zeitstempelliste in bestehendem `track_data`/Session-JSON. Keine Schema-Migration. Remote-Zeitstempel werden beim Vergleich normalisiert.
- Karten, Referenz-Overlays, Skizzen-Daten, Detail, Replay und Heatmap erhalten getrennte Abschnitte. Replay interpoliert keinen Puck durch eine Lücke.
- Distanz, Projektion und Referenzqualität überbrücken keine Grenzen. Bewegungsglättung, Dwell-Fenster, Off-track-Streaks und End-Fix-Evidenz beginnen frisch. Selbstkreuzungs-Kontinuität bleibt im lokalen Projektionsfenster; nur ohne nahen Kandidaten erfolgt eine weitere Wiederaufnahme-Suche.
- Auswertung ignoriert ungemessene Zwischenzeit/-strecke, verbindet keine Abweichungs- oder Gegenstandskontakt-Ereignisse über Grenzen. Ein übersprungener Gegenstand wird `unobserved`, nicht automatisch `missed`; bestätigte Funde bleiben erhalten. Anzeige erklärt Teilbewertung. Bei Lücken in Suche ODER Referenz bleiben `run.score` und `run.analytics.trackScore` null. Expliziter v1-Vertrag: `run.continuity` und `analytics.continuity` enthalten `{version:1,hasGaps:true,searchHasGaps,referenceHasGaps}`. Einzelmetriken bleiben erhalten; der Detail-Validator akzeptiert die Teilanalyse, die Anzeige zeigt keine Gesamtnote `/100`. Legacy-Daten erhalten keinen erfundenen Vollständigkeitsstatus.
- Run-Recovery übernimmt echte Punktzeiten, bestätigte Funde und vorhandene Run-Zähler. Unrekonstruierbare Gesamtauswertung bleibt leer statt 0. Speicherfehler behalten den wiederherstellbaren Zustand.
- Hintergrund-Start/Stop werden prozessweit serialisiert. Warmup-/Recording-Generationen invalidieren verspätete Permission-, Native-Start-, Heading- und Positionsrückrufe. Ein alter Start entfernt weder den neuen Vordergrund-Fallback noch bindet er die neue Session um. Stop während eines ausstehenden alten Writes darf keinen neuen Begin nachträglich scharf schalten.
- Stop/Unmount sichert den offenen Lay-Puffer als pausierten Pending-Zustand und stößt das Schreiben des kurzen SQLite-Tails an. Kein behaupteter Schutz bei OS-Kill ohne Callback.
- Search-Puffer behält Session-Identität auch bei Hundewechsel/Schreibfehler. Abschluss wartet auf laufenden Write samt anschließendem Tail. Verwerfen wartet vor dem Löschen auf den eigenen Write.
- Beide Search-Abschlüsse prüfen den realen Flush-Erfolg vor Finalisierung und behalten bei Fehler den Recovery-Zustand.
- Lay-Persistenz erhält eine gemeinsame Write-Barriere; Finish darf bei fehlgeschlagenem Point-Write nicht saved/finalized melden. Das nachträgliche 04-Review belegte zusätzlich einen verspäteten Finalize-Status von A, der die sichtbare Aufnahme B überschreiben konnte. Finish friert Session-ID, Session-Input, Creation-Promise und Store-Ownership vor dem ersten await ein. Eine prozessweit geteilte Ownership pro Store schützt auch neue Hook-Instanzen beim selben Hund. Derselbe Hook wartet vor einer neuen Aufnahme auf seinen vorigen Finalisierungsabschluss und prüft danach erneut die Generation.
- Unterbrochenes Legen kann ausdrücklich in derselben eigenen lokalen aktiven Session wiederaufgenommen werden, ohne neuen Quota-Claim. SQLite/Pending werden abgeglichen, nur fehlende lokale Pufferdaten ergänzt; neue Punkte beginnen mit einer Lücke. Gemessene Distanzbasis wird erhalten. Marker behalten ursprüngliche Ereigniszeit und stabile Herkunft.
- Authentifizierung/Hund/Session/Lifecycle werden vor Lay-Recovery geprüft. Bereits finalisierte, fremde, widersprüchliche oder unzureichend belegte Sessions werden nicht geöffnet. Ein neuerer alter SQLite-Tail ohne rekonstruierbaren kanonischen Distanzzähler bleibt sicher abgelehnt, statt eine Distanz zu erfinden.
- Die Geometrie manueller Winkel wird pro beobachtetem Detektorabschnitt abgeleitet. Nach Prozessverlust nicht persistierte Detektor-Evidenz wird nicht erfunden; gespeicherte Marker bleiben erhalten.

## Prüfbelege und noch offene Gates

Die Läufe betreffen aufeinanderfolgende Entwicklungsstände und überlappen; Zahlen dürfen nicht addiert oder als ein abschließender Gesamt-PASS ausgegeben werden.

- Breiter Lauf: **224/226 Suites und 2704/2706 Tests PASS**, zwei fehlgeschlagene Vertragsassertionen (`trackingUxV5`: frischer optionaler Progress; Quota: bewusst fortgesetzte eigene Session). Beide wurden korrigiert und danach gezielt geprüft: **3 Suites / 56 Tests PASS**. Kein frischer gesamter Breitlauf nach den späteren Lifecycle-/Score-Ergänzungen.
- Gezielte Continuity-/Recovery-Prüfungen: **6 Suites / 84 Tests**, **4 Suites / 110 Tests**, **8 Suites / 135 Tests PASS** (verschiedene Zwischenstände, Überschneidungen).
- Finale Recorder-Background-Proben: **1 Suite / 10 Tests PASS**; einschließlich altem Permission-/Native-/Heading-Rückruf, neuer BG-denied-Session und Stop während vorigem SQLite-Flush. Beleg: `/private/tmp/anyvo-continuity-background-final.json`.
- Ein weiterer 16-Suite-Wiederholungslauf wurde wegen bestätigter starker Rechnerlast für priorisierte 01-/07-Prüfungen durch den Owner beendet (Exit 130). Drei bereits abgeschlossene Suites waren PASS, darunter `layProcessingSession` nach 1106 Sekunden; kein Gesamt-PASS. Log: `/private/tmp/anyvo-continuity-verified-delta.log`.
- Score-/Darstellungs-/Startup-Ergänzungen: **6 Suites / 56 Tests PASS**, `/private/tmp/anyvo-continuity-score-final.json`.
- Abschließende Write-/Recorder-Verdrahtung nach Writer-Ergänzung: **2 Suites / 14 Tests PASS**, `/private/tmp/anyvo-continuity-persistence-wiring.json`. Search-Puffer und Lay-Writer zusätzlich **2 Suites / 9 Tests PASS** im vorherigen Persistenzlauf; dort scheiterte allein ein starrer 7000-Zeichen-Quelltextausschnitt im Recovery-Test. Dieser Test nutzt nun die tatsächliche Funktionsgrenze und ist im 14-Test-Lauf bestanden. Keine Produktassertion abgeschwächt.
- Nach dem Finalize-Review: **2 Suites / 27 Tests PASS**, `/private/tmp/anyvo-continuity-finalization-tests.json` (Recorder-Background einschließlich verspätetem Erfolg/Fehler nach neuem Hook und serieller Wiederverwendung desselben Hooks; bestehender Startup). ESLint für diesen letzten Delta: **0 Fehler / 2 bestehende require-Warnungen**, `/private/tmp/anyvo-continuity-finalization-lint.log`.
- **Aktueller vollständiger TypeScript-Check PASS, Exit 0**, nochmals nach dem Finalize-Fix, `/private/tmp/anyvo-continuity-finalization-typecheck.log`. Vorheriger vollständiger Beleg: Inkrementeller Compilerlauf mit eigenem Cache `/private/tmp/anyvo-continuity-final.tsbuildinfo`; Log `/private/tmp/anyvo-continuity-typecheck-complete.log`. Die versuchte niedrigere Prozesspriorität wurde vom Sandbox-System abgelehnt; der Compiler lief trotzdem regulär erfolgreich. Frühere wegen Rechnerlast abgebrochene Läufe sind kein PASS und werden nicht dazugezählt.
- ESLint: vollständiger damaliger Diff **0 Fehler / 16 Warnungen**. Letzte Recorder-/Queue-Dateien zusätzlich **0 Fehler / 2 Warnungen** (bereits enthaltene require-Imports; Zahlen überlappen). Score-/Abschluss-Delta zusätzlich **0 Fehler / 3 Warnungen**; letzter Writer-/Test-Delta **0 Fehler / 0 Warnungen**. Warnungen überlappen mit dem vollständigen damaligen Diff und werden nicht addiert.
- `git diff --check`: PASS nach letzten Änderungen.

03 hat den neuen Recorder-Kandidaten lesend mit seinen beiden reproduzierten Rennen abgeglichen: Gates und neue Regressionen adressieren die Oracles nachvollziehbar. Das ist Code-Review, kein neuer Ausführungs-/Geräte-PASS. 03s 196PASS und vier separate Fehlerreproduktionen beziehen sich auf veröffentlichtes iOS `28355bad`. 04s sechs Charakterisierungstests belegen Android-Fehler auf `3f44b1d`, keinen Android-Fix.

Sync-Reentrancy gehört nach geklärter Zuständigkeit ausschließlich 05. Mein geprüfter optionaler Vorschlag (2 Suites / 30 Tests PASS) wurde als `/private/tmp/ANYVO-02-SYNC-ADMISSION-CANDIDATE-2026-10-08.patch`, SHA256 `22f07b3ddf72fa7d405a9f150acf4455f5d70e3722b88bf840233286e2bb63e1`, übergeben. Die beiden eigenen Sync-Dateiänderungen wurden aus diesem Diff entfernt. Kein doppelter Release-Baustein.

Kein physischer Geräte-/Sperrbildschirm-/Feld-PASS. Simulator ist kein Nachweis für Bluetooth-/GNSS-/Hintergrund-Zuverlässigkeit. Search-Hintergrundversorgung bleibt gesondert offen. Der gezielte Android-P0-Transfer läuft separat auf `3f44b1d` im Worktree `anyvo-android-tracking-p0`; das ist noch kein vollständiger Transfer dieser Continuity-Semantik.

## Weitere Aufträge – ausdrücklich nicht als fertig ausweisen

- Nachträgliche Gegenstandskorrekturen: vorhandenes Entfernen einer Auto-Erkennung ist noch keine vollständige, nachvollziehbare Korrektur mit konsistenter Ergebnisberechnung und Verlauf.
- GPS-/Shelly-Praxis, Planer, Verleitungen, native Watch-/Wear-Apps und Gruppenkarte sind durch diesen Diff nicht fertiggestellt.
- Bestehendes Trainer-Sharing ist Ansicht/Feedback mit akzeptierter `trainer_client`-Verbindung. Eine fremde Referenz an eine ausgewählte Person mit anschließendem eigenem Hund/Suchlauf zu übergeben braucht einen eigenen geprüften Ablauf.
- Vorhandene Referenz-Overlays zeigen andere eigene Hunde. Eine echte gemeinsame Personen-/Fährtengruppenkarte ist im bisher geprüften Code nicht nachgewiesen.
- `unobservedObjectIds` ist im Recovery-Snapshot und Recorder vorhanden; fertige Runs persistieren noch keine vollständigen Einzelzustände. Export darf daraus keine einzelnen missed/found/unobserved-Werte erfinden; nur explizite Teilbewertung und tatsächlich gespeicherte Counts/IDs. Geometrie heißt `run.run_points` bzw. `run.replay_points`.
- 07 hat den Export-Vertrag geprüft: vorhandene Segmentarrays/GPX-trkseg/PDF-Segmentzeichnung wiederverwenden; `segments()` muss `breakBefore` und normalisierte Lay-Metadaten übernehmen. 07 ist alleiniger Writer der engen Adapterkorrektur. Integration bleibt offen; kein Export-Roundtrip-PASS behauptet. Exportkarte und noch nicht gespeicherte Notiz des aktuellen 07-Detail-Screens müssen bei hunkweiser Integration erhalten bleiben.
- GPX/PDF/JSON Export C existiert auf dem komponierten Release-Stand und gehört hinsichtlich Oberfläche zu Chat 07. Sicherer Import und Fremdfährtenübernahme müssen vorhandene Formate nutzen und Berechtigungen/Privatsphäre erhalten.

## Plattform-/Hardware-Grundlagen

Shelly-Modell SBBT-102C / Bluetooth Device ID 0x17: https://shelly-api-docs.shelly.cloud/docs-ble/Devices/BLU_ZB/button1_ZB/ . Bluetooth/BTHome Button-Events mit 1500-ms-Advertisements; praktische iOS-Locked-Screen-Zuverlässigkeit nicht belegt. Smartphone-Integration verwendet BLE, nicht den Zigbee-Funkweg.

Apple Watch und Wear OS benötigen echte native Watch-Apps/Targets und passende Builds; Telefon-OTA allein installiert keine Watch-App. Apple-Unterlagen: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-platforms/ . Wear-Unterlagen: https://developer.android.com/training/wearables/packaging und https://support.google.com/googleplay/android-developer/answer/13295490?hl=en . Store-/Signierungsarbeiten wurden hier nicht durchgeführt.

## Änderungen

- `app/track/[id].tsx`
- `app/track/__tests__/analyse-section.test.ts`
- `app/track/__tests__/detail-resume-recovery.test.ts`
- `app/track/__tests__/newbie-track-quota-gate.test.ts`
- `app/track/__tests__/run-recovery-analytics-gap.test.ts`
- `app/track/__tests__/run-search-recovery.test.ts`
- `app/track/legen.tsx`
- `app/track/run.tsx`
- `docs/agent/tasks/TRACKING-CONTINUITY-PHASE2.md`
- `features/sync/services/remoteTrainingSyncService.ts`
- `features/tracking/components/TrackReferenceOverlayLayer.tsx`
- `features/tracking/components/TrackReplayMap.tsx`
- `features/tracking/components/TrackingMap.tsx`
- `features/tracking/components/__tests__/TrackReplayMap.test.tsx`
- `features/tracking/engine/__tests__/layProcessingSession.test.ts`
- `features/tracking/engine/__tests__/laySessionRuntime.test.ts`
- `features/tracking/engine/__tests__/trackAnalyticsV3.test.ts`
- `features/tracking/engine/layProcessingSession.ts`
- `features/tracking/engine/referenceQuality.ts`
- `features/tracking/engine/trackAnalytics.ts`
- `features/tracking/engine/trackAnalyticsV3.ts`
- `features/tracking/engine/trackHeatmap.ts`
- `features/tracking/engine/trackReplay.ts`
- `features/tracking/engine/trackSegmentAnalysis.ts`
- `features/tracking/hooks/__tests__/trackingEndFinalObject.test.tsx`
- `features/tracking/hooks/__tests__/useSearchRecorder.recovery.test.tsx`
- `features/tracking/hooks/__tests__/useTrackEndGuidance.lifecycle.test.tsx`
- `features/tracking/hooks/__tests__/useTrackRecorder.background.test.tsx`
- `features/tracking/hooks/__tests__/useTrackRecorder.startup.test.tsx`
- `features/tracking/hooks/useSearchRecorder.ts`
- `features/tracking/hooks/useTrackEndGuidance.ts`
- `features/tracking/hooks/useTrackRecorder.ts`
- `features/tracking/repositories/__tests__/searchPointsRepo.test.ts`
- `features/tracking/repositories/localTrackRepository.ts`
- `features/tracking/services/__tests__/trackRecoveryService.test.ts`
- `features/tracking/services/trackRecoveryService.ts`
- `features/tracking/services/trackService.ts`
- `features/tracking/store/__tests__/searchPersist.test.ts`
- `features/tracking/store/__tests__/searchRunState.test.ts`
- `features/tracking/store/__tests__/trackRecovery.test.ts`
- `features/tracking/store/searchPersist.ts`
- `features/tracking/store/searchRecovery.ts`
- `features/tracking/store/searchRunState.ts`
- `features/tracking/store/trackRecovery.ts`
- `features/tracking/store/trackReferenceOverlays.ts`
- `features/tracking/store/trackingStore.ts`
- `features/tracking/utils/__tests__/bufferedPointWriter.test.ts`
- `features/tracking/utils/__tests__/canonicalDistance.test.ts`
- `features/tracking/utils/__tests__/layRecovery.test.ts`
- `features/tracking/utils/__tests__/localTrackRun.test.ts`
- `features/tracking/utils/__tests__/manualAngleGeometrySections.test.ts`
- `features/tracking/utils/__tests__/referenceObjectStatus.test.ts`
- `features/tracking/utils/__tests__/trackAnalysisState.test.ts`
- `features/tracking/utils/__tests__/trackContinuity.test.ts`
- `features/tracking/utils/__tests__/turnAwareLineGate.test.ts`
- `features/tracking/utils/backgroundTransitionQueue.ts`
- `features/tracking/utils/bufferedPointWriter.ts`
- `features/tracking/utils/canonicalDistance.ts`
- `features/tracking/utils/layRecorderOwnership.ts`
- `features/tracking/utils/layRecovery.ts`
- `features/tracking/utils/localTrackDetail.ts`
- `features/tracking/utils/localTrackRun.ts`
- `features/tracking/utils/manualAngleGeometry.ts`
- `features/tracking/utils/referenceObjectStatus.ts`
- `features/tracking/utils/searchDisplayGeometry.ts`
- `features/tracking/utils/searchGeometry.ts`
- `features/tracking/utils/searchReplayGeometry.ts`
- `features/tracking/utils/trackAnalysisState.ts`
- `features/tracking/utils/trackContinuity.ts`
- `features/tracking/utils/trackDetailMap.ts`
- `features/tracking/utils/trackReplayData.ts`
- `features/tracking/utils/trackSegments.ts`
- `features/training/repositories/localTrainingRepository.ts`
- `i18n/de-CH.ts`
- `i18n/gsw-CH.ts`
- `i18n/locales/en.ts`
- `i18n/locales/fr.ts`
- `i18n/locales/it.ts`
- `lib/trackGuidance.ts`

04 hat den gemeinsamen Finalize-Fix eng lesend geprüft: Ownership über neue Hooks und serialisierte Wiederverwendung im selben Hook adressieren den Befund; keine weiteren wesentlichen Befunde für diesen Fix. Dies ist kein zusätzlicher Geräte- oder Vollsuiten-PASS.

## Kandidatenrevision

Der zuerst übergebene Patch SHA256 `50affd2fdd6926a2ed1c44c0e741a9b07e82a64f9e7633a7d67b2e77a582d890` ist wegen des Finalize-Reviewbefunds zurückgezogen. Ausschließlich der neu erzeugte Patch samt Manifest ist für weitere Integration zu verwenden. Keine neuen Export-/Sync-Writer oder fachfremden Änderungen.

## Aktionen

Kein Commit, Push, Merge, OTA, nativer Build, Store-Schritt oder Live-DB-Eingriff durch diese Continuity-Umsetzung. Tests verwenden lokale Mocks/Fixtures. Repository-Metadaten/Produktdaten anderer Worktrees werden nicht verändert.
