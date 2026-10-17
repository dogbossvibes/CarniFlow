# SUPPORT-END-DIAGNOSTICS-2026-10-18 — Support-Ende und Build-52-OTA-Vorbereitung

| Feld | Wert |
|---|---|
| Task-ID | SUPPORT-END-DIAGNOSTICS-2026-10-18 |
| Branch | fix/support-end-diagnostics-ios105-motion |
| Worktree | anyvo-support-end-diagnostics |
| Basis | 71632a680115475dc84d2d1a968a71699245d4a5; enthält lokales main 1a57421 |
| Verantwortlich | Codex |
| Status | Implementiert und getestet; freigegeben für lokalen Commit und iOS-OTA |

## Auftrag und Scope

Nutzerfreigabe: Diagnosekorrektur umsetzen und OTA für TestFlight Build 52 veröffentlichen.
Zusätzliche ausdrückliche Freigabe: „Ja, Guard ergänzen, lokal committen und OTA veröffentlichen“.
Dieser Report beschreibt den geprüften Stand vor dem freigegebenen Commit/Publish.
Das endgültige Release-Ergebnis wird separat unter `../outputs/support-end-diagnostics-build52/` festgehalten. Kein Push, Merge oder nativer Build.
Der Release-Guard wird gezielt ergänzt; seine Schutzprüfungen werden nicht umgangen.

Die Implementierung behebt den belegten Diagnosefehler, nicht die ungeklärte Ursache
fehlender Lay-Winkel aus dem Feldtest vom 17.10.2026. GPS-/Fusion-/Winkelschwellen,
Recorder-Entscheidungen, Marker und native Module bleiben unverändert.

## Änderungen

- `app/track/run.tsx`: tatsächlichen `onFired`-Callback auch ohne QA-Modus erfassen;
  gleiche Beobachtung für QA und Support. Frischer Start setzt die Beobachtung zurück;
  Recovery wird auch ohne gespeicherte Punkte als teilweise beobachtet markiert.
- `features/tracking/utils/qaSearchCapture.ts`: `eventObservation` complete/partial/unknown;
  `eventCount` 1 bei beobachtetem Ereignis, 0 nur bei vollständiger Beobachtung ohne
  Ereignis, sonst null. Altbestand rein lesend normalisieren.
- `features/tracking/utils/supportDiagnostics.ts`: alte fehlende Ereignisse beim Export
  nicht als bewiesene Null ausweisen; gespeicherte Originaldaten nicht umschreiben.
- `features/tracking/utils/qaTrackExport.ts`: Schema 2.12 für den Beobachtungsumfang.
- `features/tracking/services/qaTrackExportService.ts` und Support-Anreicherung:
  Exportversion nicht durch feste 11/9 wieder absenken.
- Regressionen für Support ohne QA-Zugriff, Persistenz/Export, Legacy, Resume, Privacy,
  Callback-Verdrahtung und klare Rechts-/Linkswinkel bei 5/15/30 m gemeldeter Accuracy.

## Verifikation

- 167 Tests / 8 Suites: qaSearchCapture, supportDiagnostics, qaTrackExport,
  qaTrackExportV2, qaTrackExportService, qaTrackExportAccess,
  customerDiagnosticsService, trackingEndFinalObject — PASS.
- 60 Tests / 2 Suites: shortLegCornerDetection, run-guidance-activation — PASS.
- 110 weitere Tests / 4 Suites: turnFusion, useSearchRecorder.qaTelemetry,
  layProcessingSession, useSearchRecorder.endFixAdmission — PASS.
- Insgesamt 337 unterschiedliche Repository-Tests bestanden.
- ESLint der neun geänderten TypeScript-Dateien: 0 Fehler, 2 bestehende Warnungen
  zur unveränderten Recovery-Effect-Dependency in run.tsx; keine automatische Korrektur.
- TypeScript nach App-/Resume-/Schema-Anpassungen: PASS. Vollständiger Durchlauf
  einschließlich neuer Release-Guard-Tests mit 2048 MB Heap-Limit: PASS.
  Letzter inkrementeller Abgleich nach der Race-Test-Anpassung: PASS.
