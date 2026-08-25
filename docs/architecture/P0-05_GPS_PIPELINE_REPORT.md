# P0-05 — GPS Pipeline Report

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Bezug:** [[P0-02_TRACKING_LEGACY_REPORT]] · [[P0-06_OFFLINE_TRUTH_REPORT]]

## Beteiligte Dateien
`features/tracking/utils/positionSource.ts`, `utils/positionStream.ts`, `native/precisionLocationClient.ts`, `native/backgroundLocationTask.ts`, `hooks/useTrackRecorder.ts`, `hooks/useSearchRecorder.ts`, `hooks/useStartPointApproach.ts`, `lib/trackRecorder.ts` (BLE), `modules/anyvo-precision-location` (natives Modul), `utils/gpsFilter.ts`, `engine/*`.
**Legacy/Dead:** `hooks/useTrackRecording.ts` = **DEAD** (nirgends referenziert) und `hooks/useTrackRun.ts` = **DEAD** (nur aus einem `trackingStore.ts`-Kommentar erwähnt, kein Screen). Es existieren also **je zwei** Lege-/Absuche-Recorder-Implementierungen — aktiv sind nur `useTrackRecorder` (Legen, `app/track/legen.tsx`) und `useSearchRecorder` (Absuche, `app/track/run.tsx`). `lib/trackRecorder.ts` = nur BLE-Puffer (siehe P0-02).

> **Korrektur (Reconciliation mit `CODEX_P0_REVIEW.md`, 2026-07-26):** Die untenstehende Risiko-Analyse P0-05-A wurde nach Gegenprüfung im Code **entschärft** — siehe korrigierten Abschnitt. Grund: In `useTrackRecorder.begin()` wird die Foreground-Quelle beim Umschalten auf Hintergrund **doch** abgelöst.

---

## 1. Tatsächlicher Datenfluss

```
                 ┌── external BLE-GPS ──────────────┐  (lib/trackRecorder.pushPoint / subscribeRecorder)
Provider  ───────┤── natives Precision-Modul ───────┤  (modules/anyvo-precision-location → precisionLocationClient.onLocation)
                 └── expo-location (Fallback) ───────┘  (Location.watchPositionAsync, im Modul ODER positionSource-Catch)
   │
   ▼  positionStream.startPositionStream()  (Quelle-Auswahl: BLE → native → expo)
   ▼  positionSource.startPositionSource()  (+ harte expo-Sicherung, Adapter → LocationObject)
   ▼  onFix(loc)  [useTrackRecorder / useSearchRecorder]
        1) EMA-Glättung (immer) + Live-Puck (PUCK_ALPHA)  → store.setCurrentPosition
        2) Gates: recording? / isPaused? / Start-Lock
        3) Accuracy-Gate (>MAX_ACCURACY_M → reject) · Speed-Gate (>MAX_SPEED_MPS → reject)
        4) Distanz-Gate (<MIN_STEP_M → skip)
        5) push → store.addTrackPoint  +  ptBuffer (Batch 25) → flushPoints()
        6) autoDetect ? detectCorner()  (Winkel-Erkennung)
   ▼  Tracking-Engine / Stats (engine/*, utils/gpsFilter, trackingStats)
   ▼  Zustand-Store (trackingStore: trackPoints, rawTrackPoints, rejected, markers, segments)
   ▼  SQLite (search: searchPersist) + AsyncStorage (laid: trackPersist)   ← siehe P0-06
   ▼  Supabase (best-effort direkt via trackService: track_points/markers/runs/engine_sessions, training_sessions)
```

### Background-Zweig (parallel)
`native/backgroundLocationTask.ts`: globaler TaskManager-Task **`anyvo-faehrte-bg`** via `Location.startLocationUpdatesAsync` (BestForNavigation, 1 s, Android-Foreground-Service + iOS-Indikator). Jeder Fix → `activeHandler` → **derselbe `onFix`** des Recorders (`setTrackFixHandler(loc => onFixRef.current(loc))`, `useTrackRecorder` Z. 503).

---

## 2. Provider-Auswahl & Filter

- **Foreground-Quelle:** `positionStream` bevorzugt natives Precision-Modul (`mode:'tracking_dog_sport'`, `allowBackground:false`), Fallback expo-location (im Modul und zusätzlich `positionSource`-Catch → `watchPositionAsync`).
- **Background-Quelle:** **expo-location** `startLocationUpdatesAsync` (NICHT das native Precision-Modul).
- **Ein einziger Filter** (`onFix`) für beide Zweige: EMA + Accuracy + Speed + Distanz-Gate. Kein zweiter, abweichender Filter im aktiven Pfad. `useSearchRecorder` nutzt **dieselbe** `startPositionSource`-Quelle und `onFix`-Logik-Muster (getrennte Suchspur).
- Heading läuft **separat** über `Location.watchHeadingAsync` (nicht über die Positionsquelle).

---

## 3. Risiko-Analyse (gesuchte Punkte)

