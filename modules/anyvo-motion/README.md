# anyvo-motion (Phase 1 — iOS)

Lokales Expo Native Module: aggregierte **Core-Motion**-Daten (Beschleunigung,
Rotation, Schritte, Bewegungszustand) als **Zusatzsignal** zur GPS-
Fährtenaufzeichnung. Wird per Expo-Autolinking automatisch verlinkt (liegt in
`modules/`), genau wie `anyvo-precision-location`.

> **Core Motion ersetzt GPS nicht.** Es dient ausschliesslich der
> Plausibilisierung (GPS-Outlier-Erkennung, Stillstandserkennung, bessere
> Start-Acquisition, Confidence-Bewertung). Kein Dead-Reckoning durch doppelte
> Integration der Beschleunigung — IMU-Drift macht das nach wenigen Sekunden
> unbrauchbar.

Nur **iOS** (`expo-module.config.json`: `"platforms": ["apple"]`). Android hat
keine native Entsprechung in diesem Modul — `services/trackFusionEngine.ts`
degradiert dort automatisch auf `fusionMode = 'gps_only'`.

## Öffentliche API

```ts
import {
  isMotionModuleAvailable, isMotionAvailable, getMotionStatus,
  startMotionUpdates, stopMotionUpdates,
  addMotionSampleListener, addMotionErrorListener,
  type MotionSample, type MotionStatus,
} from '@/modules/anyvo-motion';
```

| Funktion | Zweck |
| --- | --- |
| `isMotionModuleAvailable()` | `true`, wenn das native Modul im Build steckt. |
| `isMotionAvailable()` | `true`, wenn Core Motion auf diesem Gerät verfügbar ist. |
| `getMotionStatus()` | Verfügbarkeit/Berechtigungsstatus (Pedometer/Activity). |
| `startMotionUpdates(options?)` | Startet aggregierte Motion-Updates (nur während aktiver Fährte aufrufen). |
| `stopMotionUpdates()` | Stoppt die Updates (Manager wird nach Session sauber gestoppt). |
| `addMotionSampleListener(cb)` | Event `onMotionSample` → `MotionSample` (gedrosselt, Default 4 Hz). |
| `addMotionErrorListener(cb)` | Event `onMotionError` → `MotionError`. |

## Permission

`NSMotionUsageDescription` (app.json `ios.infoPlist`) — gilt für
Pedometer/Activity. Reine `CMDeviceMotion` (Beschleunigung/Rotation) benötigt
auf iOS **keine** explizite Laufzeit-Berechtigung. Bei denied/restricted
bleiben nur Schritt-/Aktivitätsdaten leer — die Fährte läuft unverändert
weiter (`fusionMode = 'gps_only'` in `trackFusionEngine.ts`, falls das Modul
komplett fehlt oder `isMotionAvailable()` `false` liefert).

## Sampling

Intern ~20 Hz (`CMMotionManager.deviceMotionUpdateInterval`), an JS geht nur
ein **aggregiertes** Sample pro Emit-Fenster (Default 250 ms = 4 Hz) — keine
Rohdatenflut über die Bridge.

## Deployment Target (wichtig — bewusst 15.1, nicht 16.4)

`AnyvoMotion.podspec` deklariert `:ios => '15.1'`, NICHT das `16.4` von
`AnyvoPrecisionLocation.podspec`. Grund: `ios/Podfile` fällt ohne ein
`expo-build-properties.ios.deploymentTarget` in `app.json` (aktuell nicht
gesetzt) auf `'15.1'` zurück. Ein lokales Modul, dessen Podspec ein HÖHERES
Minimum als das App-Target deklariert, wird von Expos CocoaPods-Autolinking
beim `pod install` **kommentarlos** aus dem Pods-Projekt ausgeschlossen (nur
mit `pod install --verbose` sichtbar: `"- <name> doesn't support iOS
platform"`) — kein Fehler, kein Build-Abbruch, das Modul linkt einfach nie,
`requireOptionalNativeModule('AnyvoMotion')` liefert dann dauerhaft `null`.

Bei der nativen Build-Verifikation dieses Auftrags wurde genau dieser Fall
sowohl für `AnyvoPrecisionLocation` als auch für das echte npm-Paket
`expo-speech-recognition` (beide `:ios => '16.4'`) reproduziert — bei
unverändertem `app.json` linkt heute wahrscheinlich KEINS der drei Module in
einem frischen `expo prebuild`, da `ios/` gitignored ist und auch `eas build`
denselben frischen Prebuild fährt. CMMotionManager/CMPedometer/
CMMotionActivityManager benötigen keine iOS-Version über 15.1, daher hier
bewusst NICHT das 16.4-Präzedens kopiert. Siehe Abschlussbericht der Core-
Motion-Aufgabe für Details — die beiden anderen Module wurden NICHT
angefasst (ausserhalb des Auftragsumfangs).
