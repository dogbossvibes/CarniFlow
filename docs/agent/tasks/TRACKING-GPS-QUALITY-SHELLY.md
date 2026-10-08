# TRACKING — GPS-/GNSS-Qualität und Shelly-Foreground-Diagnose

Stand: 2026-10-08, Europe/Zurich. **JS-/TS-Teil geprüft und zur getrennten OTA-Auslieferung freigegeben.**
Noch keine GPS-/Shelly-OTA veröffentlicht. Zusätzliche Android-native Änderungen
bleiben separat im lokalen Arbeitsstand; native Kompilierung und Geräte-/Hardware-QA OPEN.

| Feld | Beleg |
|---|---|
| Worktree | `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-gps-quality-shelly` |
| Branch | `feat/tracking-gps-quality-shelly-diagnostics` |
| Feature-Basis | `d807964e05ef26ddc807dc6664a06410d8c98778`; Phase 1 und T-64 enthalten. Commit-/Release-Identitäten werden im separaten OTA-Handoff festgehalten. |
| Agent | Codex Primary, keine Subagents; keine fremden Worktrees/Chats verändert |
| Autorisierung | Nutzer: „Wir können also die OTA-fähigen Teile vorher ausliefern“, unter Beachtung des Chats „01 – RELEASES – iOS / Android / OTA / Stores“. JS-/TS-Auslieferung getrennt für iOS 1.0.4 und Android 1.0.3; kein neuer nativer Build beauftragt. Phase-1-OTAs bereits veröffentlicht, Bericht auf main `docs/agent/tasks/T-65.md`. |
| Release-Scope | 19 JS-/TS-/Test-/Berichtsdateien als isolierter Commit und Plattform-Kandidaten; Kotlin nicht darin. Main-Integration und Production-Veröffentlichung über 01 koordinieren; kein Push/Build/Prebuild/Store-/DB-Schritt. |

Der frühere Tool-STOP war Ausführungsumgebung, keine fehlende fachliche Freigabe.
Reguläre Eskalation für Worktree-Erstellung und lokale Writes wurde hier genehmigt.
Der Bericht in `/private/tmp/ANYVO_TRACKING_GPS_SHELLY_PREFLIGHT_2026-10-08.md`
bleibt ein **historischer Vorbereitungsstand**, kein aktueller Release-Status.
`sources/` read-only; keine neue Dependency, Permission, Background-Service oder Migration.

## Belegter Datenfluss und erhaltene Regeln

Lay: `legen.tsx` → **produktiver `useTrackRecorder.startWarmup`** →
`startPositionSource` → `positionStream`/native Precision oder Expo/Legacy/External →
`sampleToLocationObject` → bestehendes `onFix`/Lay-Processing.
`useGpsWarmup.ts` ist nicht der aufgerufene Lay-Warm-up. Search nutzt denselben
Quellen-/Adapterpfad vor unveränderter Fix-Zulassung/Fusion/End-Auswertung.

Bestehende 15-m-Lay-Startregel, Warm-up-Zulassung, Accuracy-aware Search, Fusion-
Schwellen, Winkel/Projektion, Distanz, Score, Replay, Hundemodell, Marker-/Save-
Vertrag, Persistenz und Background-Ownership bleiben unverändert. Keine neue
Startschranke durch Satelliten/C/N0, keine neue Continuity-/Gap-/Recovery-Semantik.
Zusätzliche Qualität ist Metadatum/Diagnose, kein Messpunkt-/Score-Gate.

## GPS-Qualität und Satelliten

