# Heute für meine Hunde und CarPlay-Terminhinweis

Stand: 2026-10-14. Lokaler Implementierungskandidat, uncommitted. Keine OTA, kein App-Build, kein Store-, Push-, Merge- oder Live-DB-Schritt.

## Auftrag, Quelle und Ownership

Direkter Werkstattauftrag: userMessage `01a1392d-113e-73c2-bd81-7bb20e5a08ff`, Turn `01a1392d-0af5-7fe3-bb4b-28b3c5327f97`: Alltagswidget/CarPlay umsetzen, Gruppenabos ausschließlich fachlich planen. Die menschliche Nachricht wurde von 03 gelesen. Gruppenabos liegen separat bei 06; HomeView ist nicht beauftragt.

Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-ios-daily-widget-carplay`.
Branch: `feat/ios-daily-widget-carplay`.
HEAD/Basis: `a2361efea416badc118206f517a98875569f9561`, in MASTER dokumentierte veröffentlichte iOS-1.0.4-Planerquelle vom 13. Oktober. Keine eigene EAS-Liveprüfung in diesem Implementierungsauftrag. Canonical main bleibt gesondert `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`; fremde Dokumentationsänderungen erhalten. Frühere 03-QA-Worktrees und alle `sources/` bleiben unberührt.

03 besitzt gemeinsamen TS-Snapshot/Publisher/Auth-/Kalender-/Hundanschluss und iOS. 04 besitzt ausschließlich `modules/anyvo-daily-widget/android/**`; Android-Quellen wurden hier lesend geprüft, nicht übernommen oder verändert. Die gemeinsame Expo-Module-Konfiguration registriert beide Plattformen; ein Android-Gesamtkandidat muss den geprüften 04-Patch zusätzlich integrieren. 07 liefert UX/lesenden Review. Keine weiteren Writer oder Chats angelegt.

## Analyse und Umsetzung

Vorhandenes Schnellstartwidget ist reine Navigation; die Liegezeit-V2-Live-Activity und App Intents bleiben fachlich unverändert. Es gibt bisher keinen täglichen Datensnapshot. Kalenderdaten sind vorhandene `calendar_events` mit Owner, Hundzuordnung, Datum, Typ und Status. `reminder` ist die belegte Erinnerungsquelle. Ziele, Rucksackhinweise oder Medikamenten-Freitext werden nicht in neue Aufgaben/Fälligkeiten umgedeutet.

- `AnyvoDaily` unter iOS 17+: kleines/mittleres Widget „Heute für meine Hunde“, nächster bestätigter laufender/kommender Termin, separat erkennbare Anfragen und maximal eine/zwei heutige Kalendererinnerungen. Mehrhundtermine werden einmal gezählt; Hundbezug ist neutral. Alle eigenen Hunde oder einzelner Hund im Widget-Editor am Telefon; fehlende Auswahl zeigt Hinweis statt Daten anderer Hunde.
- `AnyvoAppointments`: eigener kleiner, lesender Terminhinweis für iPhone/CarPlay. Nur bestätigte, nicht gesundheitsverknüpfte Termine; keine Erinnerungen, Namen, Freitexttitel, Orte, Formulare, Buttons oder Aufnahmebedienung.
- Telefonwidget öffnet `anyvo://widgets/today`. Diese neue schmale Route prüft aktuelle Session/Bootstrap und führt zum vorhandenen Kalender `/training-hub` beziehungsweise Login. Kein vertrauter Event-/Hundparameter, keine automatische Datenbuchung oder Aufnahme.
- Generische Darstellung auf beiden Oberflächen. Hundnamen werden nur für die Konfigurationsauswahl gespeichert; Renderdaten enthalten keine Kunden-/Trainernamen, Notizen, Diagnosen, Dosierungen, Orte, Koordinaten, Dokumente, JWT oder E-Mail.
- Daten stammen aus bestehenden autorisierten Services. Die Widget-Abfragen begrenzen Felder und Owner, aktive Status und Datumsfenster. Unbekannte/fremde Hunde und fremde Trainer-Kundentermine werden ausgeschlossen. Keine wiederkehrenden Termine synthetisiert.

Die UX-Spezifikation `outputs/ANYVO-07-ALLTAGS-WIDGET-CARPLAY-UX-2026-10-14.json` wurde gelesen. 07s zwei konkrete Reviewpunkte sind korrigiert: neutraler Hundbezug am kleinen Haupttermin und bestätigter Termin vor früherer unbestätigter Anfrage. Native Assertion prüft die Priorität und den getrennten Anfragezähler. Die visuelle Abnahme wird dadurch nicht ersetzt.

## Daten- und Lifecyclevertrag

`AnyvoDailyWidget` ist ein neues optionales lokales Expo-Modul. Fehlt es in altem Binary/Expo Go, läuft keine Widget-Abfrage. API:

```ts
isAvailable(): boolean
beginSession(ownerId: string | null): string // synchron, neuer lokaler opaque Token
updateSnapshot(token: string, sequence: number, json: string): Promise<boolean>
updateAvailability(token: string, sequence: number, state: 'offline' | 'error'): Promise<boolean>
```

Jeder Login-/Accountwechsel einschließlich A→B→A bekommt eine eigene native Generation. Der Auth-Callback invalidiert unmittelbar; alte App-Reads sowie native Writes mit altem Token/alter Sequenz werden verworfen. Gleicher Owner beim Coldstart bewahrt den eigenen Snapshot. Erfolgreiche Kalender-/Hundmutationen invalidieren nur den abgeleiteten Cache vor dem erneuten Read; ursprüngliche Payloads/Resultate/Kundendaten bleiben erhalten. Eine fehlerhafte Widget-Subscription darf einen Kundenwrite nicht scheitern lassen.

Schema 1: Epoch-Millisekunden, IANA-Zeitzone, minimierter eigener Hundkatalog, strukturierte Termin-/Erinnerungsdaten ohne Freitext und `truncated`. Frischefenster 15 Minuten, Ablauf 6 Stunden. Maximal 128 Hunde/256 Items/128 Hundreferenzen je Item und 16 MiB Transportgrenze; vollständiger deklarierter Grenzfall nativ geprüft. Begrenzte Abdeckung wird als unvollständig angezeigt, nicht als vollständig leerer Tag.

Offline-/Lesefehler/native Ablehnung erneuern den Datenzeitstempel nicht. Native Decoder verwenden eine Typ-Whitelist und reencodieren statt beliebiges JSON zu speichern. I/O-Fehler beim Identitätswechsel invalidieren zuerst die Writerauthority; künstliche spätere Wiederherstellung einer alten Datei aktiviert den alten Token nicht wieder. Der Test berührt ausschließlich seinen eigenen temporären Cache.

iOS: atomare Datei in App Group, vom Backup ausgeschlossen, Schutz bis zur ersten Geräteentsperrung. Dies ermöglicht generische CarPlay-Daten bei gesperrtem Telefon nach der ersten Entsperrung. Native Widgetreader verändern keine Kunden-/Quelldaten und verbergen abgelaufene/ungültige Snapshots. Der Ablauf ist eine Reader-/Renderregel, keine Zusage einer pixelgenauen Löschung auf einem vom System zwischengespeicherten Bildschirm. Rechteentzug außerhalb der App kann erst bei einem erneuten autorisierten Read beziehungsweise Ablauf erkannt werden; kein neuer nativer Auth-/Netzwerkclient.

## Native Integration und CarPlay-Grenze

Vorhandenes Target `LiveActivity` wird um Core und zwei Widgets ergänzt; kein zweites Target. Bundle-Registrierung, Dateimitgliedschaft, Sprachkatalog de/en/fr/it und App-Group-Metadaten sind reproduzierbar im bestehenden Plugin.

App/Extension bekommen `group.com.anyvo.app.widgets`; EAS-Extension-Metadaten deklarieren die Entitlements vor Signaturvorbereitung. Zwei tatsächliche Paketprobleme berücksichtigt: `expo-live-activity@0.4.2` überschreibt Extension-Entitlements mit `{}` und behandelt Metadataindex 0 als fehlend. Guard/Finalisierung erhalten vorherige Entitlements und normalisieren genau den eigenen Extension-Eintrag. Unbekannte Extension-Identität stoppt die Integration. Fremde Extensions/Entitlements bleiben erhalten.

Apple dokumentiert den kleinen Widgetweg und Live-Activity-Fallback für CarPlay auch ohne eigene CarPlay-App. Für den neuen Terminhinweis wird der Widgetweg verwendet; keine zusätzliche Termin-Live-Activity gestartet. Live Activities im Auto sind nicht interaktiv. Der vorhandene Liegezeitpfad bleibt bestehen; seine tatsächliche CarPlay-/VoiceOver-Darstellung braucht Geräteabnahme. [Apple WWDC25: CarPlay](https://developer.apple.com/videos/play/wwdc2025/216/)

CarPlay-Unterstützung ab iOS 26. Für `.carPlay`-Disfavoring muss der Kandidat mit iOS-26-SDK beziehungsweise kompatiblem neuerem SDK/Swift-6.2+-Compiler gebaut werden. Telefonwidgets sind mit iOS-17-Verfügbarkeit geschützt; App-Minimum 15.1 und bestehendes Extension-Minimum 16.2 werden nicht pauschal angehoben. Apples SDK-/Compilerzuordnung ist geprüft. [Xcode-Systemanforderungen](https://developer.apple.com/xcode/system-requirements), [Widget-Konfiguration ab iOS 17](https://developer.apple.com/documentation/WidgetKit/Migrating-from-SiriKit-Intents-to-App-Intents)

Daily/QuickStart markieren CarPlay als ungünstigen Ort. Das ist Apples beratende Gruppierung: Benutzer können sie weiterhin unter anderen Widgets hinzufügen. Deshalb ist die Daily-Anzeige ebenfalls generisch; Datenschutz hängt nicht allein vom Modifier ab. Kein vollständiges CarPlay-App-Entitlement oder unbewiesene Appkategorie angefordert.

Neues Modul/Widget-/App-Group-Signing benötigt einen **separat freigegebenen nativen Build** und passende Provisioningprofile. Portalregistrierung/Signatur und App-Version-/Runtimevertrag sind durch 01 vor einem Build zu prüfen; hier nichts dafür verändert oder veröffentlicht. Expo beschreibt die Extension-Metadaten und Signaturanforderungen. [Expo App Extensions](https://docs.expo.dev/build-reference/app-extensions/), [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)

## Tatsächlich ausgeführte Prüfungen

- Gezielte neue Tests und relevante bestehende Regressionen: **11 Suites / 104 Tests PASS**. Snapshot-Ownership, Mehrhund-Dedupe, Reminder-/Statusregeln, Mitternacht/DST, Whitelist, Grenzen; Publisher-Races/Offline/native False; echte Sync-Komponente und Mutationsergebniserhalt; Pluginintegration, App Intents, Liegezeit, `useDogs`-Identity, Hundanlegen.
- Vollständiger Typecheck `tsc --noEmit --incremental false`: **PASS, Exit 0** nach Korrektur der Testfixture-Typen.
- ESLint aller geänderten/neuen JS-/TS-Produkt- und Testdateien: **PASS, 0 Fehler/0 Warnungen**.
- Isolierter Foundation-Core mit realem atomarem Cache und gemockter Zeit: **27 Assertions PASS**, einschließlich vollständiger deklarierter Grenzen, Schema/Whitelist, Token/Sequenzen, Mitternacht/TZ, confirmed-vor-pending, Ablauf und fehlgeschlagenem Identitäts-I/O mit künstlich wiederhergestelltem Altcache. SwiftUI-/Expo-Bridgedateien: **Swift-Frontend-Syntaxprüfung PASS**, keine volle iOS-Link-/Typeprüfung daraus ableiten.
- Reale lokale iOS-Prebuild-Generierung ohne Installation/Build, anschließend mehrfach ohne Clean wiederholt: Target-/Sources-/Plist-/Entitlement-Abgleich PASS. Exakt ein tatsächliches Widget-Target; neue Sources genau einmal. Lokale Autolinking-Suche findet das Apple-Modul ohne Duplikate. Keine CocoaPods-Installation.
- `git diff --check` sowie Check der neuen Dateien: **PASS** (erneut mit Freeze geprüft). Keine Tracking-/GPS-/Healthberechnungsdatei verändert; Services bekommen nur zusätzliche Erfolgssignale für den Widgetcache.

Logs: `/private/tmp/ANYVO-DAILY-WIDGET-REGRESSIONS.log`, `ANYVO-DAILY-WIDGET-TYPECHECK-DONE.log`, `ANYVO-DAILY-WIDGET-LINT-DONE.log`, `ANYVO-DAILY-WIDGET-NATIVE-TESTS.log`, `ANYVO-DAILY-WIDGET-PREBUILD-FROZEN.log`. Zwischenläufe sind nicht zu den Finaltests zu addieren. 04s Androidtests wurden hier nicht wiederholt und werden nicht als eigene Prüfung ausgegeben.

Nach abschließender Swift-/Lokalisierungs-UX-Korrektur nochmals **2 Plugin-Suites / 22 Tests PASS**; überlappen die 104 Regressionstests, nicht addieren. 07 hat beide Kommentaraufträge lesend als behoben bestätigt und Native-/Pluginlogs geprüft. Temporärer eigener `node_modules`-Symlink auf bestehende Release-Abhängigkeiten wird beim Freeze entfernt; keine Installation/Dependencyänderung.

## Offene Abnahme und Übergabe

Hier ist keine vollständige Xcode-App installiert, aktiver Pfad `/Library/Developer/CommandLineTools`, Swift 6.1.2 für die Foundation-Prüfung. `xcodebuild -version` schlägt deshalb fehl. WidgetKit-/App-Intents-Linkprüfung, iOS-26-Compilerzweig und CarPlay Simulator sind **OPEN**. Keine Xcode-Installation, kein Cloud-Build oder Download als Ersatz gestartet.

Vor Freigabe: SDK-26+-Nativekompilierung/Signierung, Snapshot über echte Bridge/App Group, Widget-Editor/0–mehrere Hunde, A→B→A und Logout, offline/abgelaufen/Clock-/Timezone-Wechsel, angefragt/erledigt/abgesagt/gelöschter Hund, tiefere Hintergrund-/Coldstartfälle, reale Datenlesefehler, große Schrift/VoiceOver/helle/dunkle/tönende Darstellung und CarPlay-Display-Zoom/gesperrtes Telefon prüfen. Keine Echtzeit-Refreshgarantie. 04s separat eingefrorenen Androidpatch auf passende aktuelle Androidquelle integrieren und dort gemeinsamen Sender/Launcher prüfen.

MASTER übernimmt Kandidaten-/Reviewkoordination, 01 einen separat autorisierten nativen Build-/Releaseprozess. Dieser Bericht ist kein solcher Grant. Bestehende Kunden- und Fährtendaten erhalten; keine DB-Migration, Datenkorrektur, zusätzliche Gesundheitsberechnung oder HomeView-Implementierung.