- git diff --check: PASS.
- Ein früherer neuer Test benutzte irrtümlich die bestehende Spitzwinkelroute als
  Rechts-/Linkswinkelreferenz. Bei 30 m meldet diese rechts/links statt spitz.
  Der neue Regressionstest prüft jetzt ausdrücklich vier 90°-Winkel. Produktcode
  und Erwartungswerte bestehender Detektortests wurden nicht verändert.

## Replay mit vorhandenem Export

Drei zusätzliche Such-Replays auf Build-52-Code plus Diagnosekorrektur: PASS.
Echte exportierte GPS-Punkte; Sensoren/Persistenz gemockt; vollständiger Screen nicht
montiert. Bewegungsszenarien: keine Motion-Daten, durchgehend walking und anhand der
exportierten Annahme/Ablehnung synthetisch angenommene Klassifikation. Die fehlenden
originalen Sensorwerte lassen sich damit nicht rekonstruieren.

Alle drei: reales Hook-Ende-Ereignis bei 487,4 s; neuer Support-Builder protokolliert 1
und complete. Beim klassifikationsgeleiteten Szenario: 30 Run-Punkte, maximaler
Geometrieabstand zum Export 0,000825 m, Fortschritt 48,94038 m, Endabstand 0,96 m.
Endgegenstand bleibt missed; die zwei vorherigen Gegenstände auto_dwell_found.
Dies beweist keinen tatsächlichen Ereigniszeitpunkt auf dem verlorenen Feldtestgerät.

Replay-Artefakte außerhalb des App-Repos:
`../outputs/support-end-diagnostics-build52/`.

## Frischer EAS-Preflight — keine Veröffentlichung

EAS bestätigt Build `87a55197-8a18-487d-85a7-6ef16ae33168`:
FINISHED / IOS / Version 1.0.5 / Build 52 / Runtime 1.0.5-motion-v2 /
Channel production / Profil native-sensor-ios / Commit 71632a680115475dc84d2d1a968a71699245d4a5.
Für diese iOS-Runtime existiert beim Preflight noch keine Production-OTA.

Dry-Run des unveränderten Wrappers mit initial-runtime-release und genau dieser Build-ID:
Production-Environment-Pflichtvariablen vorhanden (nur Namen ausgegeben), Lock frei,
Plattform/Runtime und Ancestry korrekt. Veröffentlichung verweigert wegen:

1. `evaluateNativeBaseBuild` vergleicht App-Version mit Runtime; 1.0.5 ist ungleich
   1.0.5-motion-v2, obwohl ein expliziter iOS-Runtime-Override gesetzt ist.
2. Derselbe Guard akzeptiert ausschließlich Profilname production; native-sensor-ios
   erbt laut eas.json von production, wird aber nicht aufgelöst.
3. Der Worktree enthält die noch uncommitteten Änderungen. AGENTS.md verlangt
   ausdrückliche Commit-Freigabe; Dirty-Tree-Guard bleibt aktiv.

Android beim Dry-Run: Group cb943be9-c218-4af2-bffe-190d06e162cb,
Update 01a14310-0fc1-70af-85fb-3a4201ecbbf0, Runtime 1.0.4,
Commit addeec4e325b1b733392dd5c23e8787322319a6f. Unverändert.

## Freigegebene und implementierte Release-Guard-Ergänzung

Kein direkter eas-update-Bypass und kein Wechsel auf die alte Runtime.
Der Initial-Runtime-Guard wurde gezielt ergänzt:

- App-Version separat gegen die native Build-Konfiguration prüfen; EAS-Build-Runtime,
  Runtime aus der Konfiguration des Build-Commits und Release-Runtime müssen exakt
  1.0.5-motion-v2 entsprechen.
- Das gemeldete Build-Profil anhand von eas.json am unveränderlichen Build-Commit
  auflösen. Nur eine nachweisbare production-Vererbung mit effektiv production
  Channel/Environment und store Distribution erlauben; Entwicklungsclient,
  Simulator, unbekannte Profile und zyklische Vererbung weiterhin ablehnen.