- Neue optionale `altitudeAccuracy` (m), `speedAccuracy` (m/s) und **`courseAccuracy`** (Grad) werden durch Stream → Quelle → typisierten LocationObject-Adapter erhalten. Zentral: endliche Zahl ≥ 0; **0 erhalten**, fehlend/null/negativ/NaN/Infinity unbekannt.
- Das bestehende native `headingAccuracy` im Location-Fix bezeichnet `CLLocation.courseAccuracy` beziehungsweise Android Bearing-Accuracy. Es ist ausdrücklich **nicht** `CLHeading.headingAccuracy` eines separaten Kompasscallbacks. Swift wurde nicht verändert.
- Expo/Legacy erhalten die tatsächlich vorhandene Höhenunsicherheit; nicht gelieferte speed-/Kursunsicherheit bleibt null. Ältere Binaries und BLE/NMEA erfinden keine Qualitätsfelder. Der bestehende externe Positions-/HDOP-Pfad bleibt unverändert.
- Android emittiert zusätzliche Unsicherheiten nur mit API-26-/has-Prüfung und endlichen nichtnegativen Werten. Neue Option `enableGnssStatusAndroid` startet ausschließlich den vorhandenen Statuscallback, unabhängig von Raw-Measurement-Unterstützung. Raw-GNSS-Messungen/Fusion bleiben deaktiviert.
- Optionales GNSS-Diagnoseabo darf bei fehlender Unterstützung oder Fehlern beim Entfernen weder den nativen Positionspfad auf Expo umschalten noch den Recorder-Stop blockieren. Zwei Regressionen sichern das ab.
- Eigenes generationgebundenes Statusabo wird mit seinem Source-Handle entfernt. Bei Native-Startfehler wird das eigene Location-Abo vor Expo-Fallback entfernt; fehlgeschlagener Legacy-/Fallback-Start beendet Diagnosezustand. Alte/gestoppte Diagnoselieferungen überschreiben keine neue Quelle.
- Der rein lesende Diagnose-Snapshot enthält Qualität/Quelle/Provider/Zeit und GNSS-Status, **keine Koordinaten**. Observer-Fehler unterbrechen die Aufnahme nicht. Kein neuer Standortdienst wird von der Anzeige gestartet.
- Interne QA-Oberfläche zeigt Fix-Alter und unbekannte/stale Werte, Android **beobachtete versus im Fix verwendete** Satelliten, C/N0 Ø/max und Statusalter. Frische verwendet ausschließlich das bestehende Fix-Alterslimit zur Anzeige. iOS/Expo/External/alte Binaries bleiben bei nicht verfügbaren Satellitenwerten unbekannt. Keine Satelliten aus Positionsgenauigkeit geschätzt.
- Route bleibt hinter bestehendem `DiagnosticsRouteGate` mit internem Testerzugang. Kein neuer Kundenflow, keine Auth-/RLS-Änderung oder zusätzliche Datenspeicherung.

**Binary-Grenze:** JS erhält vorhandene Felder ohne neue native API. Die zusätzlichen
Android-Emissionen und die Status-vs-Raw-Trennung benötigen ein **neues passendes
Android-Binary**. In vorhandenen Binaries wird die additive Option ignoriert; fehlende
Werte bleiben unbekannt. Keine native Kompilierung oder Build-Abnahme behauptet.

## Shelly-Machbarkeitsprototyp

Expliziter Start/Stop und Auswahl eines BTHome-Gerätekandidaten im internen QA-Screen.
Anzeige: letzter **Empfang**, Button-Typ, Paket-/Duplikat-/Unlesbar-Zähler, tatsächlich
verfügbare Batterie. Keine erfundene Verbindung, kein Unerreichbarkeits-Timeout und
kein Persistenz-/Speicher-Erfolg. Arbiträre BTHome-Geräte werden nicht als verifizierte
Shelly-Hardware ausgegeben. Kein Mapping zu Gegenstand/Winkel/Ende oder anderen Aktionen.

