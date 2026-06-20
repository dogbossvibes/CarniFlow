# Precision Location — Phase 4 (Tracking-Engine-Integration)

Diese Phase baut die Fährten-Tracking-Logik als eigenständige, framework-agnostische
**Engine** unter `features/tracking/engine/` neu auf und verbindet sie mit der
nativen Precision-Quelle (`anyvo-precision-location`, mit `expo-location`-Fallback),
dem Aufnahme-Screen, dem Store und der Supabase-Speicherung.

Alle Engine-Bausteine sind reine, getestete Funktionen/Klassen
(`features/tracking/engine/__tests__/engine.test.ts`, `trackingMathStats.test.ts`).

---

## 1. Was Phase 4 implementiert

Engine-Module (`features/tracking/engine/`):

| Modul | Inhalt |
|---|---|
| `gpsQuality.ts` | `getGpsQuality`, `canStartRecording`, `shouldWarnPoorGps`, Labels/Messages, zentrale `PRECISION`-Schwellen |
| `trackingMath.ts` | `calculateDistanceMeters`, `calculateSpeedMps`, `calculateBearingDegrees`, `medianCoordinate` |
| `trackingFilter.ts` | `evaluateTrackPoint` (reine Bewertung) + `TrackingFilter` (hält raw/filtered/rejected, glättet) |
| `stationaryDetection.ts` | `isStationary` (Zeitfenster) + `updateStationaryState` (Zustandsautomat) |
| `driftDetection.ts` | `isDrift` (Filter-intern) + `detectDrift` (gewichtetes Confidence-Modell mit Heading/GNSS) |
| `turnDetection.ts` | `detectSharpTurn`, `findSharpTurns`, `signedTurnAt` |
| `objectPlacement.ts` | `placeTrackingObject` (Median-stabilisiert) + `stabilizedObjectPosition` |
| `trackingSessionEngine.ts` | `TrackingSessionEngine` (Low-Level-Pipeline) + `TrackingSession` (High-Level-Orchestrator) |
| `trackingStats.ts` | `TrackingStats` (Live-Zähler) + `computeSessionStats` (Session-Aggregat) |

UI-Komponenten (`features/tracking/components/`): `GpsQualityBadge`,
`TrackingStatusBadge`, `TrackLayerToggle`, `PrecisionDebugPanel`.

Persistenz: `track_engine_sessions` (Supabase, `TRACK_ENGINE_DATA_SETUP.sql`),
`saveTrackEngineData()` im `trackService`.

Zentrale Schwellen (`PRECISION` in `gpsQuality.ts`):

- Auto-Start ab `accuracy ≤ 15 m` (`READY_ACCURACY_M`), „sehr gut" ≤ 8 m.
- Linienpunkt verworfen ab `accuracy > 25 m` (`HARD_MAX_ACCURACY_M`).
- Tempo-Plausibilität `MAX_SPEED_MPS = 2.2` (~8 km/h).
- Stillstand: Radius 1,5 m über 4 s.
- Drift-Schutzfenster nach Objektsetzung: 3 s.
- Scharfer Winkel ab 45°.

---

## 2. Native Engine ↔ Fährtenaufnahme

Es gibt **zwei** Verdrahtungsstufen:

**a) Aktiv heute** — `useTrackRecording` → `positionStream` → `TrackingSessionEngine.ingest()`:
pro Fix entsteht ein Rohpunkt + (bei Annahme) ein gefusionierter Clean-Punkt; das
Ergebnis landet im `useTrackingStore` (`rawTrackPoints`, `trackPoints`,
`rejectedTrackPoints`, `gpsStats`, `motionStatus`). Quelle ist die native Engine,
sonst transparent `expo-location`.

**b) Vorbereitet** — `TrackingSession` (Orchestrator) kapselt den kompletten
Lebenszyklus und abonniert die nativen Events sauber:

