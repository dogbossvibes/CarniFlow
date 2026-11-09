# Fährtendiagnose – read-only Audit 08.10.2026

## Auftrag und Ergebnis

Nutzer: „Fährtendiagnose zum Testen weiter ausbauen, um Fehler zu finden; alles analysieren.“
Analyse abgeschlossen. Keine Umsetzung, Tracking-/Continuity-/Score-Regeländerung,
Git-Schreibaktion, Veröffentlichung oder DB-Mutation. Dieses Dokument ist ein
Einzelbericht; Gesamtstatus und Routing bleiben in den bestehenden Agent-Dokumenten.

Basis: `/Users/moyo/canisflow-worktrees/anyvo-main`, `main`,
`1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`.
Die fünf vorhandenen Dokumentänderungen wurden nicht überschrieben.
Shared-/Exportprüfung: MASTER; native Ergänzungen: Chats 03 und 04.
Chat 02 war mit Auswertung/Export und einer direkten Nutzerentscheidung belegt.
Der zusätzliche Diagnose-Audit wurde dort zunächst vorgemerkt, dann nach eigener
Shared-Prüfung aufgehoben, damit keine doppelte Analyse entsteht. Die laufende
Auswertung bleibt davon unberührt. Ergebnisse wurden Chat 02 übermittelt; kein
Diagnose-Umsetzungsauftrag daraus abgeleitet.

Belege: iOS-Abschluss-Turn `01a11bb0-b584-7971-8a6b-8b26b9946390`,
Android-Abschluss-Turn `01a11bb0-a0d5-7013-91dd-bc00d3731963`.
Native Befunde sind Source-/API-Analysen, keine frischen Hardwaretests.

## Bereits vorhanden – wiederverwenden

| Bereich | Tatsächliche Abdeckung | Grenze |
|---|---|---|
| Kunden-Fährtendiagnose | Gespeicherte Punkt-/Marker-/Distanz-/GPS- und Suchlaufwerte, Analyseverfügbarkeit, Teilen | Ergebnisübersicht, keine vollständige Ursachendiagnose; GPSwert stammt aus gelegter Linie |
| Interne QA Legen | raw/detector/line, getrennte Distanzen und Counts, Markerherkunft, Start-/Bewegungsdiagnose, Kandidaten-Motion, Fusion, Richtung/Schärfe | Live-Beobachtung und Finish-Rekonstruktion unterscheiden; IMU-only-Finishdaten nur letzter ca.20s-Ring |
| Interne QA Suchen | raw/filtered/display/run/replay-Statistiken, Rejects, Cursor, Referenzlängen, Gegenstände, Ende/Grace, Dwell, Voice, Replay-Parität | Limits/Resume-Teilcapture; keine vollständige OS-/Persistenz-/Sync-Timeline |
| Hintergrund-Legen | Sessiongenaue Task-/Handler-/Fix-/Persist-/Flush-/Permission-/Resume-/Mismatch-/Duplicate-Zähler | Export verdichtet auf Counts und jeweils letzte Zeit; Search hat keinen gleichwertigen Pfad |
| Supportexport | Lokale relative Geometrie/Zeiten; Capture bevorzugt, ehrlich markierter persisted-Fallback; Privacy-Gate; BackgroundLay-Block | QA-only UX-Felder reduziert; kein Live-Mitschnitt wird aus Altbestand erfunden |
| Build & OTA | Diagnose-UI zeigt aktuellen Build/Runtime/Update/Embedded-/Fallbackstatus | Export enthält keine aufnahmezeitliche Identität; heutiger Stand kann Aufnahmeversion nicht ersetzen |
| Feldtests/Replay | 1FN/2FN-Profile, echte Regressions-Fixtures, deterministische Mathe/Engine und Darstellung | Ansichts-Replay ist kein vollständiges Wiederabspielen aller Live-Entscheidungen; Testprofile nicht an exportierte Aufnahme gebunden |

Kernquellen: `features/tracking/utils/{customerTrackDiagnosis,qaSessionCapture,
qaSearchCapture,qaTrackExport,supportDiagnostics,backgroundLayDiagnostics,
buildOtaIdentity,fieldTestProfiles}.ts`, Services `qaTrackExportService.ts` und
`supportDiagnosticsService.ts`, `app/dev/precision-location-test.tsx`,
`app/track/run.tsx`, Recorder und native Bridge.

## Belegte Lücken und konkrete Verbesserungen