- Strict BTHome v2: FCD2-Service-Daten, Header/Encryption/Reserved-Bits, bekannte 0/1/0x3A/F0/F1/F2-Objekte mit festen Längen. Unvollständige/verschlüsselte/unbekannte/duplizierte Felder sowie unbekannte Button-Codes werden nicht durch Erraten übersprungen.
- Button 1/2/3/4/5/6/128 unterstützt; Button 0 ist kein Klick. Packet-ID optional, Payload-Fingerprint zusätzlich. Gerätebezogene Burst-Deduplizierung erlaubt geänderte IDs, 255→0, Neustart und Clock-Rollback.
- Das 2-s-Diagnosefenster orientiert sich an kurzen wiederholten Advertisements; **Hardwareprüfung OPEN**. Ohne Paket-ID bleiben identische schnelle Klicks versus Wiederholungen unentscheidbar; Anzeige weist darauf hin. Kein pauschaler Tracking-Button-Cooldown.
- Gemeinsame konservative BLE-Lease serialisiert externe GPS-Scans/Verbindungen und Diagnose. Die Diagnose startet und stoppt ausschließlich ihren eigenen Scan, zerstört keinen fremden Manager und trennt keine GPS-Verbindung. Während externes GPS aktiv ist, wird Diagnose abgelehnt.
- Own-generation guards, Permission-Wartephase, unavailable Modul, Radio-off, Scanfehler, App-Wechsel und Unmount sind abgesichert. Native Start-/Stop-Promises werden bis zur Bereinigung abgewartet; Zuständigkeit erst danach freigegeben. Fehlgeschlagener Stop behält die Lease und bietet expliziten Retry. Late callbacks bleiben wirkungslos.
- `externalGps` erhält NMEA-Parsing/Throttle/PushPoint unverändert; eigene Scan-Timer und Connect-/Disconnect-Bereinigung werden für diesen Koordinationsvertrag gehalten. Mehrere Notify-Abos entfernt, späte Verbindung und doppelte Disconnect-Aufrufe isoliert. Fehlerhafte native Bereinigung gibt kein unsicheres BLE frei.
- **Nur Vordergrund.** App-Wechsel stoppt die Diagnose; Rückkehr braucht expliziten Neustart. Kein iOS-/Android-Locked-screen-PASS, keine Background-/Restoration-Architektur.

Späterer Remote-Speichervertrag: `commitMarker` aktualisiert Store und fängt lokale
SQLite-Fehler ab; fulfilled Promise ist kein dauerhafter Save-ACK. Fachliche Zulassung,
eindeutige Run-/Session-/Action-ID, lokaler dauerhafter Erfolg, deduplizierte Marker-ID
und Retry-Vertrag müssen vor echtem Button-Mapping separat geklärt werden.

## Verifikation und Grenzen

- Abschließender breiter Tracking-/Screen-/Release-/Native-Contract-Lauf nach allen Codeänderungen: **218 Suites / 2659 Tests PASS**. Gezielt **9 Suites / 83 Tests PASS** einschließlich Recorder-Start/Background-/Search-Ownership (Zahlen überlappen, nicht addieren). Jest meldete nach dem erfolgreichen breiten Lauf einen offenen Async-Handle; Prozess endete mit Exit 0. Kein zusätzlicher Geräte-PASS daraus abgeleitet.
- Ganze TypeScript-Prüfung `tsc --noEmit --incremental false`: **PASS** nach letzter Code-/Teständerung.
- ESLint auf allen geänderten/neuen TS-/TSX-Dateien: **0 Fehler, 1 bestehende `externalGps.ts`-require-Warnung**.
- `git diff --check`: **PASS**. Nur lokale Dateien des angegebenen Scopes; Main-Produktcode nicht mit neuen Features verändert.
- Neue Regressionen führen den echten Stream-/Source-/Adapterpfad mit Native-/Expo-/Legacy-/External-Mocks aus und prüfen Unknown/0/Fehler-/Late-Callback-Fälle. GNSS-Diagnose prüft beobachtet/verwendet, Quelle, Frische und Generation; BLE prüft Packet-Parsing, Burst-/Wraparound, Permission-Cancel, Radio/App/Scanfehler, Async-Start/Stop und exklusive GPS-Ownership. Bestehender externer NMEA-Notify liefert im Test weiterhin einen Punkt.
- **OPEN:** native Kotlin-Kompilierung/Verlinkung, tatsächliche GPS-/Satellitenfelder, Hardware-BLE, Permissions an Geräten, echte UI/Dark Mode/Accessibility, Hintergrund-/Locked-screen-Verhalten und Build49-Background-/Phase1-Abnahme. Jest und TypeScript ersetzen diese Nachweise nicht.

## OTA-Split und Koordination mit 01

Am 2026-10-08 frisch geprüft: iOS 1.0.4 (49), EAS-Build
`994f04ba-0e1e-4cba-9888-79059a225213`, und Android 1.0.3 (44),
EAS-Build `c2b7ef45-6d0a-4340-91d4-6f4fefb03418`, beide FINISHED auf
Production. Expo 54.0.36, React Native 0.81.5, BLE-PLX 3.5.1, Expo Location
19.0.8 und Expo Modules Core 3.0.30 stimmen zwischen dem jeweiligen
nativen Build-Quellstand und der aktuellen Plattform-OTA-Basis überein;
Precision-Swift/Kotlin und Modulkonfiguration an der Basis ebenfalls unverändert.
Dies belegt den Quellvertrag, nicht die BLE-Verfügbarkeit an einem realen Gerät.