```
initializeSession → startWarmup → startRecording
  handleIncomingLocationPoint / handleHeadingUpdate / handleGnssStatusUpdate
  placeObject
  pauseRecording / resumeRecording → stopRecording → getSessionStats
```

`TrackingSession` garantiert: keine doppelten Listener (subscribe() entfernt
vorher alte), kein Leak (stopRecording() entfernt alle), kein Crash bei fehlenden
Events (defensiv). Der Native-Client ist injizierbar (testbar ohne Native).
Diese Stufe ist implementiert + getestet, aber **noch nicht** an den Hook gebunden
(siehe *Bekannte Einschränkungen*).

---

## 3. Raw Track vs. Clean Track

- **Raw Track** (`rawTrackPoints`): jeder empfangene GPS-Fix, ungefiltert/ungeglättet.
  Zeigt das echte GPS-Rauschen/Drift.
- **Clean Track** (`trackPoints` / `filteredTrackPoints`): nur **akzeptierte**,
  geglättete Punkte — das ist die gespeicherte Fährtenlinie.
- **Rejected** (`rejectedTrackPoints`): Rohpunkte, die kein Linienpunkt wurden
  (zu ungenau, Sprung, Stillstand, Drift, …).

Auf der Karte steuert `TrackLayerToggle` (nur im Debug-Mode) die Auswahl
**Clean / Raw / Beide**; normale Nutzer sehen immer nur Clean.

---

## 4. Drift Shield (Drift-Schutz)

Zwei Mechanismen:

1. **Filter-Drift** (`isDrift`, in `evaluateTrackPoint`): Sensorik/GPS meldet
   Stillstand, die Position springt aber > 1,5 m → `DRIFT_DETECTED`, kein Linienpunkt.
2. **Confidence-Drift** (`detectDrift`): gewichtetes Modell mit Heading- und
   GNSS-Wissen über den reinen Filter hinaus. Signale (Auszug): Stillstand-aber-bewegt
   (0.35), Teleport > 5 m in < 2 s (0.25), schwaches Android-GNSS `usedInFix < 4`
   (0.25), unplausibles Tempo (0.20), Sprung (0.20), schlechte Genauigkeit (0.20).
   `confidence ≥ 0.5 ⇒ isDrift`, `reason` = dominantes Signal.
3. **Drift-Guard-Fenster**: nach `placeObject` werden 3 s lang **keine** neuen
   Linienpunkte angefügt (verhindert Zickzack durch Stillstand am Gegenstand).
   `TrackingFilter.add(fix, { suppressLinePoint })` routet solche Punkte als
   `DRIFT_GUARD` in `rejectedPoints`.

---

## 5. Stillstandserkennung

- `isStationary(recent, now)`: alle Rohpunkte im 4-s-Fenster liegen innerhalb 1,5 m
  **und** das Fenster ist gefüllt → Stillstand (zustandslos, für den Filter).
- `updateStationaryState(prev, point)`: laufender Automat `MOVING / SLOW_MOVING /
  STATIONARY`. Distanz < 1,5 m zum Anker startet/hält den `stationarySince`-Timer;
  ab 4 s → `STATIONARY`. Distanz > 3 m (auch kumulativ, da der Anker beim Verharren
  stehen bleibt) → `MOVING` + Timer-Reset.
- Während STATIONARY werden **keine** Clean-Punkte angefügt.

---

## 6. Winkelschutz (Fährtenwinkel)

Echte Fährtenwinkel sind Trainingsinformation und dürfen nicht „weichgeglättet"
(verrundet) werden.

- `detectSharpTurn(points, currentPoint)`: A=vorletzter, B=Scheitel, C=neu.
  Echter Winkel nur bei Richtungsänderung > 45° **und** Schenkel A–B > 2 m **und**
  B–C > 2 m **und** `accuracy(B) ≤ 15 m` **und** B/C nicht als Drift markiert.