### 1. Aussagekraft der Diagnose zuerst korrigieren (Priorität 1, Shared)

- Interner QA-Export lädt keinen BackgroundLay-Block: `qaTrackExportService.ts:107`.
  SupportService hängt ihn dagegen an Capture und persisted-Fallback an. Dieselben
  vorhandenen Beobachtungen sessiongenau für QA verfügbar machen.
- `qaTrackExport.ts:331`: `motionCaptureAvailable` ist von der Zahl gespeicherter
  Kandidaten abhängig. Ein Lauf ohne Winkelkandidaten ist kein Beweis dafür, dass
  Motion nicht lief. Verfügbarkeit, gestartet, erste Probe, frisch und Kandidaten-
  kontext getrennt führen. Isolierter Builder-Versuch: leeres Kandidatenarray → false.
- `useTrackRecorder.ts:413`: aufgelöstes `start()` setzt motionReady, obwohl die API
  bei fehlendem Modul oder Startfehler false liefern kann. `modules/anyvo-motion`
  ist apple-only; Android besitzt dort keine Sensorimplementierung. Echte Start-
  resultate/Samples statt Proxy melden; keine Android-Fusionfähigkeiten erfinden.
- Erster aggregierter Motioncallback setzt zugleich ersten Pedometercallback
  (`useTrackRecorder.ts:403`). Tatsächliche Sensorlieferungen getrennt erfassen.
- `run.tsx:681`: qaEndRef wird nur bei QA-on gefüllt. Der Support-Level verwendet
  später denselben Ref: fehlendes Ende im Export kann fehlende Diagnose statt
  fehlendes reales Ereignis bedeuten. Eigene erlaubte Support-Beobachtung verwenden
  oder Zustand ausdrücklich unbekannt markieren.
- `run.tsx:950`: hapticFired wird bei Enderef pauschal true, voiceFired aus der
  Einstellung abgeleitet. Das beweist weder erfolgreiche Ausgabe noch Wahrnehmung.
  Trigger, angefordert, API-/Callback-Ergebnis und unbekannt getrennt melden;
  vorhandene detaillierte Voice-Diagnose wiederverwenden.

Akzeptanz: Straight-line mit aktiver Motion, fehlendes Modul/start=false,
QA-on/off-Ende und fehlgeschlagene Haptik/Voice ergeben korrekte, unterschiedliche
Diagnosestatus; Produktionsentscheidungen und gespeicherte Fährte bleiben identisch.

### 2. Fehlerereignisse bei Reduktion erhalten (Priorität 1, Shared)

`qaSearchCapture.ts:106,278,405`: maximal4000 Rohfixe,3000 gefilterte Fixe,
500 Cursor-Samples (nicht häufiger als1s),600 exportierte Punkte pro Strom.
Zähler können die erfassten Teilpuffer beschreiben, nicht den ganzen langen Lauf.
Gleichmäßige Reduktion garantiert keine Erhaltung einzelner Rejects, Gaps oder Ecken.

Frisch isoliert reproduziert mit echtem Builder und stubbed Turn-Paritätsfinder:
1200 Rohfixe, davon genau einer rejected bei Index600 →600 exportierte Rohpunkte,
keiner rejected; rejectedSearchPointCount bleibt1, truncated.raw=false.
Kein Feld-/Native-Nachweis. Dies belegt Verlust des konkreten Fehlerpunkts durch
Exportreduktion; der summarische Rejectcount bleibt korrekt.

Empfehlung: bounded Ereignisfenster vor/nach Reject, Quellenwechsel, Resume,
Winkel, Objekt und Ende zusätzlich zu einer reduzierten Gesamtroute erhalten.
Limitzustände je Stream mit observed/captured/exported/dropped, Zeitabdeckung,
Reduktionsverfahren und Coverage kennzeichnen. Separate globale Zähler weiterführen.

Akzeptanz: 30min-Lauf, hoher Takt und Fehler am Anfang/Mitte/Ende; markierte
Fehlerfenster bleiben im Export, fehlende Abdeckung wird sichtbar, Speicherbudget
bleibt begrenzt. Keine größeren unbeschränkten Rohpuffer als Ersatz.

### 3. Abbruchfeste Diagnose und Fehler markieren (Priorität 1, Shared)