Plattform-Kandidaten werden ausschließlich auf den bereits veröffentlichten
Phase-1-OTA-Commits `f8fb921` (iOS) und `7e0f040` (Android) aufgebaut.
Nur dieser JS-Patch wird übernommen, keine zusätzlichen unveröffentlichten
Main-Features und keine neuen nativen T-64-/Widget-/GNSS-Änderungen. Der komplette
Main-Release-Kandidat und dessen Geräte-QA im Chat 01 bleiben ein eigener Scope;
dort vor Veröffentlichung Baseline/Ancestry erneut frisch prüfen.

Die zusätzliche Kotlin-Datei unten ist ausdrücklich **nicht im OTA-Commit**.
Für einen späteren Android-Build mit 04/01 koordinieren; Android-Widget-Arbeit liegt
noch separat. T-65 existiert in mehreren Chat-Arbeitsständen; dieser Bericht hat
einen eindeutigen Namen und überschreibt keinen fremden T-65-Bericht.

## Dateiliste

Product:
- `app/dev/precision-location-test.tsx`
- `features/tracking/components/PositionQualityDiagnostics.tsx`
- `features/tracking/components/ShellyDiagnosticsPanel.tsx`
- `features/tracking/utils/locationFixQuality.ts`
- `features/tracking/utils/positionDiagnostics.ts`
- `features/tracking/utils/positionStream.ts`
- `features/tracking/utils/positionSource.ts`
- `features/tracking/remote/bthomeButton.ts`
- `features/tracking/remote/shellyDiagnostics.ts`
- `lib/bleOperationLease.ts`
- `lib/externalGps.ts`
- `modules/anyvo-precision-location/index.ts`
- `modules/anyvo-precision-location/src/AnyvoPrecisionLocation.types.ts`
- `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AnyvoPrecisionLocationModule.kt`

Tests:
- `features/tracking/utils/__tests__/qualityPipeline.test.ts`
- `features/tracking/utils/__tests__/positionDiagnostics.test.ts`
- `features/tracking/remote/__tests__/bthomeButton.test.ts`
- `features/tracking/remote/__tests__/shellyDiagnostics.test.ts`
- `lib/__tests__/externalGps.ownership.test.ts`

Eigenbericht: diese Datei. Globale Statusdateien ausschließlich im Rahmen der
separat autorisierten Phase-1-Integration auf main aktualisiert; hier nicht verändert.

## Continuity-Entscheidungsvorlage — ausdrücklich NICHT beschlossen

Empfehlung zur Produktentscheidung: unbekannte Bewegung sichtbar kennzeichnen, nicht als sicher gemessene Strecke/erfolgreich bewertete Suche behandeln; nach echten Unterbrechungen neue End-Evidenz verlangen. Kein neues Zeitlimit oder automatischer Reset beschlossen, keine historischen Daten/aktuellen Berechnungen verändert.

