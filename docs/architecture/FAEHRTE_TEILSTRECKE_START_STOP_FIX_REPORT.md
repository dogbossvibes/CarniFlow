# FÄHRTE — Teilstrecke: Umstellung „Schrittzahl → Start/Stop" (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-27
**Grundlage:** [[FAEHRTE_TEILSTRECKE_START_STOP_ANALYSIS]]
**Bestehendes `TrackSegment`-Modell weiterverwendet. Keine neue Struktur, keine DB-Migration, keine neue GPS-Logik.**

## A. Geänderte Dateien
- `features/tracking/utils/trackSegments.ts` — neu `createActiveSegment`, `finalizeSegment`, `sanitizeRestoredSegments`; `buildTrackSegmentPolylines` um **aktive** TS erweitert; `analyzeTrackSegments`-Hinweise ohne „geplant".
- `app/track/legen.tsx` — TS-Button = Start/Stop-Toggle; Start/Stop-Handler; Schrittzahl-UI + Auto-Aktivierung entfernt; Panel-/Sheet-Anpassung; Auto-Close bei Fährtenende.
- `features/tracking/store/trackingStore.ts` — `restorePending` sanitisiert Segmente (Recovery).
- `features/tracking/utils/__tests__/trackSegmentStartStop.test.ts` — **neu** (16 Tests).
- `features/tracking/utils/__tests__/trackSegments.test.ts` — Analyse-Assertion an neue Formulierung angepasst.

## B. Entfernte Schrittzahl-UI
- „Anzahl Schritte"-Box (Stepper ±, `segmentSteps`, Default 10) aus dem Sheet **entfernt**.
- `startSegmentPlan`, `createPlannedSegment`-Aufruf, `plannedSegmentAnnouncement`, `SEGMENT_PREANNOUNCE_STEPS`-Offset und die **Schritt-Schwellen-Auto-Aktivierung** (Effekt) **entfernt**.
- Sheet-Titel „Teilstrecke hinzufügen" → „Teilstrecke starten"; verbleibend: Typ-Auswahl, Custom-Label, Voice-Toggle, Button „Jetzt starten".
- *(Die Util-Funktion `createPlannedSegment` bleibt exportiert, um bestehende Tests nicht zu schwächen — sie wird im Flow nicht mehr genutzt.)*

## C. Neue Startlogik (`startTrackSegment`)
Tippen auf **TS** (ohne aktive TS) → schlankes Sheet (Typ/Voice) → „Jetzt starten": `createActiveSegment` mit `status='active'`, `startTrackPointIndex = trackPoints.length-1`, `startCoordinate = currentPosition`, `startStep = metersToSteps(distanceMeters)`; `addSegment`. Guard: nur **eine** aktive TS; ohne gültigen TrackPoint/Position → kein Segment, kein Erfolgsfeedback.

## D. Neue Stoplogik (`stopTrackSegment`)
Tippen auf **TS** (mit aktiver TS) **oder** Panel „Stoppen" → `finalizeSegment`: `status='completed'`, `endTrackPointIndex = trackPoints.length-1`, `endCoordinate = currentPosition`, `endStep = metersToSteps(distanceMeters)`, `plannedLengthSteps = max(0, endStep-startStep)`.

## E. Berechnung startStep/endStep
Beide **abgeleitet** aus der real gelegten Distanz über die bestehende `metersToSteps(distanceMeters)`. Keine neue Schrittberechnung. Schrittzahl = **abgeleiteter** Wert (nicht mehr Eingabe).

## F. Recovery-Verhalten (App-Neustart)
`restorePending` (Store) wendet `sanitizeRestoredSegments` an: **genau eine** gültige aktive TS (valider `startTrackPointIndex`) bleibt aktiv → TS-Button zeigt „stoppen", Nutzer stoppt normal. Ungültige/mehrfach aktive → kontrolliert `cancelled` (+ `console.warn`), **nicht** stillschweigend verwendet, **nicht** auto-completed, **kein** neues Segment. Der Live-Store hält aktive Segmente ohnehin über die bestehende Persistenz.

