# Fährtenabsuche — 1-m-Hundeführerabstand + Off-Track-Erkennung

> Status: **Fundament umgesetzt & getestet (Teil A vollständig, Teil B Kern-Logik).**
> Verdrahtung von Off-Track in Recorder/UI/Voice/Haptik/Map + Session-Persistenz-Anzeige
> ist der nächste Increment und **release-gated durch Real-Device-Tests**
> (siehe `docs/manual-test/FAEHRTE_OFF_TRACK_REAL_DEVICE_TEST.md`).

## A. Bestehende Architektur (read-only Audit A–H)
- **A. 5/10 m definiert:** `features/tracking/utils/searchGeometry.ts` (`SearchHandlerDistanceM`, `DEFAULT_HANDLER_DISTANCE_M`, `isHandlerDistance`). Verbraucher: `store/trackingStore.ts`, `store/trackPersist.ts`, `app/track/run.tsx` (State + Sanitizer + Auswahl-UI), `hooks/useSearchRecorder.ts` (`handlerDistanceM`), `services/trackService.ts` (`searchHandlerDistanceM` in `track_data`).
- **B. dogProgressM:** `useSearchRecorder.ts` → `estimateDogProgressM(snap.progressM, handlerDistanceM, arc.total)`; `snap.progressM = maxCursorMRef` (Handler-Fortschritt).
- **C. Projektion:** `projectForward(p, line, cum, fromM, LOOKAHEAD_M=20, BACK_M=4)` in `useSearchRecorder.ts` — **windowed** um den Fortschritt, liefert `{ devM (seitl. Abstand), atM (Bogenlänge) }` über kumulierte Bogenlängen (`buildArc`).
- **D. Seitlicher Abstand vorhanden?** **Ja** — `proj.devM` ist der windowed Cross-Track-Abstand. Keine neue Geometrie nötig; Off-Track baut darauf auf.
- **E. GPS-accuracy:** `utils/searchFix.ts` `evaluateSearchFix` verwirft Fixes > 45 m accuracy bzw. > 12 m/s; akzeptierte Fixes treiben Linie/Progress. Puck-EMA-Glättung immer.
- **F. Winkel/GS/TS-Trigger:** über `dogProgressM` → `forwardDistanceFromDog` in `useTrackVoiceGuidance`/`useTrackHapticGuidance` (Verdrahtung in `run.tsx`); GS-„gefunden" per Nähe (`OBJECT_HIT_M`); Teilstrecken in `utils/trackSegments.ts`.
- **G. Voice/Haptik:** `hooks/useTrackVoiceGuidance.ts` (expo-speech) + `hooks/useTrackHapticGuidance.ts` (expo-haptics), konsumieren `dogProgressM`.
- **H. Gefahr für progressM bei seitl. Abweichung:** **gering & bereits abgesichert** — `projectForward` ist windowed (kein Sprung auf spätere Schenkel/Kreuzungen), und der Cursor rückt nur vor, wenn `dev <= ADVANCE_DEV_M`. Restrisiko innerhalb des Fensters → Off-Track friert den Fortschritt zusätzlich hart ein (`freezeProgress`).

→ **Keine grundlegende Architekturänderung nötig.** Bestehende Geometrie/Filter werden erweitert/wiederverwendet, keine zweite Engine.

## B. Geänderte/neue Dateien (dieser Increment)
- `features/tracking/utils/searchGeometry.ts` — Typ `1 | 5 | 10`, `HANDLER_DISTANCES_M` (Single Source of Truth), `isHandlerDistance` erweitert.
- `app/track/run.tsx` — Sanitizer nutzt `isHandlerDistance`; Auswahl-UI rendert aus `HANDLER_DISTANCES_M` (1/5/10).
- `features/tracking/utils/offTrack.ts` — **neu**: reine Off-Track-Logik.
- Tests: `utils/__tests__/searchGeometry.test.ts` (+1 m), `store/__tests__/searchHandlerDistance.test.ts` (+1 m), `utils/__tests__/offTrack.test.ts` (**neu**).

## C. 1-m-Integration
1 m ist vollwertig (kein Spezialfall). UI/Store/Persistenz/Recovery/Sanitizer/Tests leiten aus `HANDLER_DISTANCES_M = [1,5,10]` ab. Bestehende gespeicherte 5/10-Werte bleiben gültig; **Default unverändert 5 m**.

## D. Zentrale HandlerDistance-Typen
`SearchHandlerDistanceM = 1 | 5 | 10` + `HANDLER_DISTANCES_M` als einzige Quelle; keine verstreuten Magic Numbers mehr in `run.tsx`.

## E. dogProgress-Berechnung
Unverändert `estimateDogProgressM = clamp(handler + distance, 0..total)`. Winkel/GS/TS/Ende-Trigger funktionieren mit 1 m automatisch (nur der Abstand-Summand ändert sich). Endklemmung getestet.

## F. Cross-Track-Geometrie
Wiederverwendung von `projectForward().devM` (windowed) als `crossTrackM`. Kein globaler Nearest-Point; Parallel-/Kreuz-/Rückweg-Schenkel bleiben durch das Fortschrittsfenster stabil.