Capture-Speicherung liegt überwiegend am regulären Stop (`useTrackRecorder.ts:689`,
`run.tsx:915`); CandidateLog liegt nur im RAM. Bei Crash/Kill fehlen Livekontexte.
Retention beträgt je Capturebereich5 Sessions; Hintergrund-Events haben im
geprüften Modul dagegen kein Cap/Cleanup und werden pro Ereignis separat gespeichert.

Empfehlung: begrenzte, periodisch gesicherte Diagnose-Checkpoints und Timeline;
Aufnahmezustand offen/beendet/unterbrochen/unbekannt kennzeichnen. Testerfunktion
„Fehler jetzt markieren“ sichert relatives Ereignis plus Fehlerfenster, ohne einen
produktiven Gegenstand/Winkel/Endmarker zu erzeugen. Relevanten Testlauf bewusst
anheften statt beim sechsten Folgelauf still verlieren; geregeltes Löschen/Retention.
OS-Kill-Ursache ohne Beleg unbekannt lassen, keine ununterbrochene Kill-Aufzeichnung
versprechen. Keine globale Logflut oder synchronen Diagnose-Writes im kritischen Fixpfad.

### 4. Ablauf bis zum dauerhaften Speichern erklären (Priorität 1, gemischt)

`backgroundLayDiagnostics.ts:110` überschreibt wiederholte Ereigniszeiten.
Counts sind vorhanden, Reihenfolge fehlt im Export. Source/provider gehen bei
`sampleToLocationObject` nicht in die Roh-Capture ein. Handover des Legens von
Foreground-Source zu Expo-Task und mögliche Binding-/Generationwechsel brauchen
explizite Diagnose. Search separat, kein Lay-PASS als Search-Nachweis verwenden.

Empfehlung: relative monotone Timeline mit Phase, Stream-/Prozessgeneration,
angeforderter/effektiver Quelle, Callback/Batch/Fixalter, accepted/rejected-Grund,
Marker-write-Ack, Flush-/SQLite-Ack, Queuegröße und letzte dauerhaft gespeicherte
Sequenz. PersistAttempt != Erfolg; Taskregistration != laufender Service.
Lokale Persistenz, Sync-Queue, Remote-Ack und Diagnose-Persistenz getrennt führen.
Cloudstatus nur aus echten vorhandenen Sync-Ergebnissen, nicht aus Netzwerkstatus.
Native Messzeit/Empfangszeit/Emitzeit/JS-Ankunft voneinander trennen; Expo-
Background-Quelle braucht eigene Messpunkte, Precision-Manager allein reicht nicht.

Akzeptanz: wiederholtes Screen-off/Resume, Offlinespeichern, Write-/Flushfehler,
Callbackbatch, Pause und Restart sind zeitlich zuordenbar; gleiche Session,
keine fremde Fährte, keine doppelte Verarbeitung, Diagnose darf nicht steuern.

### 5. Reproduzierbarer Feldtestbericht (Priorität 2, Shared)

Aufnahmezeitliche App-/Build-/Runtime-/Algorithmusversion, Modus/Provider und echte
Native-Capabilities plus Testprofil und manuell beobachtete Sollfolge speichern.
Aktuelle Build-UI wiederverwenden, nicht neu bauen. Support weiterhin ohne
absolute Ortsdaten, Personen-/Device-/Session-IDs; öffentliche Release-IDs nur
mit bewusst geprüftem Schema/Privacy-Gate, sonst nichtidentifizierende Versionen.

Bestehende Engine-/Fixture-Wiederholung ausbauen: reales Live-Entscheidungsprotokoll
gegen Finish-Rekonstruktion vergleichen, inklusive verworfener Kandidaten und
Persistenz-Acks. Fehleransicht mit relativer Karte, Roh-/gefilterter-/gespeicherter
Linie, zeitlichem Ereignisfenster und sicher belegtem Grund. Aus einem sichtbaren
Aussetzer keine GPS-/OS-/Hardwareursache erraten. Gemessene Handlerposition und
projizierte Hundeposition klar trennen; Geometrie-Parität ist keine Feldwahrheit.
Marker-Sollfolge und vermessene Kontrollstrecke unabhängig vom Detektor erfassen.

### 6. Native iOS-Erweiterungen (Priorität 2, Build)

