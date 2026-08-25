# FÄHRTE — Absuche: 5 m / 10 m Hundeführer-Abstand (Analyse)

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-27
**Kein Code geändert, keine Migration, kein Commit/Push.** Belege mit Datei:Zeile.
**Bezug:** [[FAEHRTE_STARTPOINT_GPS_ANALYSIS]] · [[FAEHRTE_TEILSTRECKE_START_STOP_ANALYSIS]]

## Kernaussage vorab
Der Absuche-Fortschritt läuft bereits **entlang der gelegten Polyline** (`progressM` = projizierte Bogenlänge; `arc.cum`/`arc.total` vorhanden). **Teilstrecken-Ansagen** nutzen bereits diesen Fortschritt. **Winkel-/Gegenstand-Ansagen** nutzen dagegen aktuell die **Luftlinie ab Handyposition**. Die 5/10-m-Umstellung ist daher primär: (1) `dogEstimatedProgressM` ableiten, (2) hundebezogene Ansagen auf **Bogenlänge** statt Luftlinie umstellen, (3) eine kleine „Punkt-bei-Bogenlänge"-Utility ergänzen. **Keine zweite Geometrie-Engine**, keine Verfälschung der Rohdaten.

---

## A. Aktueller Such-/Progress-Datenfluss
- Screen: `app/track/run.tsx` → `useSearchRecorder({ laidPoints, laidObjects, level, sessionId })` (`run.tsx:92`).
- GPS-Quelle: `positionSource` (nativ, wie Legen) → geglättete Handyposition `sm` (EMA) (`useSearchRecorder.ts:272ff`).
- **Bogenlängen der Soll-Fährte:** `buildArc(laidPoints)` → `arc.cum[]` (kumulativ), `arc.total` (= Track-Länge) (`useSearchRecorder.ts:84-88, 162`).
- **Projektion + Fortschritt:** `projectForward(sm, laidPoints, arc.cum, cursorM, LOOKAHEAD_M=20, BACK_M=4)` (`:94-121, 287`) → `{ devM, atM }`. Der Fortschritt wird als **monoton steigender** Cursor geführt: `progressM = maxCursorMRef.current` (`:219`), Vorrücken nur bei Abweichung < `ADVANCE_DEV_M=12`.
- Exponiert: `SearchRecorder` mit `position`, `deviationM`, `onTrack`, `distanceM`, **`progressM`**, `score`, `accuracy` (`:425-427`).

## B. Aktuelle Distanzberechnung (je Ereignis)
| Ereignis | Quelle heute | Basis |
|---|---|---|
| **Fortschritt/Score/Abweichung** | `projectForward` → `progressM`/`devM` | **entlang Fährte** (Handler-Projektion) |
| **Teilstrecke** (Ansage/aktuelle TS) | `searchSegmentAnnouncements({ currentStep: metersToSteps(s.progressM) })`; `currentRunSegment` via `metersToSteps(s.progressM)` (`run.tsx:329-346`) | **entlang Fährte** (Handler-Progress) |
| **Winkel/Abriss** (Voice) | `useTrackVoiceGuidance(curPos, guidanceAngles)` → `distanceM(position, {lat,lng})` (`useTrackVoiceGuidance.ts:50`) | **Luftlinie ab Handyposition** |
| **Winkel/Gegenstand** (Haptik) | `useTrackHapticGuidance(curPos, angles, objects)` → `distanceM(position, …)` (`useTrackHapticGuidance.ts:50,55`) | **Luftlinie ab Handyposition** |
| **Gegenstand „gefunden"** | `laidObjects.forEach` Distanz `sm`→Objekt < `OBJECT_HIT_M=2.5` (`useSearchRecorder.ts:321`) | **Handynähe (physisch)** |
| **Abriss/Break** | Abweichung `devM` > `BREAK_THRESHOLD_M=6` für 4 s (`:305`) | Handler-Abweichung |
| **Endpunkt** | **keine Sprachansage** (Ende manuell via `handleFinish`); nur Metrik `distanceM` | — |

## C. Aktuelle Ansage-Logik
- Winkel/Abriss (`useTrackVoiceGuidance`): kündigt den **nächsten, geometrisch nächsten** noch nicht angesagten Winkel an, wenn Luftlinie ≤ `ANNOUNCE_AHEAD_M=6 m`, Distanz in Schritten (`/STEP_M=0.75`), Entprellung 3,5 s.
- Gegenstand/Winkel (`useTrackHapticGuidance`): Vibration bei Nähe (Luftlinie).
- Teilstrecke (`searchSegmentAnnouncements`, `trackSegments.ts`): Vorankündigung/Start/Ende über `startStep`/`endStep` vs. `currentStep` (Handler-Progress).

