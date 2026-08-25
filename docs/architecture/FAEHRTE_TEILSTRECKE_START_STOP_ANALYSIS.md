# FÄHRTE — Teilstrecke (TS): Analyse Umstellung „Schrittzahl → Start/Stop"

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-27
**Kein Code geändert, keine Migration, kein Commit/Push.** Belege mit Datei:Zeile.
**Bezug:** [[P0-03_TRACK_DOMAIN_REPORT]] · [[P0-06_OFFLINE_TRUTH_REPORT]]

## Kernaussage vorab
Das **Datenmodell unterstützt Start/Stop bereits** — `TrackSegment` trägt `startTrackPointIndex`/`endTrackPointIndex`, `startCoordinate`/`endCoordinate`, `startedAt`/`completedAt` und `status: 'active'|'completed'`. Der Kartenrenderer slict **die eine bestehende TrackPoint-Spur** zwischen diesen Indizes (keine Geometrie-Duplizierung). **Nur der Erzeugungs-/Aktivierungspfad ist schrittzahlbasiert.** ⇒ **Kein DB-Umbau, keine Migration**; Minimaländerung = Lifecycle (Plan+Auto-Aktivierung → explizit Start/Stop).

---

## 1–5. Aktueller Datenfluss (Antworten auf Fragen 1–5)