CoreLocation-Batchzahl/Größe/ausgewählter Fix, received/stale/throttled/emitted,
monotone Empfangs- und Sensorzeiten, Error-/Pause-/Resumezustände exportierbar
machen. Aktuell einige Zähler nur Debug-print, Batch nutzt locations.last.
Präzisions-/Permissionverlauf und TemporaryFullAccuracy-Ergebnis über vorhandene
APIs teilweise bereits Shared erfassbar; echte zusätzliche native Messpunkte
brauchen Binary. MotionSamplezahl, echtes Sensoralter, getrennte DeviceMotion/
Pedometer/Activity-Callback-/Error-/Authzustände und Timerdrift statt Null-Proxies.

### 7. Native Android-Erweiterungen (Priorität 2, Build)

Monotone Fix-/Empfangszeit, Service-/Prozess-/Task-Ack-Lifecycle, Bildschirm-
interaktiv, PowerSave/Doze/Optimierungsausnahme, Callback-/Persistenzlatenzen.
30s-Background-Batchintervall von tatsächlichem Punktverlust trennen.
AppStatebackground beweist nicht Screen-off. Keine Akku-Ausnahme/WakeLock-
Strategie oder zweiten Service allein für Diagnose einführen.

Precise/coarse und Backgroundscope im Permissionverlauf getrennt führen,
unknown nicht zu denied machen. Vorhandene GNSS-Fähigkeit, aktivierte Callback-
registrierung, erster/frischer Status und wirklich beobachtete Satelliten/CN0
statt fehlende Werte als0 darstellen. Aktuelles Build44 kann die neue JS-Option
für separate GNSS-Statusaktivierung nicht implementieren; entsprechendes Kotlin-
Feature-WIP benötigt neuen Build. Raw-GNSS-Fusion nicht daraus ableiten.
Android-Motion wäre ein eigener Produktauftrag, nicht bloße Diagnoseverkabelung.

### 8. Karten-, Zubehör- und Langlaufkontrolle (Priorität 2/3)

Kartenprojektion/Mapready/Referenzladezeit/Viewport/Rotation/Pitch/Maßstabszustand
bei Fehlerereignissen ergänzen: gesunder Datenpfad kann trotzdem falsch gerendert
werden. Bestehende Distanz-/Referenzlängendiagnose und Maßstabtests wiederverwenden.

Bei tatsächlich vorhandenem External-GPS/Shelly nur beobachtete BLEzustände,
Paket-/Parser-/Click-Rejects, Dedupe, Stream-/Lease-Konflikt, Quelle/Alter und
Batteriezustand erfassen, keine MAC/Rawidentitäten im Support. Shelly ist derzeit
Vordergrunddiagnostik; ein Click ist kein bestätigter Fährtenbefehl. Erst bei
separat beauftragter Steuerung wäre Command→Ack→Persistenzdiagnose sinnvoll.

Diagnosekosten messen: Puffer-/Dateigröße, Writecount/Latency, Callbacklatenz,
UI-Jank und Batterie mit Diagnosean/aus. Speicherbegrenzung/Retention und
best-effort-Verhalten brauchen eigene Tests. Kein Algorithmus-A/B aus bloßem
Logging-Schalter: identische Replayeingaben müssen identische Produktionsoutputs
haben; reale zeitliche/batterieseitige Auswirkungen separat am Gerät prüfen.

## Geplante reale Testmatrix – noch nicht ausgeführt

| Szenario | Nachweis |
|---|---|
| 1FN/2FN, links/rechts/spitz, kurze Schenkel, Gegenstand am Winkel/Ende | Unabhängige Sollfolge, False-positive/negative und Marker-Ack |
| Stillstand/Drift, schlechter Fix, Einzel-/Mehrfachsprung, alter erster Fix | Native- und JS-Reject mit Zeitfenster; Cursor vs Persistenz |
| Legen UND Suchen offen/Screen-off/Hosentasche, wiederholt Resume, 20–30min | Quellenhandover, Sensor-/Callback-/Commitlücken getrennt |
| iOS full/reduced, Android precise/coarse, BGgrant/revoke, Servicesoff/on | Tatsächliche Rechte-/Quelle-/Samplelieferung statt Startproxy |
| Pause, Offline, Sync-/Write-/Flushfehler, Restart | Letzte dauerhafte Sequenz, offene Queue, Restore, Diagnostic-Coverage |
| Normaler Appwechsel, Swipe-away, Processkill, Force-stop, Crash | Unterschiedliche Zustände; Killgrund bei fehlendem Beleg unbekannt |
| Android Pixel + Samsung, PowerSave/Doze | Service-/Power-/Callback-Evidenz; kein OEMkill aus Stille schätzen |
| Native/Expo/External-Fallback, fehlende Motion/GNSS, Shellyparallel | Effektive Quelle/Capability, kein erfundener Sensor-/Befehl-PASS |
| Export nach Restart, mehr als5 Läufe, Pin/alteSchemas/corrupt/largefont | Vollständigkeit, Retention, Lesbarkeit, Privacy, stabile Exportwahl |
| Uhrsprung/Reboot und großer Diagnoselauf | Monotone Zeit, neue Prozessgeneration, begrenzte Kosten |