| Fall | Karte / Replay | Gemessene Distanz / unbekannte Strecke | Fortschritt / Score | Endbestätigung / Grace | Persistenz | Entscheidungsvorschlag, noch offen |
|---|---|---|---|---|---|---|
| Kurze Lieferpause | bestehende Punkte/Polyline, keine allgemeine neue Gap-Trennung | vorhandene Punktverbindung kann unbekannte Bewegung überbrücken; keine Messung dazwischen | nur verarbeitete Samples, vorhandener Cursor bleibt | transiente Historie bleibt; Phase-1-Grace verlangt für Timer frische vorhandene Evidenz | vorhandene Puffer | Lieferpause versus echte Unterbrechung definieren; Unsicherheit sichtbar lassen, keine Zwischenpunkte erfinden |
| Längere Lücke | keine neue Segmentierungsregel | unbekannter Weg nicht rekonstruierbar; vorhandene Distanzberechnung unverändert | Fortschritt kann nach neuem Fix springen; fehlende Bewertung nicht erfinden | Historie derzeit ohne neue Gap-Policy; Grace-Frische allein ersetzt keinen vollständigen Continuity-Vertrag | nur tatsächlich vorhandene Samples/RunState | Unterbrechung markieren; Anschluss nicht als gemessen bewerten; neue End-Evidenz, Grace-Reset entscheiden |
| Pause / Resume | keine Search-Punkte während Pause, bestehender Anschluss danach | Pausenweg unbekannt; bestehende Distanz weiter unverändert | Zustand bleibt, keine neue Dauer-/Score-Regel | Phase 1 blockiert während Pause; Once bleibt, ursprüngliche Grace-Startzeit bleibt vorhanden | vorhandener RunState | explizite Segmentgrenze, unbekannten Pausenweg ausschließen; End-Historie/Grace nach Resume bewusst entscheiden |
| Screen-Unmount | Source-Abo entfernt; Lay-Unmount stoppt weiter Session | keine neuen Hook-Punkte, unbekannter Anschluss | Runtime stoppt; spätere Fortsetzung über bestehenden Recovery-Pfad | Timer/alte Voice beendet, neue Hook-Historie; endFired bleibt Recovery-Beleg | Store/SQLite/Pending nach vorhandenen Regeln | Unterbrechung sichtbar; frische End-Evidenz bei Fortsetzung; keine neue Background-Ownership |
| Prozessneustart | nur persistierte Punkte; keine erfundene Verbindung | unbekannte Bewegung und mögliche letzte unpersistierte Samples offen | gespeicherter Cursor, bekannte Analytics-Lücke im Kurzabschluss | transiente Historie/Grace neu; endFired verhindert Wiederholung | Hundeslot/SQLite, in-memory Lay-Runtime kein vollständiger Restart-Vertrag | explizite Recovery-Grenze; Lücke/Qualität offen anzeigen; keine erfolgreiche Bewertung ergänzen |
| Session-/Hundwechsel | bestehende separate Referenz/Run-/Overlaydaten | keine fachliche Verbindung zwischen Sessions | neuer Start, vorhandene hundebezogene Speicherung | Phase-1-Run-ID isoliert Historie/Grace/Voice, keine Übernahme | vorhandene Bindung/Registry, in-flight-Reihenfolge separat auditieren | harte fachliche Sessiongrenze bestätigen; late deliveries und Save-ACK eindeutig binden |

## Offizielle Quellen und nächste Schritte

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) / [Location](https://docs.expo.dev/versions/v54.0.0/sdk/location/): passend zur vorhandenen Expo-Version gelesen; Optionen/Providers erhalten.
- [Android Location](https://developer.android.com/reference/android/location/Location) / [GnssStatus](https://developer.android.com/reference/android/location/GnssStatus): Availability-/has-Prüfungen; beobachtet versus im Fix verwendet.
- [Shelly Button Tough 1 ZB](https://shelly-api-docs.shelly.cloud/docs-ble/Devices/BLU_ZB/button1_ZB/) / [BTHome v2](https://bthome.io/format/): kurze Button-Advertisements und strukturierte Pakete, optionale IDs/Encryption. Konkrete Gerätefirmware noch nicht aufgenommen.
- [Apple Background BLE](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) / [Android Background BLE](https://developer.android.com/develop/connectivity/bluetooth/ble/background): OS-Grenzen; Folgerung: Foreground-Parser-/Mock-PASS belegt keine zuverlässige Steuerung bei gesperrtem Bildschirm.

JS-OTA-Kandidaten separat prüfen und zur Veröffentlichung an 01 übergeben.
Native Kompilierung/kompatibles Android-Binary separat beauftragen;
danach reale GPS-/Shelly-Tests mit Device/Firmware/Binary/OTA-ID. Continuity-Regeln
zu Lücken, Pause/Resume, Distanz/Score/End-Evidenz und Persistenz ausdrücklich
entscheiden. Watch, konkrete GNSS-Geräte und Planer bleiben spätere Aufträge.
OTA-fähige JS-Auslieferung ist autorisiert; eine GPS-/Shelly-Veröffentlichung ist
zum Zeitpunkt dieses Berichts noch nicht ausgeführt. Kein neuer nativer Build autorisiert.
