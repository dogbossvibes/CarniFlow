# Native Sensorqualität – Vorbereitung nächster iOS-Build

Stand: 2026-10-16. Auftrag: Schutzkorrekturen über Chat 01 per OTA; native Sensorverbesserung samt Tests separat für den nächsten Build vorbereiten. FGO bleibt getrennt.

## Arbeitsplatz und Abgrenzung

- Worktree: `anyvo-tracking-native-sensor-quality`, Branch `fix/tracking-native-sensor-quality`.
- Basis: `ae09a659db8cec31de296e71dd5348306266ed5a` (iOS 1.0.5). Lokale Änderungen uncommitted.
- Keine Änderungen an main, globalen Statusdateien, App-Version, Runtime, Permissions, Abhängigkeiten oder Datenbank.
- Keine native Build-/Store-Veröffentlichung. Diese Dateien sind ausdrücklich nicht Teil der laufenden Schutz-OTA.
- Die separate Schutz-OTA stammt aus `anyvo-tracking-sensor-study` auf `f5557a8b6bb67c03ab80447f6beb146cc622e725`; Integration/Veröffentlichung besitzt Chat 01.

## Befund und Umsetzung

Der bisherige native Timer konnte auch ohne neue Device-Motion-Messung ein aktuelles Nullwert-Sample liefern. Versandzeit wurde als Messzeit verwendet. Asynchrone Sensor-/Timer-Rückmeldungen waren nicht durchgehend an den aktuellen Aufnahmelauf gebunden; Hardware-Verfügbarkeit konnte den Confidence-Wert erhöhen, obwohl keine frischen Daten vorlagen.

`MotionSensorState.swift` enthält den tatsächlichen produktiven Aggregationszustand, isoliert von CoreMotion/Expo testbar. Manager, Start/Stop, Timer und Sensorrückmeldungen werden auf einer seriellen Queue verarbeitet; jede Rückmeldung trägt eine Laufgeneration. Leere/alte Fenster liefern kein Ereignis. Zeitstempel beruhen auf tatsächlicher Device-Motion-Messzeit; Fensterzeit, Versandzeit, Messanzahl und Quellenalter sind getrennt dokumentiert. Pedometerdaten bleiben kumulativ: verspätete Zählerstände aktualisieren nur die Basis. Fehlende Kadenz löscht den alten Wert. Confidence-Boni setzen frische Daten voraus.

Alle bestehenden Payload-Felder bleiben erhalten. Neue Felder sind optional. Der JS-Wrapper akzeptiert das bisherige native `void`-Startergebnis und das neue Boolean-Ergebnis. Android bleibt ohne native Motion-Quelle im bisherigen GPS-only-Pfad. Keine neue Winkel-/Score-/End-/Continuity- oder FGO-Semantik.

## Dateien

- `modules/anyvo-motion/ios/MotionSensorState.swift` (neu): Zustands-/Frische-/Generationslogik.
- `modules/anyvo-motion/ios/AnyvoMotionManager.swift`: serialisierte CoreMotion-Anbindung.
- `modules/anyvo-motion/ios/AnyvoMotionModule.swift`: tatsächliches Startergebnis.
- `modules/anyvo-motion/index.ts`, `src/AnyvoMotionModule.ts`, `src/AnyvoMotion.types.ts`: abwärtskompatibler Vertrag.
- `modules/anyvo-motion/Package.swift`, `tests/Native/MotionSensorStateTests.swift` (neu): Swift-Tests der Produktlogik ohne externe Pakete; Testdateien außerhalb des Pod-Quellglobs.
- `modules/anyvo-motion/__tests__/compatibility.test.ts` (neu): JS-Vertragsregressionen.
- `modules/anyvo-motion/README.md`: Datenvertrag, Grenzen, offizielle API-Quellen.

## Prüfung

- JS-Kompatibilität: 1 Suite / 5 Tests PASS.
- TypeScript: PASS. Gezielter ESLint: 0 Fehler / 0 Warnungen.
- Swift-Syntaxprüfung aller drei Produktdateien: PASS; keine vollständige iOS-SDK-Kompilierung.
- Swift-Produktkern kompiliert: PASS. `swift test` scheitert erst am fehlenden `XCTest`-Modul der lokalen Command Line Tools; kein XCTest-PASS.
- Ergänzende Ausführung: Alle 19 unveränderten Testmethoden wurden mit einfachen fail-fast Assertions in einem eigenständigen Swift-Testläufer gegen dieselbe Produktdatei kompiliert und ausgeführt: 19/19 PASS. Der generierte Läufer und Build-/Testlogs liegen im Nachweisverzeichnis. Dies ersetzt weder XCTest noch CoreMotion-/Expo-Link- oder Geräteprüfung.
- `git diff --check`: PASS.
- Nachweise außerhalb des Quelltrees: `../outputs/tracking-native-sensor-quality/`.

## Integration und offene Abnahme

Vor dem nächsten nativen Build müssen die inzwischen veröffentlichten JS-Frische-/Laufisolationsguards mit diesem Paket zusammengeführt sein. Sie sorgen bei ausbleibenden nativen Ereignissen für den GPS-only-Rückfall. Nicht den älteren Basisstand dieses Worktrees vollständig als Releasebasis übernehmen.

Auf diesem Host sind Command Line Tools vorhanden, aber kein vollständiges Xcode/iOS SDK. Vollständige iOS-Kompilierung, Expo-/Pod-Linkprüfung sowie Sensor-, Permission-, Background- und Resume-Abnahme bleiben offen. Das vorbereitete SwiftPM-Testharness ersetzt diese Prüfung nicht. Eine tatsächliche Winkelverbesserung ist durch synthetische Tests nicht bewiesen; die vorhandenen FN-Feldaufnahmen bleiben unzureichend. Kein Geräte-PASS behauptet. FGO unverändert.

## Reproduktion des ergänzenden Tests

```sh
swiftc -module-cache-path /private/tmp/anyvo-motion-swift-module-cache modules/anyvo-motion/ios/MotionSensorState.swift ../outputs/tracking-native-sensor-quality/PortableMotionTests.swift -o /private/tmp/anyvo-motion-portable-tests
/private/tmp/anyvo-motion-portable-tests
```

Die Testmethoden entsprechen den 19 Methoden in `MotionSensorStateTests.swift`; nur die XCTest-Imports/Basisklasse wurden im generierten Nachweis durch lokale Assertions ersetzt. Der reguläre SwiftPM-/XCTest-Lauf bleibt vor dem Build auf einem vollständigen Xcode-Host nachzuholen. Eigener temporärer `node_modules`-Link nach Prüfung entfernt.