## Frische Prüfungen und Grenzen

MASTER:7 Suites/131 Tests PASS: qaTrackExport, qaSearchCapture,
supportDiagnostics, customerTrackDiagnosis, customerDiagnosticsService,
qaTrackExportService, qaSessionCapture. Zwei isolierte reine Builder-Versuche
wie oben; Turn-Paritätsfinder im Reduktionsversuch gestubbt, keine Native-/GPS-
Simulation. `git diff --check` PASS vor Dokumentation; danach erneut prüfen.
Chats03/04 führten keine neuen Test-/Compiler-/Geräteabnahmen durch.
Kein vollständiger Typecheck erforderlich für reine Sourceanalyse/Dokumentation.

## Auslieferungsabgrenzung

Chat01 hat in separat direkt freigegebenem Auftrag inzwischen Maßstab-OTAs
veröffentlicht: iOS1.0.4 Source `9c176959d08c839a799464efd47b1d3f8108555a`,
Group `1de50d5b-284f-46e2-a4f9-4cc2d8683fef`; Android1.0.3 Source
`60ae4d5ea77d8c7c93c36eb61c9e8c3d349d96ec`, Group
`8e92eccb-ac1e-40c4-a140-182921760954`. Maßstab-Gap aus älterem Audit ist
für diese veröffentlichten Bundles geschlossen, Geräteabnahme weiterhinOPEN.
Diese Veröffentlichung gehört nicht zum vorliegenden Analyseauftrag.

Chat04 frisch per EAS: Android1.0.3(44), Build
`c2b7ef45-6d0a-4340-91d4-6f4fefb03418`, FINISHED; Source
`5a0610b6afc40625c768e5930e6c67fa4e25c6f2`; keine Play-/Installationsabnahme.
Android1.0.4(45) bleibt native Vorbereitung. Dokumentierte iOS1.0.4(49)-
Quellbelege durch03 gelesen, kein neuer EAS-/Store-/Gerätecheck daraus.
Fremde Kotlin-/Feature-/Health-/Website-Arbeit blieb geschützt.

Offizielle Quellen: Expo SDK54 Location/Updates,
https://docs.expo.dev/versions/v54.0.0/sdk/location/,
https://docs.expo.dev/versions/v54.0.0/sdk/updates/;
Apple CMLogItem timestamp (Zeit seit Boot),
https://developer.apple.com/documentation/coremotion/cmlogitem/timestamp;
Android Location monotone Fixzeit,
https://developer.android.com/reference/android/location/Location;
Android Doze,
https://developer.android.com/training/monitoring-device-state/doze-standby.

## Empfohlener nächster beauftragbarer Scope

Zuerst ausschließlich Shared-Diagnosekorrektur: ehrliche Verfügbarkeit/Outputstatus,
vorhandenen Backgroundblock im QA-Export, Aufnahmeidentität/Coverage und
ereigniserhaltende Exportreduktion. Anschließend begrenzte Checkpoints,
Fehlermarkierung und Lifecycle-/Persistenz-Timeline mit Kosten-/Paritytests.
Zunächst geplanter Owner Chat02; anschließend direkter Nutzerfolgeauftrag in
Chat03 bestätigt (Turn `01a11bbd-1c53-7901-b26d-858dd7bfb5ae`): erster
Shared-Ausbau für Background-QA-Export, Testidentität und Quellen-/Lifecycleverlauf
wird isoliert allein von03 umgesetzt.02 behält Auswertung/Export; vor Integration
Abhängigkeiten prüfen. Weitere Auditvorschläge bleiben PLAN, native Messpunkte
später03/04. Noch kein fertiger Implementierungs-/Test-/Integrationsnachweis.
Umsetzung, Tests, Integration, Geräte-QA und Veröffentlichung bleiben getrennt.
Keine Umsetzung/Freigabe aus diesem Audit ableiten; Git-/Release-/DB-Aktionen
weiterhin separat freigeben. Native Messpunkte brauchen passende neue Binaries.
