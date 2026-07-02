# Session-Log · 2026-07-03 · GPS-/Fährten-Präzision

Zusammenfassung der Arbeiten an der GPS-/Fährtenaufnahme (Legen & Absuchen),
inkl. Umstellung auf eine zentrale Positionsquelle, Debug-Panel und offener
Punkte für den echten Gerätetest / Google Play.

> Status: **noch nicht auf echtem Gerät getestet.** Für den echten Test ist ein
> **neuer Build (Build 27)** nötig (native Module: Precision-Location, expo-local-authentication).
> Aktueller Build: iOS `buildNumber 26` / Android `versionCode 26`.

---

## 1. Zentrale Positionsquelle (`positionSource`) eingeführt

**Neu:** `features/tracking/utils/positionSource.ts`

- Kapselt die GPS-Quelle an einer Stelle. Reihenfolge:
  1. **Natives Precision-Location-Modul wird bevorzugt** (über `positionStream` →
     `modules/anyvo-precision-location`; Android roher `GPS_PROVIDER` + GNSS, iOS
     `CLLocationManager` BestForNavigation).
  2. **expo-location bleibt Fallback** — automatisch, wenn das native Modul nicht
     im Build ist **oder** der native Start einen Fehler wirft (dann Warnung im Log
     + direkter `Location.watchPositionAsync`).
- Liefert ein einheitliches Sample **plus Debug-Metadaten**: `source`
  (`native` | `expo` | `external`), `provider`, `isNativeAvailable`, `rawGnssSupported`.
- Adapter `sampleToLocationObject(...)` erzeugt die gewohnte `LocationObject`-Form,
  damit die bestehende `onFix`-/Filter-Logik der Recorder **unverändert** bleibt.
- `features/tracking/utils/positionStream.ts`: `StreamSample` um optionale
  `provider`/`source` erweitert (abwärtskompatibel).

## 2. `useTrackRecorder` nutzt jetzt `positionSource`

`features/tracking/hooks/useTrackRecorder.ts`

- Kein direktes `Location.watchPositionAsync` mehr — der Foreground-Watch läuft
  über `startPositionSource(...)`.
- Filter/Schwellen/Warmup/Pause-Resume/Background-Switch **unverändert**.
- Neu im Recorder-State: `gpsDebug` (`source`, `provider`, `isNativeAvailable`,
  `rawGnssSupported`, `rejectedCount`).
- Watcher wird beim Stop/Unmount sauber beendet (`handle.stop`).

## 3. `useSearchRecorder` nutzt jetzt `positionSource`

`features/tracking/hooks/useSearchRecorder.ts`

- Ebenfalls über `startPositionSource(...)` statt direktem `watchPositionAsync`.
- Absuche-Logik (Abweichung, Abriss, Score, Ausreißer-Gate) **unverändert**.
- `gpsDebug` analog ergänzt; Unmount-Schutz gegen doppelte/leakende Watcher.

## 4. Natives Precision-Modul bevorzugt, expo-location bleibt Fallback

- Bevorzugt: `modules/anyvo-precision-location` (via `precisionLocationClient` →
  `positionStream` → `positionSource`).
- Fallback dreistufig, crash-sicher:
  1. Modul im Build → nativ.
  2. Modul nicht im Build → modul-interner expo-location-Fallback.
  3. Nativer Start wirft Fehler → `positionSource` fängt ab, loggt Warnung,
     startet direkt expo-location.
- Ergebnis: Aufnahme bleibt in **allen** Fällen möglich.

## 5. PrecisionDebugPanel in Legen & Absuchen eingebunden

`features/tracking/components/PrecisionDebugPanel.tsx` (bestehend, wiederverwendet)
→ eingebunden in `app/track/legen.tsx` und `app/track/run.tsx`.

- **Nur im Dev-Build sichtbar:** `const SHOW_GPS_DEBUG = __DEV__;` — im Release
  wird das Panel **nicht gemountet**.
- **Rein lesend** — beeinflusst die Aufnahme nicht.
- Panel um zwei read-only Zeilen ergänzt: **Provider** und **Native verfügbar**.
- Zeigt: Engine (native/expo), Provider, Native verfügbar, Accuracy, GPS-Quality,
  Punkte (Raw/Filtered/Rejected), Rejection-Rate, Raw-GNSS u. a.

### Direkt beobachteter Befund (iOS-Simulator, Dev-Client)
Das Panel zeigte im Sim **Engine: Expo Fallback · Provider: expo-location ·
Native verfügbar: Nein** → das native Modul ist im aktuellen (älteren)
Dev-Client/Build **nicht aktiv**; der Fallback greift korrekt. Aussagekräftig ist
der Test daher erst auf **Build 27 / echtem Gerät** (v. a. Android, wo nativ =
roher `GPS_PROVIDER`).

