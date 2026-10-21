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
keine native Entsprechung in diesem Modul — `features/tracking/engine/trackFusionEngine.ts`
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


## Sensorqualität v2 – Vorbereitung für das nächste iOS-Binary

Diese Änderung benötigt einen neuen nativen Build. Die separate JS-OTA mit
Frische-/Laufisolationsschutz muss auch in dessen Quellstand enthalten sein.
Android erhält durch dieses Modul keine neue native Sensorquelle.

- Device-Motion-Callbacks, Pedometer, Activity, Timer und Start/Stop werden auf
  einer seriellen Hintergrundqueue verarbeitet. Jede native Rückmeldung und
  jeder Timer ist an die Generation seiner Aufnahme gebunden.
- Leere oder über 2 s alte Device-Motion-Fenster werden nicht gesendet. Es gibt
  keinen künstlichen Nullwert als Ersatz für ausgefallene Messungen. Der
  JS-Frischeguard fällt bei fehlenden Ereignissen auf GPS-only zurück.
- `timestamp` bezeichnet den letzten tatsächlichen Messzeitpunkt des Fensters
  in Unix-ms. Die Umrechnung verwendet die monotone Messzeit und deren Alter
  beim Senden. Sendezeit und Fensteranfang/-ende sind getrennt verfügbar.
- Ungültige/duplizierte/rückwärts laufende Device-Motion-Werte sowie alte
  Laufgenerationen werden verworfen. Ein Messfenster bleibt auf höchstens
  2 s begrenzt, auch wenn die Queue oder der Timer aussetzt.
- Pedometerdaten bleiben kumulative Updates. `pedometerIntervalMs` beschreibt
  das letzte Updateintervall, **nicht** eine zeitgenaue Aufteilung einzelner
  Schritte auf Device-Motion-Fenster. Alte Updates erhöhen nur den internen
  Zählerstand; sie liefern keine frischen Schritte/Kadenz. Fehlende Kadenz
  löscht den vorherigen Wert. Schritt- und Activity-Confidence setzen
  tatsächlich frische Daten voraus, nicht nur vorhandene Hardware.
- Die vorhandene Activity-Empfangsaltersgrenze von 6 s sowie die Fallback-
  Beschleunigungsschwellen bleiben erhalten. `activityAgeMs` ist Empfangsalter,
  `deviceMotionAgeMs` und `pedometerAgeMs` beziehen sich auf Messzeitpunkte.

Additive optionale Felder auf `MotionSample`: `qualityVersion: 2`, `runId`,
`windowStartTimestamp`, `windowEndTimestamp`, `emittedAtTimestamp`,
`deviceMotionSampleCount`, `deviceMotionAgeMs`, `pedometerAgeMs`,
`pedometerIntervalMs`, `discardedWindowCount`. Bestehende Binaries ohne diese
Felder bleiben kompatibel. `getStatus()` ergänzt Version/Laufkennung und
verworfene Fenster; `pedometerAuthorized` liest den tatsächlichen Systemstatus.
Ein neues natives `startMotionUpdates()` meldet `false`, wenn Device Motion
nicht verfügbar ist; der JS-Wrapper akzeptiert weiterhin das `void` alter Binaries.

### Lokale Tests

`Package.swift` ist ausschließlich ein Test-Harness für die im Produkt verwendete
`ios/MotionSensorState.swift`. Die App verwendet unverändert Expo/CocoaPods;
Testquellen liegen außerhalb des Pod-Quellverzeichnisses.

```sh
swift test --package-path modules/anyvo-motion
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath modules/anyvo-motion/__tests__/compatibility.test.ts
```

Vor dem Binary: vollständiger iOS-SDK-/Expo-Linktest und anschließend tatsächliche
Sensor-/Berechtigungs-/Background-/Resume-Prüfung. Tests mit simulierten
Messwerten belegen weder native Sensorverfügbarkeit noch Winkelgenauigkeit im Feld.
FGO, GPS-Zulassung, Winkel-/Score-/Endlogik sind nicht Teil dieses Moduls.


### Geprüfte API-Quellen

