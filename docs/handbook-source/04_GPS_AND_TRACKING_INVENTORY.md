# 04 — GPS & Tracking Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme der GPS-Engine, Positionsquellen, TrackPoints, Filter/Statistik und des Recording-Lebenszyklus.

## Gefundene Dateien

- Native GPS-Engine: `modules/anyvo-precision-location/` (`index.ts`, `src/AnyvoPrecisionLocationModule.ts`, `src/AnyvoPrecisionLocation.types.ts`, iOS Swift + Android Kotlin).
- Client/Abstraktion: `features/tracking/native/precisionLocationClient.ts`, `features/tracking/utils/positionSource.ts`, `features/tracking/utils/positionStream.ts`.
- Hintergrund-GPS: `features/tracking/native/backgroundLocationTask.ts` (Task `anyvo-faehrte-bg`).
- Externes BLE-GPS: `lib/externalGps.ts`, `lib/trackRecorder.ts` (LEGACY, nur externer-GPS-Puffer; Task `anyvo-track-location`).
- Engine-Logik: `features/tracking/engine/*` — `trackingSessionEngine.ts` (`TrackingSessionEngine`, `TrackingSession`, `GpsKalman`), `trackingFilter.ts` (`TrackingFilter`, `evaluateTrackPoint`), `gpsQuality.ts`, `driftDetection.ts`, `stationaryDetection.ts`, `turnDetection.ts`, `objectPlacement.ts`, `startApproach.ts`, `trackingMath.ts`, `trackingStats.ts`, `types.ts`.
- Utils: `features/tracking/utils/gpsFilter.ts`, `steps.ts`, `searchFix.ts`, `angleClassify.ts`.
- Hooks: `features/tracking/hooks/useTrackRecorder.ts`, `useSearchRecorder.ts`, `useGpsWarmup.ts`, `useStartPointApproach.ts`, `useTrackRun.ts`, `useTrackRecording.ts`.
- Store/Persistenz/Service: siehe Bericht 05/07.

## Zentrale Typen

- `RawFix`, `TrackPointSource`, `TrackPointQuality ('excellent'|'good'|'poor'|'bad')`, `TrackPointStatus ('moving'|'slow_moving'|'stationary'|'drift'|'sharp_turn')`, `MotionState`, `GpsStats`, `EMPTY_GPS_STATS` (`features/tracking/engine/types.ts`).
- `TrackPointSample extends LatLng { accuracy, altitude, speed, heading, t(ms) }`, `StartAnchor` (`features/tracking/store/trackingStore.ts`).
- `PrecisionLocation`, `ProviderStatus`, `RawGnssSupportStatus`, `GnssMeasurementBatchAndroid`, `TemporaryFullAccuracyResult` (`modules/anyvo-precision-location/src/*.types.ts`).
- Persistenter DB-Typ `TrackPoint` (`types/tracking.ts`) — Legacy-Feldnamen (`lat/lng`, `seq`, `track_id`, `phase`).

## GPS-Engine (tatsächliche Schichtung)

1. **Natives Modul** `anyvo-precision-location`: High-Accuracy-Location; Android Raw GNSS (Satelliten/CN0), iOS Heading + `requestTemporaryFullAccuracy`. **Fällt intern automatisch auf `expo-location` zurück**, wenn das Modul nicht im Build ist (`modules/anyvo-precision-location/index.ts`, `isNativeModuleAvailable`).
2. **`precisionLocationClient`**: dünner Wrapper (start/stop/status + Listener) über das Modul.
3. **`positionSource`/`positionStream`**: zentrale Quelle „native → expo → external", liefert `PositionSourceSample` mit `source`-Debug-Metadaten.
4. **`backgroundLocationTask`**: getrennter Weg über `Location.startLocationUpdatesAsync` (Accuracy `BestForNavigation`, 1 s, Foreground-Service Android / iOS blaue Pille). Der Recorder registriert `setTrackFixHandler(loc => onFix(loc))` und wechselt beim Aufnahmestart vom Vordergrund-Warmup-Watch auf diesen Hintergrunddienst (`useTrackRecorder.ts` ~L498–511).
5. **Legacy externes BLE-GPS**: `lib/externalGps.ts` + `lib/trackRecorder.ts` (Puffer + Positions-Stream), bewusst vom Telefon-GPS getrennt.

## TrackPoints (tatsächlich)

