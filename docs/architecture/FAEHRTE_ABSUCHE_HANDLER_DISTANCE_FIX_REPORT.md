# FÄHRTE — Absuche 5 m/10 m Hundeführer-Abstand (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-27
**Grundlage:** [[FAEHRTE_ABSUCHE_HANDLER_DISTANCE_ANALYSIS]]
**Keine DB-Migration, keine neue GPS-Engine, keine zweite Geometry-Engine. Kein Commit/Push.**

## A. Geänderte Dateien
- **neu** `features/tracking/utils/searchGeometry.ts` — reine Logik: `SearchHandlerDistanceM`, `estimateDogProgressM`, `forwardDistanceFromDog`, `pointAtDistance`, `DEFAULT_HANDLER_DISTANCE_M`.
- `features/tracking/hooks/useSearchRecorder.ts` — `handlerDistanceM`-Opt; exponiert `dogProgressM`, `trackLengthM`, `estimatedDogPosition`.
- `features/tracking/hooks/useTrackVoiceGuidance.ts` — Winkel/Abriss-Ansage auf Bogenlängendistanz (dogProgressM) statt Luftlinie.
- `features/tracking/hooks/useTrackHapticGuidance.ts` — dito für Gegenstand/Winkel; **gemeinsame** `forwardDistanceFromDog`.
- `app/track/run.tsx` — 5/10-Auswahl-UI (Arming), Verdrahtung, Persistenz, Recovery; Guidance/Segment-Ansagen auf `dogProgressM`.
- `features/tracking/store/trackingStore.ts` — State `searchHandlerDistanceM` + Setter + Snapshot + Restore.
- `features/tracking/store/trackPersist.ts` — `PendingTrack.searchHandlerDistanceM?`.
- `features/tracking/services/trackService.ts` — `finishTrackRun` mergt `track_data.searchHandlerDistanceM`.
- **neu** Tests: `searchGeometry.test.ts`, `searchHandlerDistance.test.ts`.