- `TrackingFilter.smooth` lässt einen erkannten scharfen Winkel **roh** stehen
  (keine Glättung); sonst glättet es: `SLOW_MOVING` kräftig (`prev*0.7 + cur*0.3`),
  `MOVING` nur sehr leicht (`prev*0.15 + cur*0.85`).

---

## 7. Präzise Gegenstandsplatzierung

`placeTrackingObject({ type, label, recentGoodPoints, filteredTrackPoints })`:

- Nutzt **nie** den letzten (springenden) Rohfix.
- Filtert auf saubere Punkte: `accuracy ≤ 15 m`, nicht rejected, nicht drift.
- ≥ 3 gute Punkte → **Median** der letzten 5–10 (`source = "median_stabilized"`),
  sonst Fallback auf den letzten guten Punkt (`source = "last_good_point"`).
- Speichert `id, type, label, latitude, longitude, timestamp, accuracy, quality,
  source, trackPointIndex` und gibt zusätzlich `driftGuardUntil` (= now + 3 s) zurück.

---

## 8. Debug-Panel

`PrecisionDebugPanel` (nur im Debug-/Dev-Mode; sonst kompakte GPS-Anzeige) zeigt:
Engine (Native Precision / Expo Fallback), Plattform, Accuracy, GPS-Qualität,
Status (`GPS_WARMUP / MOVING / SLOW_MOVING / STATIONARY / DRIFT / GPS_POOR / …`),
Raw/Filtered/Rejected-Zähler + Rejection-Rate, letzter Reject-Grund, Geschwindigkeit,
Heading + Heading-Accuracy, Raw-GNSS, Android-GNSS (Satelliten/UsedInFix/CN0),
iOS (Precise Location, Heading), Warmup-Dauer, Start erlaubt.

Buttons: Layer **Raw/Clean/Beide**, **JSON-Export** (`buildDebugSnapshot` → Share),
**Einklappen**. Im Aufnahme-Screen schaltet der Bug-Button (`TrackLayerToggle`,
unten rechts) den Debug-Mode; rejected-Punkte erscheinen dann als kleine rote
Punkte auf der Karte.

---

## 9. Supabase-Speicherung (erweitert)