## G. GPS-Accuracy-Behandlung
`getOffTrackThreshold({accuracyM})` in `offTrack.ts`: `reliable = accuracy ≤ 20 m`; unzuverlässige Fixes eskalieren nicht (State gehalten). Zusammenspiel mit bestehendem `evaluateSearchFix` (≤ 45 m).

## H./I./J. Warn-/Off-Track-/Recovery-Schwelle
`warningM = max(3, accuracy·1.5)` · `offTrackM = warningM + 2` · `recoveryM = warningM·0.6`. Konstanten in `OFF_TRACK` (eine Quelle, per Tests belegt).

## K. Hysterese
`recoveryM < warningM` (Totzone) → kein Flattern; Entwarnung erst deutlich unter der Warngrenze.

## L. Consecutive-Fix-Regel (Debounce)
`WARN_CONSECUTIVE=2`, `OFF_CONSECUTIVE=3`, `RECOVER_CONSECUTIVE=3`. Einzelner Ausreißer → keine Transition (getestet).

## M. Trusted Progress
`stepOffTrack` liefert `freezeProgress` (true während bestätigtem `off_track`). Vorgesehene Recorder-Verdrahtung: `cursorMRef`/`maxCursorMRef` NICHT vorrücken solange `freezeProgress`; `lastTrustedProgressM = maxCursorMRef` bleibt Anker. **Rohspur (searchTrackPoints) läuft unverändert weiter** (Trennung RAW ↔ TRUSTED).

## N.–Q. Schutz Winkel / GS / Teilstrecken / Ende
Durch eingefrorenen Fortschritt (dogProgressM stagniert) feuern während `off_track` keine neuen forward-getriggerten Ereignisse; bei Recovery Wiederaufnahme ab `lastTrustedProgressM` ohne Trigger-Kaskade (kein Vorspringen). Bestehende, bereits ausgelöste Ereignisse bleiben.

## R. Raw Track während Abweichung
`addSearchPoint`/`enqueueSearchPoint` laufen unabhängig vom Off-Track-State → dokumentiert weiterhin den echten Weg des Hundeführers.

## S.–V. UI Warning / Off-track / Recovery / Map
**Noch nicht verdrahtet** (nächster Increment): kompakter Warn-Banner, deutlicher Off-Track-Hinweis (`Fährte verlassen`, „X m neben der Spur"), kurzer Recovery-Hinweis, optionale dezente Verbindungslinie auf der Karte (Geometrie außerhalb der Render-Schicht). Design: bestehendes ANYVO-Dark, Warnfarbe `C.warning`, Karte/Recording/Timer nicht verdeckend.

## W./X. Haptik / Voice
**Noch nicht verdrahtet**: bestehende Haptik/Voice nur auf State-Transition (WARNING/OFF_TRACK/RECOVERED), mit Cooldown; korrekte, fachlich richtige Formulierung „Du weichst von der Fährte ab." (nie „der Hund ist abgewichen").

## Y. Abweichungsstatistik
In `offTrack.ts` runtime/session-lokal enthalten: `events`, `offDurationMs` (+ `offTrackTotalDurationMs`), `maxDeviationM`. **Keine DB-Migration** — Persistenz in Session-Metadaten erst nach Freigabe (siehe AD).

## Z. i18n
1-m-Auswahl nutzt bestehende Keys (`track.searchHandlerDistanceLabel`, `track.searchHandlerDistanceOption` mit `meters`-Param) → 1 m automatisch inkl. Accessibility „Hundeführerabstand 1 Meter". Off-Track-Texte (DE/gsw/FR) folgen mit der UI-Verdrahtung.

## AA./AB. iOS / Android
Nutzt die bestehende `startPositionSource` (natives Precision-Modul + expo-Fallback), Accuracy-Werte, Haptik, Voice, Map identisch auf beiden Plattformen. Reine Geometrie plattformunabhängig.

## AC. Neue Permissions
**NEIN.** Keine neuen Permissions.

## AD. DB-Migration
**NEIN.** Keine Schema-/DB-Änderung. Off-Track-Statistik bleibt vorerst runtime/session-lokal.

## AE. Tests
`npx tsc --noEmit` 0 Errors; Tracking-Suite **31 Suites / 299 Tests PASS** (neu: `offTrack.test.ts`; +1-m in `searchGeometry`/`searchHandlerDistance`). Abgedeckt: 1-m-Akzeptanz/Recovery/Clamping/dogProgress; Off-Track-Schwellen, Debounce, Warning→Off-Eskalation, Accuracy-Gating, Hysterese, Recovery, freezeProgress, Statistik.

## AF./AG. iOS-/Android-Export
Für diesen Kern-Increment nicht erneut ausgeführt (reine Logik + bestehende UI-Erweiterung 1 m). Vor Release des Off-Track-UI-Increments: `expo export` iOS + Android.

## AH. Noch nötige Real-Device-Tests
Siehe Testplan. GPS-Geometrie/Haptik/Voice sind **nicht** im Simulator freigebbar → REAL-DEVICE-TEST REQUIRED.

## AI. Bekannte Grenzen
- Off-Track-UI/Voice/Haptik/Map + Recorder-`freezeProgress`-Verdrahtung noch offen (Increment 2, device-gated).
- Keine verlässliche Links/Rechts-Angabe (bewusst weggelassen).
- Statistik nur runtime (keine Persistenz ohne Freigabe).
