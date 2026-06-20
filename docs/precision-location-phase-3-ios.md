# Precision Location — Phase 3 (iOS Core Location + Heading)

Phase 3 verbessert das native Modul `anyvo-precision-location` auf **iOS**:
maximale Core-Location-Präzision, **Heading/Kompass**, **Precise-Location**-Status
und **Temporary-Full-Accuracy**. Android (Raw GNSS aus Phase 2) bleibt unverändert.

## Was Phase 3 implementiert

- **iOS-Manager** (`ios/AnyvoPrecisionLocationManager.swift`) mit Modi:
  - `tracking_dog_sport` (Default): `BestForNavigation`, `distanceFilter = None`,
    `activityType = .fitness`, `pausesLocationUpdatesAutomatically = false`.
  - `walking`: `Best`, `distanceFilter = 2 m`, `.fitness`, Auto-Pause an.
  - `debug`: `BestForNavigation`, `distanceFilter = None`, `.otherNavigation`,
    ausführliche Status-Events.
- **Heading/Kompass** über `onHeading` (true/magnetic/accuracy/x/y/z).
- **Precise-Location-Erkennung** (`accuracyAuthorization`) inkl. Warnung
  `IOS_REDUCED_ACCURACY`.
- **`requestTemporaryFullAccuracy(purposeKey)`** (Purpose-Key
  `TrackingDogSportPrecision`).
- **Erweitertes `onPrecisionLocation`** (accuracy, altitudeAccuracy, speed,
  speedAccuracy, heading, headingAccuracy, quality, rawGnssAvailable, isMocked).
- **Optionales Background** nur bei `allowBackground: true` (kein erzwungenes
  „Always").
- **Saubere Fehler** über `onTrackingError` mit iOS-Codes.

## Warum iOS keine Raw-GNSS-Daten liefert

iOS stellt **keine öffentliche API** für rohe GNSS-Messungen / Satellitenstatus
bereit (kein Pendant zu Androids `GnssMeasurementsEvent`/`GnssStatus`). Daher gibt
`isRawGnssSupported()` auf iOS immer `{ supported: false }` zurück. Stattdessen
liefert iOS über Core Location bereits eine stark sensorfusionierte, sehr genaue
Position (`BestForNavigation`) plus Heading.

## Precise Location prüfen

```ts
import { getProviderStatus } from '@/modules/anyvo-precision-location';
const s = await getProviderStatus();
// s.accuracyAuthorization === 'fullAccuracy' | 'reducedAccuracy'
// s.preciseLocationEnabled === true | false
```
Im Test-Screen: Sektion **„iOS Core Location"** → `Precise Location: Aktiv/Inaktiv`.

## Temporär Full Accuracy anfragen

```ts
import { requestTemporaryFullAccuracy } from '@/modules/anyvo-precision-location';
const r = await requestTemporaryFullAccuracy('TrackingDogSportPrecision');
// r.granted, r.preciseLocationEnabled, r.error?
```
Voraussetzung: `NSLocationTemporaryUsageDescriptionDictionary.TrackingDogSportPrecision`
ist in `app.json` gesetzt (erledigt). Vor iOS 14 → graceful
`error: "TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE"`.

## Heading testen

`startPrecisionTracking({ enableHeading: true })` → `addHeadingListener(cb)`.
Gerät langsam drehen → `trueHeading`/`magneticHeading` ändern sich. Ungültige
Werte (`< 0`) kommen als `null`. Bei grober Genauigkeit kommt (gedrosselt)
`onTrackingError: IOS_HEADING_UNRELIABLE`.

## Was im Debug-Panel sichtbar sein muss (iOS)

- Engine: Native Precision · Provider: iOS Core Location
- Precise Location: Aktiv/Inaktiv
- Authorization Status / Accuracy Auth
- Heading verfügbar: Ja/Nein · True/Magnetic Heading · Heading Accuracy
- Background erlaubt: Ja/Nein
- Letztes Location-Event / Letztes Heading-Event
- rawGnssAvailable: Nein
- Hinweis: „Raw GNSS ist auf iOS nicht verfügbar. Anyvo nutzt Core Location
  Precision + Heading."
- Button „Präzisen Standort anfragen"
- Bei deaktivierter Precise Location: sichtbare Warnung.

## Umgang mit Reduced Accuracy

Wenn der Nutzer „Genauer Standort" deaktiviert hat:
- `onProviderStatus` → `preciseLocationEnabled = false`,
  `accuracyAuthorization = 'reducedAccuracy'`.
- `onTrackingError` → `IOS_REDUCED_ACCURACY` (recoverable).
- UI zeigt Warnung + Button „Präzisen Standort anfragen"
  (`requestTemporaryFullAccuracy`).

## Bekannte Einschränkungen

- iOS: keine Raw-GNSS-/Satellitendaten (API-bedingt).
- `isMocked` nur ab iOS 15 (`sourceInformation.isSimulatedBySoftware`), sonst false.
- Temporary Full Accuracy gilt nur temporär (Session) — kein dauerhaftes Setzen.
- Heading benötigt Magnetometer; in manchen Umgebungen (Magnetfelder) ungenau.
- Background ist nur aktiv, wenn `allowBackground: true` UND die nötigen
  Info.plist-Einträge vorhanden sind (UIBackgroundModes location ist über das
  expo-location-Plugin bereits gesetzt).
- Native Änderungen greifen erst nach einem **neuen iOS Dev-Build**.

## Testanleitung auf echtem iPhone

1. App mit iOS Development Build installieren
   (`eas build --profile development --platform ios`).
2. `npm run start:dev-client`, dann `anyvo://dev/precision-location-test` öffnen.
3. Standort erlauben: **„Beim Verwenden der App"**.
4. Prüfen, ob **Precise Location: Aktiv**.
5. **Start (+ Heading)** drücken.
6. ~10 Sekunden im freien Himmel stehen → Position-Updates, `Qualität` excellent/good.
7. Langsam gehen → Updates folgen flüssig (keine Lücken).
8. Handy drehen → True/Magnetic Heading ändern sich.
9. In iOS-Einstellungen **Genauer Standort deaktivieren** → App zeigt Warnung +
   `IOS_REDUCED_ACCURACY`.
10. **„Präzisen Standort anfragen"** testen → System-Dialog, danach Precise wieder aktiv.
11. **Stop**, dann erneut **Start** → keine doppelten Events (Listener werden sauber
    neu registriert; iOS stoppt Location+Heading vollständig).

## Bekannte Codes (onTrackingError, iOS)

`IOS_LOCATION_PERMISSION_DENIED`, `IOS_REDUCED_ACCURACY`,
`IOS_HEADING_UNAVAILABLE`, `IOS_HEADING_UNRELIABLE`,
`IOS_LOCATION_SERVICES_DISABLED`, `IOS_BACKGROUND_LOCATION_NOT_ALLOWED`,
`TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE`, `UNKNOWN_NATIVE_ERROR`.