Migration `TRACK_ENGINE_DATA_SETUP.sql` (idempotent, additiv): neue **1:1-Tabelle**
`track_engine_sessions` (PK `session_id` → `training_sessions`, `on delete cascade`,
RLS „owner via session"). Bewusst **separate** Tabelle, damit
`getUserTrackSessions` (`select *`) nicht die großen jsonb-Blobs lädt.

Felder: `engine`, `platform`, `raw_gnss_available`, `average_accuracy`,
`best_accuracy`, `worst_accuracy`, `distance_raw_meters`, `distance_filtered_meters`,
`rejection_rate`, `gps_stats`, `objects`, `filtered_track_points`,
`raw_track_points`*, `rejected_points`*, `started_at`, `ended_at`.

`saveTrackEngineData()` (Upsert) wird best-effort in `useTrackRecording.finish()`
aufgerufen. *Die schweren Blobs (`raw_track_points`, `rejected_points`) werden nur
im Dev-Mode geschrieben (`includeHeavyBlobs: __DEV__`)* — Produktivdaten bleiben
schlank. Alte Fährten ohne Zeile bleiben voll lesbar (`getTrackSessionById` liefert
`engine: null`).

---

## 10. Testplan Feldtests

Voraussetzung: Dev-/Store-Build mit nativem Modul, Debug-Mode an.

1. **Warmup/Start**: Im Freien starten — Auto-Start erst bei „Bereit" (≤ 15 m).
   Unter Bäumen/Indoor: Start bleibt gesperrt bzw. nur manuell nach 15 s (Warnung).
2. **Clean vs. Raw**: Gerade Strecke (~50 m) gehen. Clean-Linie glatt, Raw zeigt
   Rauschen. Layer-Toggle Raw/Beide prüfen.
3. **Winkel**: Saubere 90°-Ecken legen. Im Clean-Track bleibt die Ecke spitz
   (nicht verrundet); Status zeigt kurz „Winkel erkannt".
4. **Stillstand**: 10 s still stehen → Status „Stillstand erkannt", keine neuen
   Clean-Punkte, Linie wächst nicht.
5. **Gegenstand**: Am Stillstandspunkt Gegenstand setzen → Marker liegt auf dem
   Median (nicht auf einem Ausreißer); danach 3 s kein Zickzack.
6. **Drift**: An Hauswand/dichtem Wald still stehen → Drift sollte als rejected
   markiert werden statt die Linie zu verzerren.
7. **Mock-Location** (Android Dev-Settings): wird verworfen (`MOCK_LOCATION`).
8. **Persistenz**: Fährte beenden, in Supabase `track_engine_sessions`-Zeile prüfen
   (Distanzen raw vs. filtered, rejection_rate, Accuracy-Werte; Blobs nur Dev).
9. **Lebenszyklus**: Pause/Weiter/Stop und erneutes Starten — keine doppelten
   Punkte, App stabil.

Pro Lauf notieren: Engine (Native/Fallback), Ø/Best/Worst-Accuracy, Rejection-Rate,
Auffälligkeiten (Drift, verrundete Winkel, falsche Marker).

---

## 11. Bekannte Einschränkungen

- **Orchestrator noch nicht verdrahtet**: `useTrackRecording` nutzt weiterhin den
  Low-Level-`TrackingSessionEngine.ingest()`, nicht `TrackingSession`. Deshalb
  fließen Heading-/GNSS-basierte `detectDrift`-Signale und `object_placed`-Status
  noch nicht in die Live-Aufnahme.
- **`raw_gnss_available` = null** und GNSS-Mittelwerte (`averageSatelliteCount`,
  `averageUsedInFixCount`, `averageCn0DbHz`) werden noch nicht persistiert — die
  Quelle (GNSS-Samples) liefert erst der Orchestrator.
- **`computeSessionStats` noch nicht im Finish**: `saveTrackEngineData` schreibt
  aktuell eine inline berechnete Teilmenge (Accuracy/Distanzen/Rejection-Rate).
  `stationaryDurationMs / driftCount / sharpTurnCount / gpsQualityDistribution`
  brauchen die Status-Timeline des Orchestrators.
- **Rejected-Reason pro Punkt** wird im Store nicht mitgeführt (nur die Rohposition);
  die rote Debug-Darstellung zeigt Position, nicht den Grund.
- **Offline-First**: `track_engine_sessions` wird (noch) nicht in der lokalen
  SQLite-Queue gepuffert; der Engine-Daten-Save ist best-effort online.
- **Glättung** ist absichtlich leicht; sehr verrauschtes GPS kann die Clean-Linie
  trotzdem leicht „zittern" lassen (Kompromiss zugunsten echter Winkel).

---

## 12. Was Phase 5 wäre

- `TrackingSession`-Orchestrator real an `useTrackRecording` + Store binden
  (native Events, Status-Timeline, Objekte mit `source`, GNSS/Heading-Drift live).
- `computeSessionStats(...)` am Session-Ende aufrufen und das **volle** Aggregat
  (inkl. Stillstandsdauer, Drift-/Winkel-Zähler, Qualitätsverteilung, GNSS-Mittel)
  in `track_engine_sessions` persistieren; `raw_gnss_available` füllen.
- Engine-Daten in die Offline-First-Sync-Queue aufnehmen (crash-/akkusicher).
- Rejected-Reasons pro Punkt führen und im Debug-Panel/Karte anzeigen.
- Externes BLE-GPS + Sensorfusion (Accelerometer) für robustere Stillstand-/
  Drift-Erkennung; vollwertiges 2D-Kalman mit Geschwindigkeit.
- Auswertungs-Screen: Raw/Clean/Rejected + Winkel/Objekte aus den gespeicherten
  Engine-Daten rekonstruieren.