- Tests für gültigen Build 52 sowie falsche Runtime, App-Version, Profil, Channel,
  Environment, Distribution und fehlende Build-Konfiguration ergänzen. Bestehende
  Race-/Ancestry-/Environment-/Dirty-/Lock- und Plattformisolationsguards beibehalten.
- Nach allen Tests den ausdrücklich freigegebenen lokalen Release-Commit erstellen.
  Kein Push/Merge nötig. Danach frischer Wrapper-Preflight und iOS-only-Publish mit
  Production-Environment, gefolgt von Update-/Runtime-/Commit-Nachkontrolle.

## Offene Grenzen

Kein Gerätetest in diesem Auftrag möglich. Nächster Test auf dem vorhandenen iPhone
mit Build 52: frische Absuche bis Ende, manuell vor Ende stoppen, App-Recovery vor/nach
Ende; Support-Export sollte jeweils beobachtet, vollständig ohne Ereignis oder teilweise
melden. Alte Daten bleiben unverändert. Für die fehlenden Lay-Winkel fehlen weiterhin
Lay-Rohfixe, Detektor-Kandidaten und die genaue installierte Feldtestversion.
Externe Diagnoseauswertungen müssen bei Schema 2.12 eventCount=null unterstützen.


Zusätzliche Dateien: `scripts/update-production.mjs`,
`scripts/__tests__/updateProductionNativeProfile.test.ts`,
`scripts/__tests__/otaReleaseHarness.ts` (optionales natives eas.json im Fixture),
`scripts/__tests__/updateProductionInitialRuntime.test.ts` (genauerer Ablehnungstext).
Die bestehenden appVersion-/production-Profile behalten ihren bisherigen Guard-Pfad.
Der neue Sonderfall benötigt statische Konfiguration am Build-Commit und die passende
Release-App-Version. Dynamische app.config-Dateien, unbekannte/zyklische Profilketten,
Simulator, Entwicklungsclient und Custom-Build-Workflows werden nicht freigegeben.

Offizielle Referenzen geprüft:
- https://docs.expo.dev/eas/json/ — extends, Plattform-Overrides, Channel, Environment, Distribution.
- https://docs.expo.dev/eas-update/runtime-versions/ — Runtime-Kompatibilität.


## Abschließende Guard-Verifikation

172 verschiedene Release-Tests bestanden: Hauptlauf 171/172; ausschließlich der alte
Parallelstart-Test 6b scheiterte am festen 20-Sekunden-Zeitlimit. Test-only-Reparatur:
Fake-EAS wartet auf eine explizite Freigabedatei, der Completion-Listener wird sofort
registriert, Cleanup gibt den Prozess auch bei einer Assertion frei. Eine begrenzte
Wartezeit bleibt als Hängerschutz. Gezielter Wiederholungslauf 6b: PASS (1 Test;
24 andere, bereits bestandene Race-Tests bewusst nicht erneut ausgeführt).
Normaler Fake-EAS-Publish ohne Barriere ist durch die neuen NativeProfile-E2E-Tests
abgedeckt. Keine Änderung an produktiver Lock-/Race-Logik.

Zusammen mit den Appprüfungen: **509 verschiedene Repository-Tests + 3 Replays PASS**.
ESLint auch für Release-Script und geänderte Test-Helfer: PASS, keine Fehler/Warnungen.
Ein früher zusätzlicher TypeScript-Prozess wurde ohne Diagnostik mit SIGTERM (143)
beendet; der anschließende vollständige Lauf mit Heap-Limit bestand.

Erneuter Live-Dry-Run mit dem ergänzten Guard: Runtime, Build-Profil, Environment,
Channel, Ancestry und freier Release-Lock bestanden. Einziger verbleibender Stop war
korrekt der noch uncommittete Worktree. Veröffentlichung ausschließlich über den
Wrapper, mit frischer Prüfung nach dem Commit und unmittelbar vor Publish.