- [Apple: CMLogItem.timestamp – Messzeit seit Geräteboot](https://developer.apple.com/documentation/coremotion/cmlogitem/timestamp?language=objc)
- [Apple: Device-Motion-Updates auf eigener OperationQueue](https://developer.apple.com/documentation/coremotion/cmmotionmanager/startdevicemotionupdates%28using%3Ato%3Awithhandler%3A%29)
- [Apple: CMPedometerData – Endzeit, kumulative Schritte und Kadenz](https://developer.apple.com/documentation/CoreMotion/CMPedometerData?changes=l_11&language=objc)

Der angefragte Expo-v54-Dokumentationsindex leitet derzeit auf die aktuelle
Version weiter. Für die Expo-Bridge wurden deshalb die installierten
Expo-54-Modulquellen herangezogen; kein SDK-Upgrade durchgeführt.

## Sensorqualität v3 – frische Schritte bei leeren Motion-Fenstern erhalten

Vorbereiteter nativer Kandidat, **neuer iOS-Build erforderlich**. Die v2-
Implementierung verbrauchte `pendingSteps` auch dann, wenn `emit()` wegen eines
leeren oder veralteten Device-Motion-Fensters überhaupt kein Ereignis lieferte.

- Positive kumulative Schritt-Deltas bleiben als getrennte Quellintervalle
  bis zu einem gültigen Motion-Ereignis erhalten. Jede Charge verfällt weiterhin
  nach der vorhandenen 2-s-Grenze ihres eigenen Quell-Endzeitpunkts. Spätere
  Null-Deltas oder andere Updates verlängern diese Grenze nicht.
- Schritte werden genau einmal übergeben und nicht einem Motion-Messzeitpunkt
  zugeordnet, der vor ihrem Quell-Endzeitpunkt liegt. Fehlende Motion bleibt
  unbekannt: kein leeres Motion-Ereignis, keine erfundene Nullrotation.
- Fehler verwerfen ausstehende Schritte, behalten jedoch den kumulativen
  Zeit-/Zählerstand zur Duplikat- und Reihenfolgeprüfung. Stop/Start trennt alle
  Zähler und Messdaten. Veraltete Daten werden niemals nachgeholt.
- `pedometerCumulativeSteps`, `pedometerPublishedStepCount`,
  `pedometerPendingStepCount`, `pedometerDiscardedStepCount` machen die Bilanz
  sichtbar: Quelle = übergeben + ausstehend + verworfen. Die beiden
  `pedometerStepWindow…Timestamp`-Felder beschreiben nur die Abdeckung der gerade
  übergebenen kumulativen Deltas, **keine Zeitstempel einzelner Schritte**.
  Ohne übergebene Schritte sind beide `null`.
- Der persönlich freigeschaltete Diagnosebereich zeigt eine manuell
  aktualisierbare Momentaufnahme. Der QA-Mitschnitt bewahrt verfügbare native
  Alters-, Intervall-, Fenster- und Bilanzfelder bei den vorhandenen begrenzten
  Kandidatenkontexten. Zeiten werden relativ zum Motion-Messzeitpunkt gespeichert;
  die native Laufkennung wird nicht exportiert. Neue Exporte mit diesen Daten
  melden Schema 2.13. Historische Daten werden nicht ergänzt.

Bestehende Binaries ohne Qualitätsfelder bzw. mit `qualityVersion: 2` bleiben
kompatibel. GPS-Zulassung, Start-/Winkel-/Endschwellen, Motion-Gewichte und
Bewertung werden durch die Diagnosefelder nicht verändert. Eine vollständig
ausgefallene Motion-Quelle liefert weiterhin keine Schritt-Ersatzereignisse.

Apple beschreibt Pedometer-Updates als kumulativ ab dem Startdatum:
[startUpdates(from:withHandler:)](https://developer.apple.com/documentation/coremotion/cmpedometer/startupdates(from:withhandler:)).
Aus diesen Intervallen lassen sich einzelne Schritte nicht zeitgenau auf eine
Winkelspitze verteilen. Die vorliegenden Yam-Aufnahmen belegen nicht, wie oft
der korrigierte Verlustpfad tatsächlich auftrat oder ob er fehlende Winkel
verursachte. Dafür bleiben ein passender nativer Prüfbuild und Feldbelege nötig.

### v3-Verbraucher: Quellintervalle statt Übergabezeit

Die native Lieferkorrektur allein ist kein auslieferbarer Gesamtvertrag.
Der unabhängige Review von `422f321` hat nachgewiesen, dass früher gegangene
Schritte sonst bei einer späteren Standdrehung als neue Bewegung zählen können.
Die Clientkorrektur bewahrt deshalb das v3-Schrittintervall unabhängig von QA
im flüchtigen RAM bis zum fachlichen Verbraucher:

- Turn-Evidenz zählt eine Charge nur, wenn ihr vollständiges bekanntes Intervall
  im jeweiligen Kandidatenfenster liegt. Teilüberschneidung wird nicht geschätzt.
- Startbestätigung zählt nur vollständig nach dem Aufnahmestart liegende Schritte.
- Die Absuche trennt Start/Resume und bewertet das Intervall bei jedem GPS-Fix
  erneut gegen den bestehenden 2-s-Frischehorizont von Messung und Empfang.
  Unbekannte Schritte sind dort `null`, nicht ein künstlich gemessener Nullwert.
- Fehlende oder ungültige v3-Provenienz liefert keine Schrittunterstützung.
  Legacy/v2 bleibt beim bisherigen Verhalten. Beschleunigungssignatur,
  GPS-/Fusion-Schwellen und Gewichte bleiben erhalten.

`motionStepEvidence.ts` enthält die gemeinsame Intervallprüfung; die beiden
nativen Adapter erhalten die Quelle für Lay und Search. Absolute RAM-Intervalle
werden weder in QA noch in Fährten-/Suchdaten gespeichert. QA bewahrt nur die
gesonderte relative Allowlist; der Exportguard weist absolute Schrittintervalle
zusätzlich ausdrücklich zurück. Build-Kandidat und JS-Verbraucher müssen
zusammen geprüft werden. `422f321` allein bleibt die belegte RED-Basis.