## D. Vorhandene Polyline-/Projection-Utilities (wiederverwendbar)
- `lib/trackGuidance.ts`: `distanceM` (Haversine), `project` (lokale Meter-Ebene), `deviationFromTrack`, `nearestArticleDist`, `resample` (kumulative Distanz), `detectCorners`, `cornerLabel`.
- `useSearchRecorder.ts`: `buildArc` (kumulative Bogenlängen), **`projectForward`** (Position → Bogenlänge `atM` + Abweichung).
- **Fehlt:** eine geo-Utility „**Koordinate bei Bogenlänge d**" (Polyline + `cum` → LatLng). `TrackSketch.pointAt` ist nur Screen-Space (normalisiert), **nicht** geo → nicht wiederverwendbar. ⇒ kleine neue Hilfsfunktion nötig (reine Interpolation über `cum`, **keine** neue Engine).

## E. Empfohlene Berechnung `handlerProgressM`
**Bereits vorhanden:** `handlerProgressM = progressM` (= `maxCursorMRef`, projizierte Bogenlänge des Handys entlang der Soll-Fährte). Keine Neuberechnung nötig.

## F. Empfohlene Berechnung `dogEstimatedProgressM`
Runtime, in `useSearchRecorder` (aus vorhandenen Werten):
```
dogEstimatedProgressM = min(arc.total, handlerProgressM + searchHandlerDistanceM)
```
`searchHandlerDistanceM ∈ {5,10}`. Am Fährtenende geklemmt (`arc.total`). Rein abgeleitet — **keine** gespeicherte Verschiebung.

## G. Empfohlene `estimatedDogPosition`
Koordinate **entlang der Polyline** bei Bogenlänge `dogEstimatedProgressM` (folgt Winkeln!):
```
estimatedDogPosition = pointAtDistance(laidPoints, arc.cum, dogEstimatedProgressM)
```
Neue kleine Utility `pointAtDistance(line, cum, d)`: Segment `i` mit `cum[i-1] ≤ d ≤ cum[i]` finden, linear zwischen `line[i-1]`/`line[i]` interpolieren.
**Phase-5-Beispiel** (Handy 3 m vor 90°-Winkel, Abstand 10 m): `dogProgress = cornerArc − 3 + 10 = cornerArc + 7` → `pointAtDistance` liefert einen Punkt **7 m auf dem nächsten Schenkel** hinter dem Winkel (nicht 10 m Luftlinie). ✅ Für Karte optional; für Ansagen wird direkt mit Bogenlängen gerechnet (siehe H).

## H. Betroffene Ereignisse/Ansagen (→ hundebezogen, entlang Fährte)
Grundprinzip: jedes hundebezogene Ereignis bekommt eine **Bogenlängen-Position** `eventArcM` (durch Projektion seiner Koordinate auf die Soll-Fährte bzw. für Marker: nächster `laidPoints`-Index → `cum[idx]`). Ansage-Distanz = `eventArcM − dogEstimatedProgressM` (nur wenn ≥ 0 = noch vor dem Hund).

| Ansage | Umstellung |
|---|---|
| Nächster **Gegenstand** | Distanz = `objArcM − dogProgress` (statt Luftlinie ab Handy) |
| **Winkel/Spitzwinkel** | `angleArcM − dogProgress` |
| **Abriss** | `abrissArcM − dogProgress` |
| **Teilstrecken-Anfang/-Ende** | `searchSegmentAnnouncements({ currentStep: metersToSteps(dogEstimatedProgressM) })` statt `progressM` |
| **Endpunkt** (neu, optional) | `arc.total − dogProgress` |

**Weiterhin handlerbasiert (nicht hundebezogen):** Live-Puck/Karte, `deviationM`/`onTrack`, Break/Abriss-**Erkennung** (Handler-Abweichung), Score, **Objekt-„gefunden"-Erkennung** (physische Handynähe `OBJECT_HIT_M`). *(Hinweis: der Hund erreicht ein Objekt vor dem Handler; ob „gefunden" künftig hund- statt handybasiert erkannt werden soll, ist eine Produktentscheidung — hier NICHT geändert.)*