## G. Verhalten beim Fährtenende mit aktiver TS
`onStop` schließt eine noch aktive TS **vor** `rec.finish` über `finalizeSegment` am letzten gültigen TrackPoint ab → **kein offenes `active`-Segment** in einer abgeschlossenen Fährte.

## H. Kartenrenderer
`buildTrackSegmentPolylines` bleibt Grundlage; **completed** wie bisher (`slice(startIndex, endIndex+1)`). **Neu:** `active`-Segmente werden live von `startTrackPointIndex` bis zum **aktuellen letzten TrackPoint** gerendert (Ende = `coords.length-1`). **Keine Geometrie-Duplizierung** — dieselbe `coords`-Spur wird geslict. Styling (`TRACK_SEGMENT_COLORS`, `strokeWidth 6`) unverändert.

## I. Smart-Analyse-Anpassung
`analyzeTrackSegments`: „Die geplanten X Schritte …" / „nach Y statt X Schritten beendet" **entfernt** → neutral „Teilstrecke {Label}: {actual} Schritte dokumentiert.". `count`/`types`/`markersInside`/`noFood`-Hinweise unverändert; deterministisch, **keine KI**.

## J. Mehrere Teilstrecken
Sequentiell beliebig viele (Start→Stop→…→Start→Stop). Nie mehr als **eine** aktive gleichzeitig (`activeOrPlannedSegment`-Guard blockiert zweiten Start). Alle completed bleiben als eigene farbige Polylines + persistiert.

## K. Tests
- **Neu** `trackSegmentStartStop.test.ts` (16): createActiveSegment (status/Index/Koordinate/startStep, 1-3), finalizeSegment (status/Index/Koordinate/plannedLengthSteps=end-start, 4-7, + Clamp), Guard zweite TS (8), mehrere completed als Polylines (9), aktive TS live gerendert (12), Recovery (10 + invalid→cancelled + max-1-active), JSON-Roundtrip.
- **Angepasst** `trackSegments.test.ts` (Analyse-Formulierung) — bestehende Tests **nicht geschwächt** (createPlannedSegment/Announcements/Polyline-Split unverändert grün).
- `tsc --noEmit` grün · ESLint geänderte Dateien **0 Errors** (6 vorbestehende Warnings) · `jest --runInBand` **352/352** (34 Suites).
- Randfälle Winkel/Gegenstand/Abriss innerhalb TS: Marker sind vom Segmentpfad entkoppelt (eigener `markers`-Store) — unberührt; Abriss-Test + Marker unverändert grün.

## L. iOS Export
`npx expo export --platform ios` → **erfolgreich** (Hermes-Bundle, exit 0).

## M. Android Export
`npx expo export --platform android` → **erfolgreich** (Hermes-Bundle, exit 0).

## N. DB-Migration? **NEIN**
`track_data.segments` (JSON) unverändert; `TrackSegment`-Struktur weiterverwendet.

## O. GPS-Logik verändert? **NEIN**
Keine neue GPS-Abfrage; TS nutzt `currentPosition`/`trackPoints` aus der laufenden Aufnahme (eine Quelle, eine TrackPoint-Spur).

## P. Andere Fährtenereignisse verändert? **NEIN**
Gegenstände, Winkel, OW/BW, Abriss, Startpunkt-GPS-Fix und Recorder unberührt — nur der Teilstrecken-Flow.

## Randfälle (Phase 12) — Abdeckung
1. TS-Start direkt nach Fährtenstart: Guard verlangt gültigen TrackPoint/Position (sonst `toast.startPointWait`). 2. Stop nach wenigen Punkten: endIndex = letzter Punkt. 3. Start ohne gültigen TrackPoint: blockiert. 4. Stop ohne aktive TS: no-op. 5. Zweiter Start während aktiv: blockiert (Toggle stoppt stattdessen). 6. Mehrere nacheinander: unterstützt. 7-9. Winkel/Gegenstand/Abriss innerhalb TS: unabhängige Marker, unberührt. 10. Pause während TS: Aufnahme pausiert, TS bleibt aktiv. 11. App-Neustart: Recovery (§F). 12. Fährtenende mit aktiver TS: Auto-Close (§G).