- **Live-Speicher (Zustand):** `useTrackingStore.trackPoints` (gefiltert/geglättet), `rawTrackPoints`, `rejectedTrackPoints`, plus separate `searchTrackPoints` (Absuche) und Legacy `runPoints`.
- **Remote-Persistenz:** Tabelle `track_points` mit `session_id`, `latitude/longitude`, `accuracy/altitude/speed/heading`, `timestamp`, `point_type` (`'lay'`) — Bulk in Chunks à 500 (`trackService.finishTrackRecording`).
- **Offline-Persistenz:** SQLite `local_track_points` (`lib/localDb/migrations.ts`, V2) via `features/tracking/repositories/localTrackRepository.ts`.
- **Regel eingehalten:** TrackPoints tragen ausschließlich GPS; Gegenstände/Winkel sind separate `MarkerSample`/`track_markers` (nicht in TrackPoints) — konform zu `docs/faehrte/05_FAEHRTE.md`/`docs/04_GPS_ENGINE.md`.

## Filter, Qualität, Bewegung

- Qualitäts-Schwellen `PRECISION` + `getGpsQuality` (`engine/gpsQuality.ts`), `canStartRecording`, `shouldWarnPoorGps`.
- Ausreißer/Drift: `trackingFilter.ts` (`evaluateTrackPoint`, `RejectedReason`), `driftDetection.ts` (Sensor-/GPS-Stillstand), `stationaryDetection.ts`.
- Start-Stabilisierung: `StartAnchor` (Median guter Warmup-Fixes) + `startLockActive` verhindern, dass Warmup-Drift als Strecke zählt (`trackingStore.ts`).
- Ansatz-Automatik (Absuche-Start): `startApproach.ts` (`reduceApproach`, Radius 1.5 m, 2 s stabil, `APPROACH_HINT`).

## Recording-Lebenszyklus (Store `SessionStatus`)

`'laying' → 'laid' → 'resting' → 'searching' → 'completed' | 'cancelled'`. Nur `'searching'` löst Recovery aus. Übergänge persistieren teils sofort (`persistNow`) für Kill-Sicherheit. GPS läuft nur in `laying`/`searching`; in der Liegezeit nicht (konform Doku).

## Tatsächlicher Datenfluss

Warmup-Watch (`expo-location`) → beim Start Wechsel auf `backgroundLocationTask` → `onFix` → Engine-Filter → `useTrackingStore.addTrackPoint` (+ Raw/Rejected/Stats) → AsyncStorage-Snapshot (`trackPersist`) + SQLite (`localTrackRepository`). Abschluss → `trackService.finishTrackRecording` (Bulk `track_points` + Session-Update).

## Bestehende Abhängigkeiten

- `expo-location`, `expo-task-manager`, `expo-sensors`, eigenes Native-Modul, `react-native-maps` (Anzeige), `react-native-ble-plx` (extern).
- `app.json`: Hintergrund-Location-Berechtigungen (iOS `UIBackgroundModes`/`isIosBackgroundLocationEnabled`, Android Foreground-Service-Permissions).

## Aktuelle Regeln

- `docs/04_GPS_ENGINE.md`: GPS-Engine kennt **nur** Positionen — keine Gegenstände/Winkel/Teilstrecken; „Zweite GPS Engine verboten" (`docs/00_READ_FIRST.md`).

## Inkonsistenzen

- **Mehrere GPS-Eingangspfade** (natives Modul via `positionSource`, `backgroundLocationTask` via `startLocationUpdatesAsync`, externes BLE, Legacy `trackRecorder`). Ob das der Regel „genau eine GPS-Engine" entspricht, ist **[UNKLAR]** — funktional getrennt (Vordergrund-Warmup vs. Hintergrunddienst vs. extern), aber nicht durch eine einzige Fassade vereinheitlicht.
- Legacy `lib/trackRecorder.ts` bleibt aktiv für externes GPS, während `useTrackRecorder.ts` der aktive Telefon-GPS-Recorder ist — zwei Recorder-Begriffe.

## Offene Fragen

- Nutzt der aktive Recording-Pfad das native Precision-Modul auch für die **eigentlichen Fixes**, oder liefert `backgroundLocationTask` (reines `expo-location`) im Hintergrund die Fixes, während das Precision-Modul nur Warmup/Heading/Temp-Accuracy bedient? (Code deutet auf Letzteres — **muss verifiziert werden**.)
- Ist das native Modul in den Produktions-Builds enthalten oder läuft real der `expo-location`-Fallback? (Simulator-Screenshot in `AI_HANDOFF.md` zeigte „Expo Fallback".)

## Technische Risiken

- Divergenz zwischen Warmup-Quelle (Precision-Modul) und Aufnahmequelle (Hintergrunddienst) kann zu unterschiedlicher Genauigkeit/Charakteristik innerhalb einer Fährte führen.
- Hintergrund-GPS ist berechtigungsabhängig; ohne „Immer"-Recht bleibt nur der Vordergrund-Watch → Spurabbruch bei Display-aus.

## Mögliche spätere Verbesserungen

- Eine einzige dokumentierte GPS-Fassade (Vordergrund + Hintergrund + extern) als Single Source.
- Klarstellen/vereinheitlichen, welche Quelle die autoritativen Aufnahme-Fixes liefert.