## Weitere Fährten-Verbesserungen dieser Session (Kontext)

- Karten-Linie nicht mehr doppelt geglättet → Linie trifft die Winkel-Marker (`2c0cb7c`).
- GPS-Ausreißer-Filter im Absuch-Recorder + `removeGpsJitter` kappt Anfangs-/End-Spitzen (`c8ed6ef`).
- Skizze zeichnet die **echte** aufgezeichnete Geometrie; Distanz zeigt zusätzlich **Schritte** (`95c890f`).
- Display bleibt an (`expo-keep-awake`) + Haptik-Führung beim Absuchen (1× Gegenstand, 2× Winkel) (`af630d0`).

---

## Testing-Status

- ❌ **Noch nicht auf echtem Gerät getestet.**
- ✅ TypeScript sauber, Tracking-Tests grün (89), Sim-Smoke-Test (Warmup lädt, kein Crash).
- ⚠️ **Build 27 nötig für echten Test** — native Module (`anyvo-precision-location`,
  `expo-local-authentication`) sind erst dann im Binary.

### Was auf Build 27 zu prüfen ist
1. Debug-Panel in Legen/Absuchen öffnen → zeigt es **Engine: Native Precision**,
   **Provider: gps** (Android) und **Native verfügbar: Ja**?
2. Fallback prüfen: Aufnahme startet/läuft auch, wenn nativ nicht verfügbar.
3. Sauberer Stop / kein Doppel-Watcher (Screen betreten/verlassen, Pause/Weiter,
   Hintergrund/Vordergrund).
4. Android-Genauigkeit im Feld (nativ = roher `GPS_PROVIDER` vs. Fused).

---

## Offene Punkte (vor Release / Google Play)

### ACCESS_BACKGROUND_LOCATION — heute entfernt, nach Build verifizieren
- Heute per Config entfernt (`a6de587`): `expo-location`-Plugin
  `isAndroidBackgroundLocationEnabled: true → false` → das Plugin injiziert
  `ACCESS_BACKGROUND_LOCATION` **nicht mehr** in den generierten Manifest.
- `FINE`/`COARSE_LOCATION` bleiben; `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`
  explizit ergänzt (aktive Aufnahme via Foreground-Service bleibt möglich).
- **Muss vor Google Play geprüft werden:** Im **generierten**
  `android/app/src/main/AndroidManifest.xml` (Build 27) bestätigen, dass **kein**
  `ACCESS_BACKGROUND_LOCATION` mehr steht, aber `FOREGROUND_SERVICE_LOCATION` schon.
- Hintergrund-Location-**Code** ist bewusst **nicht** geändert
  (`features/tracking/native/backgroundLocationTask.ts`, `lib/trackRecorder.ts`,
  `useTrackRecorder.ts` `requestBackgroundPermissionsAsync`) — läuft nun graceful
  ohne Background-Permission (nur Foreground/Foreground-Service während aktiver Aufnahme).

### Sentry Auto Upload muss im `eas.json` deaktiviert sein
- Aktueller Stand `eas.json`:
  - `development` / `preview`: `SENTRY_DISABLE_AUTO_UPLOAD: "true"` ✅
  - **`production`: `SENTRY_DISABLE_AUTO_UPLOAD: "false"`** ⚠️ (Auto-Upload aktiv)
- **Zu prüfen/entscheiden vor dem nächsten Prod-Build:** Soll der Source-Map-/
  Auto-Upload im `production`-Profil **deaktiviert** werden
  (`"true"`)? Aktuell ist er aktiv. (In dieser Session **nicht** geändert.)

---

## Commits dieser Session (GPS/Track/Security)

| Commit | Inhalt |
|---|---|
| `2c0cb7c` | fix(track): Karten-Linie nicht doppelt glätten → Linie trifft Winkel |
| `c8ed6ef` | fix(track): GPS-Ausreißer in der Laufspur verwerfen |
| `af630d0` | feat(track): Display anlassen + Haptik-Führung |
| `95c890f` | feat(track): Skizze zeichnet echte Aufnahme + Schritte |
| `797be62` | refactor(track): aktive Recorder auf positionSource (native + expo-Fallback) |
| `7e1452b` | feat(track): PrecisionDebugPanel in Legen/Absuchen (nur __DEV__, read-only) |
| `a6de587` | chore(android): ACCESS_BACKGROUND_LOCATION entfernen |
| `c56469e` | feat(profile): E-Mail-/Passwort-Änderung |
| `8840f4f` | feat(security): biometrische App-Sperre (Face ID / Touch ID / Fingerabdruck) |

> Stand: alle Commits **lokal**, noch **nicht gepusht**, kein Build 27 gebaut.