## I. Einbaupunkt für die 5/10-m-Auswahl
`run.tsx`, **Arming-Overlay** (nach Startpunkt-Bestätigung, vor `beginSearchNow`): Segmented-Control „Abstand zum Hund [5 m] [10 m]" oberhalb von „Jetzt starten".
- State `searchHandlerDistanceM` (Default z. B. 10) → an `useSearchRecorder` übergeben.
- **Auto-Start** (`approach.armed → beginSearchNow('automatic')`) UND **manueller „Jetzt starten"** (`handleManualStart`) nutzen denselben State ⇒ die Auswahl wird nie umgangen (immer ein gültiger Wert gesetzt, sichtbar markiert).
- Auswahl steht damit **vor** Beginn der Suchphase fest.

## J. Recovery / Persistenz
- **PendingTrack** (`trackPersist.ts`, AsyncStorage): optionales Feld `searchHandlerDistanceM?` ergänzen → Recovery (`run.tsx` `loadPending`/`decideRecovery`/`resumeSearch`) stellt denselben Abstand wieder her.
- **`training_sessions.track_data`** (JSON, via `trackService`): `track_data.searchHandlerDistanceM` mitspeichern → spätere Auswertung erkennt 5 vs. 10 m. **Keine DB-Migration** (JSON-Feld).
- Recovery-Regel: beim Fortsetzen den persistierten Wert lesen; fehlt er (Alt-Session) → Default 10 m, kontrolliert.

## K. Smart-Analyse-Auswirkungen
- `analyzeTrackSegments`/Insights (`app/track/[id].tsx`) können `searchHandlerDistanceM` als **deterministische Kontextinformation** erhalten (z. B. „Absuche mit 10 m Abstand"). **Additiv**, keine bestehende Analyse ungeprüft ändern, **keine KI**.
- Distanzbezogene Auswertungen (Gegenstand-Trefferdistanzen etc.) sollten dokumentieren, dass sie hund- vs. handybasiert sind, um Konsistenz zu wahren.

## L. Notwendige Dateien für Minimalimplementierung
1. `app/track/run.tsx` — 5/10-Auswahl-UI im Arming, State, an Recorder übergeben, bei Start persistieren; Recovery-Wert lesen.
2. `features/tracking/hooks/useSearchRecorder.ts` — `searchHandlerDistanceM` als Opt; `dogEstimatedProgressM` + optional `estimatedDogPosition` berechnen/exponieren; Event-Bogenlängen bereitstellen.
3. `lib/trackGuidance.ts` — neue Utility `pointAtDistance(line, cum, d)` (+ ggf. `arcOfNearestPoint`).
4. `features/tracking/hooks/useTrackVoiceGuidance.ts` — Winkel/Abriss-Distanz auf `eventArc − dogProgress` umstellen (Eingabe: dogProgress + Event-Bogenlängen statt Handyposition).
5. `features/tracking/hooks/useTrackHapticGuidance.ts` — analog für Gegenstand/Winkel.
6. `features/tracking/utils/trackSegments.ts` — Aufrufer übergibt `metersToSteps(dogEstimatedProgressM)` (Funktion selbst unverändert).
7. `features/tracking/store/trackPersist.ts` — `PendingTrack.searchHandlerDistanceM?`.
8. `features/tracking/services/trackService.ts` — `track_data.searchHandlerDistanceM` schreiben/lesen.

## M. Risiken
- **Marker→Bogenlänge**-Zuordnung: bei stark verrauschten/selbstschneidenden Fährten kann der „nächste Punkt" mehrdeutig sein → Projektion innerhalb eines Vorwärtsfensters (wie `projectForward`) statt global nächstem Punkt verwenden.
- **Fensterbreite** `LOOKAHEAD_M=20`: betrifft nur die Handler-Projektion; Event-Bogenlängen werden unabhängig davon berechnet → dogProgress kann > Fenster liegen (ok).
- **Ende:** `dogProgress` an `arc.total` klemmen; Ereignisse hinter dem Hund (`eventArc − dogProgress < 0`) nicht ansagen.
- **„Gefunden"-Semantik:** bleibt vorerst handybasiert → Hund erreicht Objekt früher; bewusst als Produktentscheidung offen lassen.
- **Rohdaten:** strikt trennen — nur `handlerPosition` wird aufgezeichnet/persistiert; `dogEstimatedProgressM`/`estimatedDogPosition` sind **Runtime-Ableitungen** (nicht speichern als Geometrie).
- **Recovery-Reihenfolge:** `searchHandlerDistanceM` muss vor dem ersten Ansage-Tick gesetzt sein (aus Pending laden, bevor `useSearchRecorder` rechnet).
- **UI-Guard:** sicherstellen, dass weder Auto-Start noch „Jetzt starten" ohne gesetzten Abstand startet (Default deckt ab).
