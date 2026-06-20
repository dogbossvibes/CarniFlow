# Precision Location — Phase 2 (Android Raw GNSS)

Phase 2 ergänzt das native Modul `anyvo-precision-location` um **GNSS-Status**
und **Raw-GNSS-Measurements** — ausschließlich auf **Android**. iOS bleibt
unverändert (kein Raw GNSS, Core Location Precision läuft weiter).

## Was ist neu

- `onGnssStatus` — Satellitenzahl, Used-in-Fix, Ø/Max CN0, ~1 Hz.
- `onGnssMeasurement` — **Batch** aller Roh-Messungen einer Epoche (~1 Hz,
  zusätzlich auf max. 1 Batch/Sekunde gedrosselt).
- `onTrackingError` — strukturierte Fehler (`code`, `message`, `platform`, `recoverable`).
- `isRawGnssSupported()` liefert jetzt ein Objekt (`supported`, `reason`,
  `androidApiLevel`, `gpsFeatureAvailable`, `providerEnabled`).
- `getProviderStatus()` enthält auf Android zusätzlich `rawGnssSupported`,
  `rawGnssActive`, `satelliteCount`, `usedInFixCount`, `averageCn0DbHz`,
  `lastGnssStatusAt`, `locationPermission`, `gpsProviderEnabled`,
  `networkProviderEnabled`, `platform`.
- `startPrecisionTracking({ enableRawGnssAndroid: true })` aktiviert Raw GNSS.

## Dev Build starten

Raw GNSS ist nur in einem **Dev/Prod-Build** aktiv (kein Expo Go, kein Fast
Refresh für nativen Code):

```bash
# Android-Build (Gerät oder Emulator)
eas build --profile development --platform android

# danach Metro mit Dev-Client
npm run start:dev-client

# Test-Screen öffnen
#   anyvo://dev/precision-location-test
```

## Welche Geräte testen

- **Echtes Android-Gerät, Android 7+ (API 24+)** mit GPS. Empfohlen API 26+,
  besser API 30+ (dort liefert `GnssCapabilities.hasMeasurements()` eine klare
  Aussage).
- Raw GNSS funktioniert **nur im Freien** mit Satellitenempfang.
- **Emulator**: GNSS-Measurements liefern i. d. R. KEINE Raw-Daten → erwartetes
  Verhalten = `onTrackingError: RAW_GNSS_NOT_SUPPORTED`, normale Location läuft
  weiter. Gut, um den Fallback-/Fehlerpfad zu prüfen.
- Viele Hersteller-Geräte (u. a. ältere Samsung) unterstützen keine
  Raw-Measurements — das ist normal und darf nicht crashen.

## Raw-GNSS-Support prüfen

Im Test-Screen unter **„Raw GNSS (Android)"**:
- `Raw GNSS unterstützt: Ja/Nein` (+ `Grund`: SUPPORTED / GPS_FEATURE_MISSING / …)
- `Raw GNSS aktiv: Ja/Nein` (erst nach „Start" + Satellitenempfang)

Programmatisch:
```ts
import { isRawGnssSupported } from '@/modules/anyvo-precision-location';
const s = isRawGnssSupported(); // { supported, reason, androidApiLevel, ... }
```

## Was im Debug-Panel sichtbar sein muss

Nach „Start (+ Raw GNSS)" auf einem unterstützten Gerät im Freien:
- **Satelliten gesamt** und **Used in Fix** steigen.
- **Ø CN0** / **Max CN0** zeigen dBHz-Werte.
- **Letztes GNSS-Event** zählt in Sekunden hoch (~1 Hz).
- **Messungen / Batch** > 0 und **Batches gesamt** steigt ~1×/Sekunde.
- **Provider-Status** zeigt `Raw GNSS aktiv: Ja`.

Auf iOS erscheint stattdessen: *„Raw GNSS ist auf iOS nicht verfügbar. Core
Location Precision aktiv."*

## Erwartetes Verhalten in Sonderfällen

| Situation | Erwartung |
| --- | --- |
| **Raw GNSS nicht unterstützt** | `onTrackingError` mit `RAW_GNSS_NOT_SUPPORTED` (recoverable=true). Normale Location-Updates laufen weiter, kein Crash. `rawGnssActive=false`. |
| **GPS ausgeschaltet** | `getProviderStatus`/`onProviderStatus` melden `gpsProviderEnabled=false`. `isRawGnssSupported().reason = "LOCATION_PROVIDER_DISABLED"`. Bei laufender Messung ggf. `onTrackingError: GPS_PROVIDER_DISABLED`. |
| **Berechtigung fehlt** | Start wirft `E_NO_PERMISSION` + `onTrackingError: LOCATION_PERMISSION_MISSING` (recoverable=false). Erst „GPS-Berechtigung anfragen", dann „Start". |
| **Mehrfach Start/Stop** | Keine doppelten Listener (Start ruft intern zuerst Stop). |

## Manuelle Checkliste

1. Berechtigung verweigern → Start → Fehler `LOCATION_PERMISSION_MISSING`, kein Crash.
2. Berechtigung erteilen → Start → Position-Updates kommen (`Quelle: native`).
3. Draußen warten → GNSS-Status + Batches erscheinen (unterstützte Geräte).
4. GPS in den Android-Einstellungen ausschalten → Status spiegelt das wider.
5. Stop → alle Events stoppen; erneuter Start funktioniert sauber.
