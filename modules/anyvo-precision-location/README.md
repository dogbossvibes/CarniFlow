# anyvo-precision-location (Phase 1)

Lokales Expo Native Module für **High-Accuracy-Location** der ANYVO-Fährten-
aufzeichnung. Wird per Expo-Autolinking automatisch verlinkt (liegt in `modules/`).

> **Phase 1** liefert bewusst nur *einfache* native Location-Updates mit hoher
> Genauigkeit plus einen `expo-location`-Fallback. **Noch keine** komplexe
> Raw-GNSS-Logik und **noch keine** Integration in die Fährtenaufnahme.

## Öffentliche API

```ts
import {
  startPrecisionTracking, stopPrecisionTracking,
  isRawGnssSupported, getProviderStatus,
  addPrecisionLocationListener, addProviderStatusListener,
  isNativeModuleAvailable,
  type PrecisionLocation, type ProviderStatus, type PrecisionTrackingOptions,
} from '@/modules/anyvo-precision-location';
```

| Funktion | Zweck |
| --- | --- |
| `startPrecisionTracking(options?)` | Startet die Positions-Updates (nativ oder Fallback). |
| `stopPrecisionTracking()` | Stoppt die Updates. |
| `isRawGnssSupported()` | `true`, wenn rohe GNSS-Messungen möglich (Android API ≥ 24). |
| `getProviderStatus()` | Aktueller Provider-/Berechtigungs-Status. |
| `addPrecisionLocationListener(cb)` | Event `onPrecisionLocation` → `PrecisionLocation`. |
| `addProviderStatusListener(cb)` | Event `onProviderStatus` → `ProviderStatus`. |
| `isNativeModuleAvailable()` | `true`, wenn das native Modul im Build steckt. |

Alle Listener geben eine `EventSubscription` zurück → mit `.remove()` abmelden.

## Fallback-Verhalten

`requireOptionalNativeModule` gibt `null` zurück, wenn das native Modul nicht im
Build ist (Expo Go oder ein Build vor dem Hinzufügen). Dann nutzt die API
**automatisch `expo-location`** (`watchPositionAsync`, `BestForNavigation`). Die
App bleibt so in jedem Build lauffähig; `isNativeModuleAvailable()` zeigt an,
welcher Pfad aktiv ist.

## Plattform-Implementierung

- **Android** (`AnyvoPrecisionLocationModule.kt`): System-`LocationManager`,
  `GPS_PROVIDER`, zeitbasiert (Default 1000 ms). Ohne Play-Services-Abhängigkeit.
- **iOS** (`AnyvoPrecisionLocationModule.swift`): `CLLocationManager` mit
  `kCLLocationAccuracyBestForNavigation`, `activityType = .fitness`.

Berechtigungen/Info.plist kommen aus dem bestehenden `expo-location`-Plugin
(`app.json`) — das Modul fügt **keine** neuen Permissions hinzu.

## Bauen & Testen

Native Module sind erst nach einem **neuen Dev-Build** aktiv (kein Fast Refresh):

```bash
# iOS-Simulator (kein Code-Signing)
eas build --profile development-simulator --platform ios
# Android-Gerät/Emulator
eas build --profile development --platform android
```

Danach Metro mit Dev-Client starten und den Test-Screen öffnen:

```bash
npm run start:dev-client
# im Dev-Client / per Deep-Link:
#   anyvo://dev/precision-location-test
```

Der Test-Screen (`app/dev/precision-location-test.tsx`) zeigt: natives Modul
verfügbar?, Raw-GNSS?, Provider-Status, Live-Position + Update-Zähler, sowie
Buttons für Berechtigung/Start/Stop.

## Roadmap

- **Phase 2**: Raw-GNSS-Measurements (Android `GnssMeasurementsEvent`),
  FusedLocation, Satelliten-/Multipath-Bewertung; iOS-Grenzen dokumentieren.
- **Phase 3**: Integration in die Fährtenaufnahme (`useTrackRecording`) hinter
  einem Feature-Flag, parallel zur bestehenden `positionStream`-Quelle.