1. **TS-Button:** `app/track/legen.tsx:833-839` (Steuerungsleiste, Label „TS", Icon `trail-sign-outline`) → `onPress={openSegmentSheet}`.
2. **Ausgelöste Funktion:** `openSegmentSheet` (`legen.tsx:394`). Existiert bereits eine aktive/geplante TS → Alert „Aktive Teilstrecke" (ansehen/beenden/abbrechen). Sonst öffnet das BottomSheet `segmentSheet`.
3. **Schrittzahl-Abfrage:** im BottomSheet — State `segmentSteps` (`legen.tsx:131`, Default `SEGMENT_DEFAULT_STEPS=10`), Stepper ±, `clampSegmentSteps` (1–500). Zusätzlich Typ-Auswahl (`no_food`, `low_food`, …), Custom-Label, Voice-Toggle.
4. **Segment-Erzeugung:** `startSegmentPlan` (`legen.tsx:424`) → `createPlannedSegment({ currentStep: metersToSteps(distance), plannedLengthSteps: segmentSteps, … })` (`trackSegments.ts:145`). Ergebnis: `status='planned'`, `startStep = round(currentStep) + preannounce(3)`, `endStep = startStep + plannedLengthSteps`. Danach **Auto-Aktivierung** per Schritt-Schwelle (`legen.tsx:448-470`): sobald `metersToSteps(distance) ≥ startStep` → `status='active'` (+ `startCoordinate`, `startTrackPointIndex`, `startedAt`); sobald `≥ endStep` → `status='completed'` (+ `endCoordinate`, `endTrackPointIndex`, `completedAt`). Manuell vorzeitig beenden: `completeActiveSegmentNow` (`legen.tsx:477`); abbrechen: `cancelActiveSegment` (`legen.tsx:492`).
5. **Datenstruktur:** `TrackSegment` (`features/tracking/utils/trackSegments.ts:17-38`).

## 6–7. Segmentmodell & Referenzen

```ts
interface TrackSegment {
  id; dogId; trackSessionId;
  type; customLabel?;
  plannedLengthSteps; startStep; endStep;              // SCHRITT-basiert (aktueller Plan)
  startCoordinate; endCoordinate;                       // LatLng | null
  startTrackPointIndex?; endTrackPointIndex?;           // Index in die TrackPoint-Spur
  startedAt; completedAt; status;                       // 'planned'|'active'|'completed'|'cancelled'
  voiceEnabled; createdAt; updatedAt; notes?; colorToken?;
}
```
- **`segmentStart`/`segmentEnd`/`partial`/`section`:** existieren **nicht** als eigene Felder/Typen — es gibt nur `startStep`/`endStep`, `start/endCoordinate`, `start/endTrackPointIndex`.
- **Frage 7 — Referenzierung:** JA, bereits über **TrackPoint-Indizes** (`startTrackPointIndex`/`endTrackPointIndex`) mit **Koordinaten-Fallback** (`nearestPointIndex`, `indexForSegmentBoundary`, `trackSegments.ts:213-234`). Diese Indizes werden aktuell **bei der Auto-Aktivierung** gesetzt (`legen.tsx:454-467`).

## 8–9. Kartenrenderer & Styling

- **Renderer:** `buildTrackSegmentPolylines(points, segments)` (`trackSegments.ts:241-278`) → nur **completed** Segmente; `indexForSegmentBoundary` liefert Start/End-Index (direkt oder nächster Punkt zur Koordinate); **`coords.slice(start, end+1)` aus der EINEN `layPoints`-Spur** → farbige Segment-Polyline, dazwischen „normal"-Teile. **Keine doppelte Geometrie.**
- **Einbindung:** `TrackingMap` `parts = useMemo(() => buildTrackSegmentPolylines(layPoints, segments), [layPoints, segments])` (`TrackingMap.tsx:104-105`), gerendert als `<Polyline>` (`:177-182`): Segment = `strokeWidth 6`, `zIndex 3`; normal = 4.
- **Styling vorhanden:** `TRACK_SEGMENT_COLORS` je Typ (`trackSegments.ts:75`). ✅ Für Start/Stop **unverändert nutzbar** — Rendering hängt an Indizes/`status='completed'`, **nicht** an `plannedLengthSteps`.

## 10. Offline / Recovery
- **Store:** `segments` in `trackingStore` (`:75,153`), Aktionen `addSegment`/`updateSegment` (`:228-231`), jeweils mit `persistNow`.
- **Snapshot (AsyncStorage):** `PendingTrack.segments` (`trackPersist.ts`), Teil des Lege-Snapshots (`trackingStore.ts:181`).
- **Supabase:** `training_sessions.track_data.segments` (JSON) via `finishTrackRecording` (`trackService.ts:156`).
- **Recovery:** `restore*`-Pfade setzen `segments: p.segments ?? []` (`trackingStore.ts:265,300`); Detail/Logbuch lesen via `coerceTrackSegments(track_data.segments)` (`[id].tsx:70`, `historie.tsx:124`).
- **App-Neustart während aktiver TS:** ein `status='active'` (oder `'planned'`) Segment **bleibt** im Snapshot erhalten. Aktuell wird es bei Wiederaufnahme über die Schritt-Schwelle weiter/fertig aktiviert. Bei Start/Stop gibt es **keine** Schwelle mehr → **es braucht eine explizite Regel** (siehe §Root Cause / Empfehlung), damit ein „active"-Segment nach Neustart nicht ewig offen bleibt.

## 11. Nutzung beim Absuchen
- `run.tsx` übernimmt `segments` aus dem Lege-Snapshot (`run.tsx:82,92`).
- **Sprachführung:** `searchSegmentAnnouncements` (`trackSegments.ts:283`) nutzt `startStep`/`endStep` (Vorankündigung/Start/Ende) — `run.tsx:328-340`.
- **Aktuelle Teilstrecke:** `currentRunSegment` = completed-Segment mit `step ∈ [startStep, endStep)` (`run.tsx:342-344`), Anzeige „Noch X Schritte".
- ⇒ Absuche hängt an `startStep`/`endStep`. Bei Start/Stop müssen diese weiter gesetzt werden — als **tatsächliche** Schrittposition bei Start/Stop (aus `metersToSteps(distance)`), dann funktioniert die Absuche unverändert.

## 12. Smart-Analyse-Abhängigkeiten
- **Nur clientseitig:** `analyzeTrackSegments` (`trackSegments.ts:329`) in `app/track/[id].tsx:74` — nutzt `plannedLengthSteps` vs. `actualSegmentSteps = endStep - startStep` für Hinweise („geplante X vs. nach Y beendet") und `count`/`types`. `markersInside` nutzt `startStep*STEP_LENGTH_M … endStep*STEP_LENGTH_M`.
- **Keine** Server-/Edge-/AI-Abhängigkeit auf Segmente (`grep segment features/ai supabase/functions` → **keine Treffer**).
- ⇒ Bei Start/Stop ist `plannedLengthSteps` gegenstandslos; die „geplant vs. tatsächlich"-Hinweise werden trivial (planned==actual). **`analyzeTrackSegments` braucht eine kleine Anpassung** (Hinweistexte), nicht die Zählung/Geometrie.

## 13. Schrittzahl anderswo fachlich benötigt?
- `metersToSteps`/`STEP_LENGTH_M` (`utils/steps.ts`) ist **allgemein** (Distanz-Anzeige „Schr.", `legen.tsx:534`, Analyse, `markersInside`). Segment-`startStep`/`endStep` werden von **Absuche-Ansagen** und **Analyse** gebraucht.
- ⇒ Schrittzahl bleibt als **abgeleiteter** Wert nötig (aus tatsächlicher Distanz bei Start/Stop). Nur die **vorherige Eingabe** entfällt.

## 14. iOS / Android
Der gesamte TS-Pfad ist **reines JS/React** (Store, `trackSegments.ts`, `TrackingMap`-Polylines, expo). Keine plattformspezifische Segmentlogik → Umstellung ist plattformübergreifend identisch. (Karten-Rendering via `react-native-maps` `<Polyline>` auf beiden Plattformen.)

---

## Root Cause / Umbauaufwand
**Kein Fehler** — bewusste Design-Umstellung. Der schrittzahlbasierte **Plan** (`plannedLengthSteps` → `startStep=+preannounce`, `endStep=+length`, Auto-Aktivierung über Schritt-Schwelle) soll durch **explizites Start/Stop** ersetzt werden. Da Indizes/Koordinaten/`status` bereits existieren und Renderer/Persistenz/Absuche daran hängen, ist der Umbau **klein und lokal** (Lifecycle + UI), **ohne** Modell-/DB-Änderung.

**Betroffen (Änderung):** `app/track/legen.tsx` (Handler + UI), `features/tracking/utils/trackSegments.ts` (Erzeugung/Analyse-Hinweise). **Nur leicht/geprüft:** `run.tsx` (Ansagen bleiben, wenn `startStep`/`endStep` gesetzt werden), `[id].tsx` (`analyzeTrackSegments`-Hinweise). **Unverändert:** `TrackingMap`, `trackingStore`-Struktur, `trackService`/`trackPersist` (JSON), `track_data.segments`.

---

## Konkrete empfohlene Minimaländerung (nur Vorschlag, nicht umgesetzt)

1. **TS-Button = Toggle:** kein Sheet mit Schrittzahl. `activeOrPlannedSegment(segments)` bestimmt Beschriftung „TS starten" / „TS stoppen".
   *(Typ/Voice/Custom-Label optional beim Start abfragen — kann als schlankes Sheet ohne Schritt-Stepper bleiben.)*
2. **„TS starten"** → neues `TrackSegment`:
   - `status: 'active'`, `startedAt: now`
   - `startTrackPointIndex = trackPoints.length - 1`, `startCoordinate = currentPosition`
   - `startStep = metersToSteps(distanceMeters)` (tatsächliche Position, **ohne** Preannounce-Offset)
   - `plannedLengthSteps: 0` (bzw. Feld ignorieren), `endStep = startStep` vorläufig.
   - Aufnahme läuft unverändert weiter (eine GPS-Quelle, eine TrackPoint-Spur).
3. **„TS stoppen"** → `updateSegment(active.id, …)`:
   - `status: 'completed'`, `completedAt: now`
   - `endTrackPointIndex = trackPoints.length - 1`, `endCoordinate = currentPosition`
   - `endStep = metersToSteps(distanceMeters)`; `plannedLengthSteps = endStep - startStep` (⇒ Analyse „planned==actual").
4. **Entfernen:** `segmentSteps`-Stepper-UI, `createPlannedSegment`-Preannounce-Offset, die **Schritt-Schwellen-Auto-Aktivierung** (`legen.tsx:448-470`).
5. **Überschneidung verhindern:** bestehenden Guard behalten — `activeOrPlannedSegment` erlaubt nur **eine** offene TS; „TS starten" ist gesperrt, solange eine aktiv ist. Mehrere **sequentielle** TS bleiben möglich (jeweils Start→Stop). ✅
6. **App-Neustart mit aktiver TS:** Regel festlegen (Produktentscheidung):
   (a) `active` bleibt erhalten → Nutzer stoppt manuell; **oder**
   (b) beim Restore ohne fortsetzbare Lege-Session `active → completed` am letzten TrackPoint (`endTrackPointIndex = trackPoints.length-1`).
   *(Empfehlung: (a), da die Lege-Session weiterläuft; (b) nur als Sicherheitsnetz.)*
7. **Live-Anzeige (legen)** anpassen: statt „Noch X / plannedLengthSteps" → „aktiv seit … · +Δ Schritte/Distanz" (kein Zielwert).
8. **Absuche/Analyse** unverändert lassen — funktionieren, sobald `startStep`/`endStep` als tatsächliche Positionen gesetzt sind; nur `analyzeTrackSegments`-Hinweise („geplant vs. tatsächlich") entschärfen.

**Nicht nötig:** DB-Migration, neue Tabelle/Feld, zweite GPS-Aufzeichnung, Geometrie-Kopie. TrackPoints bleiben Single Source of Truth; die TS referenziert nur Start/Ende (Index + Koordinate).