### 🟠 P0-05-A — Umschalt-Race Foreground→Background (MITTEL) — *korrigiert*
`useTrackRecorder.begin()` schaltet die GPS-Quelle bewusst **um** (kein dauerhafter Doppel-Listener):
1. Warmup/Vordergrund: `startPositionSource` (natives Modul) → `onFix` (`watchRef.current`).
2. Bei Aufnahmestart und **erteilter Background-Berechtigung**: `setTrackFixHandler(loc => onFixRef.current(loc))` + `startBackgroundUpdates(...)` (expo-location), **danach** wird die Foreground-Quelle **abgelöst**: `watchRef.current?.remove(); watchRef.current = null; bgActiveRef.current = true` (Z. ~503–511).
3. Ohne „Immer"-Berechtigung bleibt der **Foreground-Watch als einzige Quelle** (kein Background) — dann ebenfalls kein Doppel-Listener.

**Verbleibendes Risiko (real, aber begrenzt):**
- **Kurzes Overlap-/Race-Fenster** beim Umschalten: `setTrackFixHandler` ist gesetzt, bevor `watchRef` entfernt wird → für einen Moment können **beide** (native FG + expo BG) `onFix` speisen. Da **kein Source-/Timestamp-Dedup** existiert, sind in diesem Fenster einzelne Doppel-/Zick-Zack-Punkte möglich (durch `MIN_STEP_M` teils gemildert).
- **Kein `AppState`-Gating** für das *Zurück*-Schalten: Kommt die App wieder in den Vordergrund, läuft weiter der **Background**-Task (expo-location) — die (bessere) native FG-Quelle wird nicht reaktiviert. Das ist eher eine Qualitäts-/Provider-Frage (siehe P0-05-B) als Doppelaufzeichnung.

**Beweislage:** `useTrackRecorder.ts` Z. 484–511 (FG-Watch wird nach `startBackgroundUpdates` entfernt; Fallback behält FG); `backgroundLocationTask.ts` Z. 29–42, 50–63. **Empfohlene Laufzeit-Verifikation:** Fix-Zähler nach `source` während des FG→BG-Umschaltens.

> **Frühere Fassung (überstimmt):** Die erste Version dieses Berichts stufte dies als 🔴 „dauerhaft parallele Listener im Vordergrund (HOCH)" ein. Das ist laut Code **zu stark** — die FG-Quelle wird abgelöst. Korrigiert nach `CODEX_P0_REVIEW.md`.

### 🟠 P0-05-B — Foreground/Background-Provider-Unterschied (MITTEL)
Foreground = natives Precision-Modul (bessere Glättung/Genauigkeit), Background = expo-location. Beim App-Wechsel entsteht ein **Provider-Sprung** → Diskontinuität/Genauigkeitswechsel in der Spur.

### 🟠 P0-05-C — Doppeltes expo-location-Fallback (NIEDRIG-MITTEL)
Fallback-Ketten an zwei Stellen: im nativen Modul selbst **und** im `positionSource`-Catch (`watchPositionAsync`). Bei ungünstigem Fehlerbild theoretisch zwei expo-Watches. Verifikation empfohlen.

### 🟢 P0-05-D — Zusätzlicher Warmup-Listener (bekannt, isoliert)
`useStartPointApproach` nutzt einen **eigenen** `watchPositionAsync` (Start-Anfahrt/Absuche). Läuft in einer anderen Phase; ob er sauber beendet wird, bevor die Aufnahme-Quelle startet, ist zu prüfen (sonst kurzzeitig 2 Watches).

### 🟢 P0-05-E — BLE-Modus schließt Telefon-GPS aus (korrekt)
`positionStream` nutzt bei `isExternalMode()` **nur** den BLE-Puffer (kein Telefon-GPS). Keine Doppelquelle in diesem Modus.

---

## 4. Race Conditions

- `onFixRef` (Z. 141/405) ist die stabile Brücke Task→aktueller `onFix` — vermeidet Stale-Closures, aber verhindert **nicht** doppelte Quellen (P0-05-A).
- `recordingRef`/`startLockRef`/`stoppingRef` sind Guards gegen zu frühe/doppelte Aufnahme bzw. Doppel-Stop. Kein Guard gegen **gleichzeitige** FG+BG-Fixes.
- `ptBuffer` flush ab 25 Punkten → bei Doppelrate schnellere Flushes (mehr DB-Inserts).

---

## 5. Empfehlungen (nur Analyse, keine Umsetzung hier)
1. **AppState-gesteuerter Quellen-Wechsel**: genau **eine** aktive Quelle je Zustand (FG: native; BG: expo) — die jeweils andere beim Wechsel stoppen.
2. **Dedup in `onFix`**: nach `source` + monoton steigendem Timestamp verwerfen; identische/rückläufige Timestamps ignorieren.
3. **Laufzeit-Verifikation** (Debug-Panel ist vorhanden, `PrecisionDebugPanel`): Fix-Zähler getrennt nach `source` im FG mit aktivem BG-Service.
4. Provider-Sprung FG↔BG glätten/kennzeichnen.

**BLOCKED / nicht in diesem Pass geprüft:** natives iOS-/Android-Modul-Interna (`modules/anyvo-precision-location`), reales Lifecycle-Verhalten auf Gerät, exakte Filter-Konstanten-Werte (nur Logik erfasst).