## B. 5/10-m-UI
Im Arming-Overlay (nach Startpunkt-Bestätigung, **vor** `beginSearchNow`): „Abstand zum Hund" mit zwei touch-großen Buttons **[5 m] [10 m]** (ausgewählter hervorgehoben, kein Dropdown), darüber der Startpunkt-Status, darunter „Jetzt starten". Default **5 m** vorausgewählt. **Alle** Startpfade (Auto-Start, „Jetzt starten", Override) nutzen denselben `searchHandlerDistanceM`-State → kein Pfad umgeht die Auswahl (immer ein gültiger Wert gesetzt).

## C. Speicherung / Recovery
- Auswahl → `store.setSearchHandlerDistanceM` → landet im `PendingTrack`-Snapshot (AsyncStorage) und wird zusätzlich beim Start in den Store gespiegelt.
- Recovery (`loadPending`/`restorePending`/`restoreSearchSession`): Wert aus Pending wiederhergestellt, **nicht** erneut gefragt; **Fallback 5 m** für ältere Sessions (im Code dokumentiert, `?? DEFAULT_HANDLER_DISTANCE_M`).
- Auswertung: `finishTrackRun` schreibt `track_data.searchHandlerDistanceM` (additiver JSON-Merge, **keine** Migration).

## D. handlerProgressM
Unverändert = `progressM` (bestehende Projektion auf die Polyline, `useSearchRecorder`). **Nicht** ersetzt/dupliziert/neu berechnet — Single Source of Truth.

## E. dogEstimatedProgressM
`estimateDogProgressM(progressM, searchHandlerDistanceM, arc.total) = min(arc.total, max(0,progressM)+distance)`. Reine Runtime-Ableitung.

## F. pointAtDistance
`pointAtDistance(points, cum, d)` in `searchGeometry.ts`: clamp 0..total, lineare Interpolation entlang der kumulierten Segmente → folgt der Fährte um Winkel; Null-/Degenerate-Fälle behandelt. Ergibt `estimatedDogPosition` (Runtime, **nicht** persistiert).

## G. Winkelansagen vorher/nachher
- **Vorher:** `distanceM(handlerPosition, winkelCoord)` — Luftlinie ab Handy.
- **Nachher:** `forwardDistanceFromDog(winkelArcM, dogProgressM)` — Bogenlänge vom virtuellen Hund; `winkelArcM = marker.distance_from_start`.

## H. Gegenstandsansagen vorher/nachher
- **Vorher:** Haptik über Luftlinie ab Handy zu Objekt-Koordinate.
- **Nachher:** `forwardDistanceFromDog(objektArcM, dogProgressM)` (Bogenlänge). Beispiel: Objekt 150 m, Handler 120 m, 10 m ⇒ dogProgress 130 ⇒ Ansage **20 m** (nicht 30 m).

## I. Abriss
Abriss ist ein `winkel`-Marker (`angleKind='abriss'`) → läuft über dieselbe Winkel-Ansage → hundebezogen.

## J. Teilstrecken
`searchSegmentAnnouncements` + `currentRunSegment` nutzen jetzt `metersToSteps(dogProgressM)` statt `progressM`. Segmentgeometrie/Start-Stop-Struktur unverändert.

## K. Endpunkt
Keine eigene Endpunkt-Sprachansage vorhanden (Ende ist manuell). `dogProgressM` ist auf `arc.total` geklemmt → falls künftig eine Endansage ergänzt wird, ist die Basis dog-korrekt. Keine negativen Restdistanzen (Ereignisse hinter dem Hund → `null`).

## L. Voice Guidance
`useTrackVoiceGuidance(dogProgressM, angles[{id,arcM,angleKind}], voiceOn)` — nächster Winkel VOR dem Hund, Distanz in Schritten.

## M. Haptic Guidance
`useTrackHapticGuidance(dogProgressM, angles[{id,arcM}], objects[{id,arcM}], enabled)` — **dieselbe** `forwardDistanceFromDog`-Distanz wie Voice (keine doppelte Logik).

## N. Verhalten an Winkeln
`estimateDogProgressM` + `pointAtDistance` rechnen **entlang der Bogenlänge** → 3 m vor 90°-Winkel + 10 m ⇒ Hund 7 m auf dem nächsten Schenkel (Test 6), **nicht** 10 m Luftlinie.

## O. Verhalten bei Selbstkreuzung
`eventArcM = marker.distance_from_start` (bei Platzierung aufgezeichnet, order-korrekt) → **keine** globale Koordinaten-Projektion → springt nicht auf einen früheren Kreuzungspunkt.

## P. Verhalten am Trackende
Endklemmung: `dogProgressM = min(arc.total, …)`; `estimatedDogPosition = Endpunkt`; Ereignisse hinter dem Hund liefern `null` (keine negative Ansage). Tests 3/14.

## Q. Smart Analyse
`searchHandlerDistanceM` als deterministischer Kontext in `track_data` (additiv). Keine bestehende Analyse rückwirkend verändert, **keine KI**. Virtuelle Hundeposition wird **nicht** als GPS-Spur gespeichert.

## R. GPS-Rohdaten verändert? **NEIN**
Aufgezeichnete `trackPoints`/`track_points`/Suchpunkte, Handler-Puck, Deviation, Score, „gefunden"-Erkennung unverändert. `dogProgressM`/`estimatedDogPosition` sind reine Runtime-Ableitungen.

## S. DB-Migration? **NEIN**
Nur additives JSON-Feld `track_data.searchHandlerDistanceM` + AsyncStorage-Feld.

## T. Tests
- `searchGeometry.test.ts` (10): dogProgress 5/10/clamp (1-3,14), pointAtDistance gerade/Winkel/„7 m auf nächstem Schenkel"/clamp/degenerate (4-6), forwardDistance 20 m/Voice==Haptik/hinter-dem-Hund (7-9), Default 5 (16).
- `searchHandlerDistance.test.ts` (6): Default 5, Setter, Recovery 10 (15), Fallback 5 (16), restoreSearchSession.
- Integrationsfälle 8/9/10/11/12 basieren auf `forwardDistanceFromDog`/`estimateDogProgressM` (getestet); Fälle 17-19 (kein Pfad ohne Auswahl) durch Default+geteilten State abgedeckt; Fall 20 (Selbstkreuzung) durch `distance_from_start`-Ansatz.
- `tsc --noEmit` grün · ESLint geänderte Dateien **0 Errors** (17 vorbestehende Warnings) · `jest --runInBand` **368/368** (36 Suites).

## U. iOS Export
`npx expo export --platform ios` → **erfolgreich** (exit 0).

## V. Android Export
`npx expo export --platform android` → **erfolgreich** (exit 0).

## W. Echter Gerätetest noch erforderlich?
**Ja, empfohlen.** Statische Verifikation (TS + 368 Tests + Export) bestanden; ein Feldtest (5 vs. 10 m, Winkel/Gegenstand/Abriss-Ansagezeitpunkte, Voice==Haptik am Gerät, Recovery mit gewähltem Abstand) sollte vor Release erfolgen. **Optionale Live-Anzeige** der `estimatedDogPosition` auf der Karte wurde **nicht** implementiert (Phase 15: nur bei minimalem Aufwand; ein eigener „geschätzte Hundeposition"-Marker wäre ein größerer UI-Umbau) — `estimatedDogPosition` wird bereits berechnet/exponiert und kann später additiv dargestellt werden.
