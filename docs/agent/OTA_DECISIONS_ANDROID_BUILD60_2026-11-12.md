# Entscheidungsliste OTA-Abdeckung Android → Build-60-Basis – 2026-11-12

Schritt 1 der Android-Angleichung an iOS Build 60 (nur lesend, nichts ausgenommen oder nachgezogen).

**Android-Stand:** Play-Store-Produktion ist **1.0.5 (49)**, Runtime `1.0.5-greeting-v1`, vollständig ausgerollt seit 2026-10-23 (Play Console, von der Nutzerin am 2026-11-12 gezeigt). Ältere Geräte können noch Build 47 (`1.0.5`) haben. Build 50 (`1.0.5-gnss-v1`) ist nicht im Store; seine OTAs betreffen nur Testgeräte. Der Upgrade-Test vor dem Release geht von einem Gerät mit Build 49 und echten Testdaten aus, zusätzlich stichprobenhaft von Build 47.

**Kandidat:** `origin/main` `d505250` (enthält PR #67) zusammengeführt mit dem iOS-60-Live-Stand `96e7f661` (Karte #81). `main` allein enthält `e253a552`/`96e7f661` (T-203–T-207) noch nicht. Die Zusammenführung ist konfliktfrei.

**Prüfung:** `node scripts/check-ota-coverage.mjs --platform android --candidate <Kandidat>` gegen `docs/agent/ota-ledger.json`. **Ohne `--live`** (Cloud-Sitzung ohne EAS-Zugang). Vor dem nativen Build muss die Prüfung mit `--live` wiederholt werden.

**Ergebnis:** 158 Android-Production-OTAs, 31 enthalten, 0 ausgenommen, **127 offen**. OTAs mit gleicher Nachricht auf mehreren Runtimes sind zusammengefasst → **104 Entscheidungen**. Für die Einordnung wurde jede Android-OTA mit der iOS-OTA gleicher Nachricht und deren Stand im selben Kandidaten (inkl. iOS-Ausnahmen vom 2026-11-09) verglichen. Die Einordnung ist eine **Empfehlung, keine Entscheidung**.

| Abschnitt | Anzahl |
|---|---|
| 1. Bestätigt fehlend – Android-eigene Änderungen (inhaltlich geprüft) | 2 |
| 2. Store-Linien `1.0.5-greeting-v1` (Build 49) und `1.0.5` (Build 47) – einzeln entscheiden | 24 |
| 3. Android-eigen, ohne iOS-Gegenstück – prüfen | 5 |
| 4. Test-Linie 50 – auch auf iOS offen | 0 |
| 5. Test-Linie 50 – auf iOS bereits ausgenommen | 0 |
| 6. Test-Linie 50 – iOS-Fassung enthalten, Android-Rest prüfen | 0 |
| 7. Alte Runtimes 1.0.1–1.0.4 – auf iOS bereits ausgenommen | 18 |
| 8. Alte Runtimes 1.0.1–1.0.4 – übrige | 55 |

**So entscheiden:** je Zeile *nachziehen* (als Paket für die Android-Build-60-Basis beauftragen) oder *ausnehmen* (Eintrag in `docs/agent/ota-coverage-exceptions.json` mit Begründung, `decidedBy`, Datum; die vollen Gruppen-IDs stehen im Ledger).

## Zusätzlich gefundene Punkte für Schritt 2

- **`versionCode`**: `app.json` steht auf 40, `appVersionSource` ist `local`; Store-Produktion ist 49. Vor dem Build auf mindestens 51 erhöhen (50 ist für das bereitliegende AAB vergeben, auch wenn es nie hochgeladen wurde).
- **Android-Runtime**: Android nutzt noch `runtimeVersion.policy = appVersion` (ergäbe `1.0.8`). Eigene Runtime festlegen, z. B. `1.0.8-sdk58-android-v1`.
- **RevenueCat**: `eas.json` setzt nur `EXPO_PUBLIC_REVENUECAT_IOS_KEY`; `lib/purchases.ts` liest auch `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. In der EAS-Production-Umgebung prüfen.
- Die iOS-Prüfung gegen denselben Kandidaten zeigt ebenfalls offene Zeilen (u. a. „Abo: erneuter Kauf …“, „App-Start: Startlogo …“), siehe Abschnitte 2 und 4.

## Entscheid und Stand (2026-11-12)

Die Nutzerin hat am 2026-11-12 alle Empfehlungen dieser Liste bestätigt. Die Ausnahmen stehen in `docs/agent/ota-coverage-exceptions.json` (52 Gruppen einzeln begründet, dazu je ein Sammeleintrag für die Android-Runtimes `1.0.1`, `1.0.3`, `1.0.4`, auf `platform: android` beschränkt). Die Kästchen in den Tabellen unten sind damit erledigt und bleiben nur als Verlauf stehen.

- **Nachgezogen (PRs, vor dem Build mergen):** #89 Abo-Preis-Fallback, #91 Auswertungs-Footer, #92 Widget «Heute», #93 `versionCode` 51 und Android-Runtime.
- **Ausgenommen:** alle übrigen Zeilen, Begründung je Gruppe in der Ausnahmedatei.
- **Auf dem Android-Gerät prüfen:** Startlogo (`17aabc80`), Sammelmarker (`e9cde79c`), Lege-/Suchspur (`283b31ad`), Begrüssungston.
- **Prüfung:** `node scripts/check-ota-coverage.mjs --platform android --candidate <main + diese Änderung>` → 158 geprüft, 31 enthalten, 127 ausgenommen, **0 offen** (ohne `--live`; vor dem Build mit `--live` wiederholen). iOS-Ergebnis unverändert.

## Prüfergebnis Abschnitt 2 (2026-11-12)

Methode: Für jede OTA die hinzugefügten Zeilen (Diff gegen ihre Basis) und die neu eingeführten Bezeichner/Texte im Kandidaten gesucht, Rest von Hand angesehen. Nur lesend, keine Geräteprüfung. „Zeilen“ = gefundene/hinzugefügte Zeilen ab 25 Zeichen.

### A. Inhaltlich enthalten – Empfehlung: ausnehmen mit Begründung „inhaltlich in Build-60-Basis enthalten“ (10)

| Gruppe | OTA | Befund |
|---|---|---|
| `24fcdd3e` | Abo: erneuter Kauf, sichere Wiederherstellung | alle 45 Ergänzungen vorhanden; nur nicht mehr genutzte Importe in `premium.tsx` nicht entfernt |
| `98d81197` | P1 Linienglättung | Logik vorhanden, nur 2 Kommentarzeilen fehlen |
| `0c80972b` | Gesundheitsakte: Speicherung und Gaben-Historie | alle Ergänzungen vorhanden |
| `92fb3b6e` | Dezentes Bedienfeedback | vollständig vorhanden |
| `4c44785c` | Geteilte Hunde: Gesundheitsdaten lesend | 115/116 Zeilen |
| `91021808` | Gemeinsam trainieren: Standortfreigabe | 297/300 Zeilen |
| `2dde9e07` | Bedienung: flexible Texte, Felder, Kalender | `KeyboardAwareScrollView` in anderer Form vorhanden (27 Verwendungen) |
| `f43a7b44` | Hundedashboard: Hinweise und Termine | 43/46 Zeilen; Löschaktion im `EventActionsSheet` anders eingebunden |
| `283b31ad` | Fährtenkarte: Lege-/Suchspur unterscheiden | Farbschema vorhanden, Suchspur-Linie anders gezeichnet → auf dem Android-Gerät ansehen |
| `4d3845d7` | Kalender: eigene Termine sicher löschen | vorhanden bis auf die Widget-Aktualisierung → hängt an Punkt E |

### B. In Build 60 anders gelöst (Trainingsdoku neu T-184 bzw. Build-58-Fährtenbasis) – Empfehlung: ausnehmen mit Verweis (6)

| Gruppe | OTA | Befund |
|---|---|---|
| `b60775e0` | Trainingsjournal: Vorbereiten – Beobachten – Nächstes Mal (3 Schritte) | Schritt-Ablauf fehlt, Build 60 hat die neue Trainingsdoku (T-184) |
| `2cfd0175` | Übungsauswahl: eine Auswahl, Varianten-Identität | 76/81 Zeilen; Auswahl in T-184 neu gebaut |
| `197688a1` | Journal und Vorbereitung | Verlaufs-/Notizanzeige in T-184 neu gebaut |
| `89625848` | Trainingshistorie vor Übernahme frisch prüfen | 0/67 Zeilen; auf iOS ausgenommen (#39) |
| `6aa534dd` | GPS-Start abgesichert; Trainingsvorlagen | 21/205 Zeilen; auf iOS ausgenommen (#38: GPS durch Build-58-Basis, Vorlagen in T-184) |
| `79568808` | Joker- und Gummimaterial | Bewertungsschutz vorhanden (`isScoredObject`, `legacyJokerAnalysis`); fehlt nur die Android-Detektor-Geometrie in `useTrackRecorder` (Build-58-Fährtenbasis) |

Kundendaten: Build 49 speichert Entwürfe mit `workflowStep`. Vor dem Release auf dem Gerät prüfen, dass solche Entwürfe und vorhandene Trainingseinträge in Build 60 laden, bearbeitet und gespeichert werden können.

### C. Diagnose/Entwicklerwerkzeuge – Empfehlung: ausnehmen wie iOS (2)

| Gruppe | OTA | Befund |
|---|---|---|
| `6f50426f` | QA-Diagnose: Sollwinkel-Zeitmarkierungen | 43/46 Zeilen, nur Export-Schema-Erweiterung fehlt |
| `845881b1` | TrackLab Diagnose: Aufnahme-/Exportstand | Herkunftsangabe im Support-Export (`withSupportProvenance`) fehlt |

### D. Auf iOS bewusst nicht übernommen – auf Android heute bei Kundinnen und Kunden (Entscheidung der Nutzerin) (4)

Auf iOS liefen diese Funktionen nur auf TestFlight; auf Android sind sie im Store. Gleich wie iOS entscheiden heisst: Android-Nutzer:innen verlieren sie beim Update auf Build 60.

**Nutzerentscheid 2026-11-12: alle vier ausnehmen**, weder Android noch iOS: Die Funktionen haben nicht korrekt funktioniert. (Ein früherer Entscheid desselben Tages zum Nachziehen ist damit ersetzt.) Android-Nutzer:innen verlieren sie bewusst beim Update auf Build 60.

| Gruppe | OTA | Befund | iOS-Entscheid |
|---|---|---|---|
| `a7ec4e94` | Build 47: Teilen- und Gruppen-Hub, Erste Schritte, Hilfe | 51/867 Zeilen; Hilfe-Center, Erste-Schritte-Tour und `/track/sharing` fehlen | #32 nicht übernommen |
| `1a3e0055` | Planlinie und Läufigkeit | Läufigkeit weitgehend vorhanden (69/77 Bezeichner); Planlinie beim Legen (`LayPlanControl`, `useLayPlan`) fehlt | #46/#48 nicht übernommen |
| `51e3a51a` | Fährtenansicht: sichere Planauswahl | 0/21 Zeilen (hängt an der Planlinie) | #49 nicht übernommen |
| `220ac7ff` | Fährtenkarte: Übersicht, Kartentypwechsel, Richtungsmarker | 3/64 Zeilen; Umschalter Strasse/Satellit fehlt | #54 nicht übernommen |

### E. Fehlt echt – Empfehlung: nachziehen bzw. prüfen (2) und native Funde

| Gruppe | OTA | Befund |
|---|---|---|
| `17aabc80` | App-Start: Startlogo ohne Tippen ausblenden | `useDismissStartupSplash` fehlt, auch auf iOS nicht entschieden. Auf dem Android-Gerät prüfen, ob das Startlogo hängen bleibt; wenn ja nachziehen |
| `e9cde79c` | Fährtenkarte: kompakte Sammelmarker | 7/11 Zeilen; Zahl-Badge an Sammelmarkern anders umgesetzt → auf dem Android-Gerät ansehen |

**Native Teile von Build 49, die in der Build-60-Basis fehlen** (kein OTA-Thema, aber für den Android-Build entscheidend):

- **`modules/anyvo-daily-widget`**: Android-Startbildschirm-Widget „Heute“ (`app/widgets/today.tsx`, `features/widgets/*`). Fehlt komplett. Ohne Nachziehen verschwindet das Widget bei Nutzer:innen, die es eingerichtet haben. **Nutzerentscheid 2026-11-12: nachziehen**; damit auch die Widget-Aktualisierung aus `4d3845d7`.
- **`modules/anyvo-greeting-audio`**: Android-eigene Wiedergabe des Begrüssungstons. Build 60 spielt den Ton über `features/home/useGreetingSound.ts`; ob das auf Android gleich funktioniert (Audiofokus, Lautlos), auf dem Gerät prüfen.

## Prüfergebnis Abschnitt 3 (2026-11-12)

Gleiche Methode wie bei Abschnitt 2 (hinzugefügte Zeilen der OTA im Kandidaten gesucht, datenkritische Reste von Hand angesehen). Nur lesend, keine Geräteprüfung. **Alle fünf sind inhaltlich enthalten – Empfehlung: ausnehmen mit Begründung „inhaltlich in Build-60-Basis enthalten“.**

| Gruppe(n) | OTA | Zeilen | Befund |
|---|---|---|---|
| `ee582684` | Health, report export, Shelly help and permanent ACTIVE access | 1625/1674 | Gesundheitsakte, Fährtenbericht (PDF/GPX/JSON über `TrackExportActions`, in der Auswertung eingebunden), dauerhafter ACTIVE-Zugang vorhanden; Gesundheitsakte seither umgebaut |
| `b486ae49`, `3060767c` | Durable tracking writes, medication dates, sync and export | 218/238 | `createBufferedPointWriter`, `layRecorderOwnership`, `backgroundTransitionQueue`, `flushSearchPoints`, `finalizeLocalTrackRun` vorhanden. Die Hintergrund-Ortung speichert Punkte in Build 60 unabhängig vom Bildschirm (awaited Persistenz im Task selbst, Build-58-Fährtenbasis) statt über den früheren Handler. Medikamenten-Datumsfeld (`DateField`, `stabilizeIOSBounds`) vorhanden |
| `d7c6f457`, `5af04065` | Tracking badges, object counts, history preview | 16/17 | vorhanden; es fehlt nur ein Kommentar in `TrackingMap` |
| `1d64e5ed`, `f5575fc8` | Preserve Android original object snapshot | 46/50 | Original-Gegenstandsstand (`objectSnapshotInput`, `objectScoreBasis`) und `trackObjectReview` vorhanden, Bewertungsbasis leicht anders aufgebaut |

Kundendaten: Fährtenspeicherung, Gegenstände und Medikamentendaten sind der Kern dieser OTAs. Im Upgrade-Test von Build 49 gezielt prüfen: Fährte legen und absuchen mit Bildschirm aus, App während der Aufnahme beenden und fortsetzen, bestehende Medikamenteneinträge öffnen/bearbeiten/speichern.

## 1. Bestätigt fehlend – Android-eigene Änderungen (inhaltlich geprüft) (2)

Im Kandidaten fehlt der Code nachweislich. Empfehlung: **nachziehen**, vor dem nativen Android-Build.

| Datum | Runtime(s) | OTA | betroffene Dateien (Änderung nicht gefunden) | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-10-10 | `1.0.4`, `1.0.3`, `1.0.1` | Android evaluation footer safe area and reachable save actions preserving notes and tracking (iOS: kein Gegenstück) | `app/track/[id].tsx`, `features/tracking/components/TrackEvaluationLayout.tsx` | `8b13ffce`, `b20cfdd8`, `f52ffbb1` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-07 | `1.0.3` | fix(subscription): recognize Android base plans and store prices (iOS: kein Gegenstück) | `app/membership.tsx`, `app/premium.tsx`, `features/subscription/plans.ts` +1 | `168ae23f` | ☐ nachziehen ☐ ausnehmen |

## 2. Store-Linien `1.0.5-greeting-v1` (Build 49) und `1.0.5` (Build 47) – einzeln entscheiden (24)

Diese OTAs laufen heute bei Kundinnen und Kunden: Build 49 ist Play-Produktion, Build 47 auf Geräten, die nicht aktualisiert haben. **Nicht gesammelt ausnehmen.** Fehlt eine Funktion in Build 60, verlieren Nutzer:innen sie beim Update. Ist sie in Build 60 anders gelöst (z. B. Trainingsdoku neu T-184), mit Verweis darauf ausnehmen. Spalte iOS: Stand der gleichnamigen iOS-OTA im Kandidaten.

| Datum | Runtime(s) | OTA | betroffene Dateien (Änderung nicht gefunden) | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-11-03 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Dezentes Bedienfeedback: Tastendruck und erfolgreiche Dokumentablage (iOS: enthalten) | `components/ui/AnimatedPressable.tsx` | `92fb3b6e`, `d2e49733` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-03 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | TrackLab Diagnose: Aufnahme- und Exportstand nachvollziehbar (iOS: enthalten) | `app/track/run.tsx`, `features/tracking/hooks/useSearchRecorder.ts`, `features/tracking/hooks/useTrackRecorder.ts` +7 | `845881b1`, `08992810` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-03 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Bedienung: flexible Texte, zugaengliche Felder und Kalender (iOS: enthalten) | `components/ui/KeyboardAwareScrollView.tsx` | `2dde9e07`, `e38f222d` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-03 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Gesundheitsakte: sichere Speicherung und verlässliche Gaben-Historie (iOS: enthalten) | `app/dog-health-record/[id].tsx` | `0c80972b`, `d494ff1d` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-02 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Geteilte Hunde: freigegebene Gesundheitsdaten sicher lesend öffnen (iOS: enthalten) | `app/dog-health-sharing/[id].tsx`, `app/shared-dog/[id].tsx`, `components/dogs/HealthRouteGate.tsx` | `4c44785c`, `4a1c3aa9` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-01 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | QA-Diagnose: Sollwinkel-Zeitmarkierungen für Feldtests (iOS: enthalten) | `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/qaSessionCapture.ts`, `features/tracking/utils/qaTrackExport.ts` | `6f50426f`, `5a89cf23` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-31 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Kalender: eigene Termine sicher löschen; bestehende Fährten und Daten erhalten (iOS: enthalten) | `services/calendarService.ts` | `4d3845d7`, `006c2319` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-31 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Fährtenkarte: Lege- und Suchspur klarer unterscheiden; Gegenstände und Termine erhalten (iOS: enthalten) | `features/tracking/components/TrackingMap.tsx` | `283b31ad`, `dd38f420` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5-greeting-v1`, `1.0.5-gnss-v1` | Hundedashboard: Hinweise und Termine direkt öffnen; eigene Termine explizit abschließen oder absagen (iOS: enthalten) | `app/training-hub.tsx`, `components/calendar/EventActionsSheet.tsx`, `features/dogs/DogHubScreen.tsx` | `f43a7b44`, `12520579` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-greeting-v1` | Fährtenkarte: klare Übersicht, Kartentypwechsel und kompakte Richtungsmarker (iOS: ausgenommen) | `app/track/[id].tsx`, `features/tracking/components/TrackMapSummary.tsx`, `features/tracking/components/TrackingMap.tsx` | `220ac7ff` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-greeting-v1` | App-Start: Startlogo nach erstem Root-Layout ohne Tippen ausblenden (iOS: offen) | `app/_layout.tsx`, `hooks/useDismissStartupSplash.ts` | `17aabc80` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-greeting-v1`, `1.0.4`, `1.0.5` | Abo: erneuter Kauf, sichere Wiederherstellung und automatische Aktivierungswiederholung (iOS: offen) | `app/premium.tsx` | `24fcdd3e`, `ec1b7fa2`, `3b0dafb5` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-greeting-v1` | Fährtenansicht: sichere Planauswahl und vollständig sichtbarer Diagnosestatus; Tracking und LiveShar (iOS: ausgenommen) | `app/dev/precision-location-test.tsx`, `features/tracking-planner/LayPlanControl.tsx`, `features/tracking-planner/i18n.ts` | `51e3a51a` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-greeting-v1` | Fährtenkarte: kompakte Sammelmarker, alle Details weiterhin antippbar (iOS: kein Gegenstück) | `features/tracking/components/TrackingMap.tsx` | `e9cde79c` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-25 | `1.0.5`, `1.0.5-greeting-v1` | Planlinie und Läufigkeit: Prognose, Zuchtbeobachtungen und Kalender; Tracking und LiveShare erhalten (iOS: kein Gegenstück) | `app/dog-health-record/[id].tsx`, `app/dog-heat/[id].tsx`, `app/track/legen.tsx` +7 | `7a205f87`, `1a3e0055` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5`, `1.0.5-greeting-v1` | GPS-Start abgesichert; Trainingsvorlagen und sichtbares Bearbeiten; bestehende Funktionen erhalten (iOS: ausgenommen) | `app.json`, `app/track/[id].tsx`, `app/track/legen.tsx` +24 | `de8f127e`, `6aa534dd` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5`, `1.0.5-greeting-v1` | Trainingshistorie vor Übernahme frisch prüfen; verspätete Antworten sicher verwerfen (iOS: ausgenommen) | `app/unit/document.tsx`, `services/trainingContext.ts` | `88442f0b`, `89625848` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5`, `1.0.5-greeting-v1` | Gemeinsam trainieren: geprüfte zeitlich begrenzte Standortfreigabe mit sicherem Widerruf (iOS: offen) | `features/tracking-exchange/live/GroupTrainingScreen.tsx`, `features/tracking-exchange/live/components/GroupPositionsMap.tsx`, `features/tracking-exchange/live/components/GroupTrainingPanel.tsx` +1 | `d310b572`, `91021808` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-21 | `1.0.5` | Exercise choices: one picker, existing variant identity preserved, explicit rename; all previous pro (iOS: offen) | `app/unit/document.tsx`, `components/training/ExerciseIdentityList.tsx` | `2cfd0175` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-21 | `1.0.5` | Training journal: prepare, document observations, retain next-session reminders and separate dog dra (iOS: offen) | `app/unit/document.tsx`, `components/training/ExerciseIdentityList.tsx`, `components/training/SelectedExerciseCard.tsx` +5 | `b60775e0` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-20 | `1.0.5`, `1.0.4` | Joker and rubber materials: scoring-safe objects, stable recovery, guidance and transfer contracts;  (iOS: offen) | `app/track/run.tsx`, `features/tracking/components/TrackingMap.tsx`, `features/tracking/hooks/useSearchRecorder.ts` +3 | `79568808`, `49157c45` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-20 | `1.0.5`, `1.0.4` | P1 line smoothing: current accepted turn evidence without one-fix delay; existing functions retained (iOS: enthalten) | `features/tracking/hooks/useTrackRecorder.ts` | `98d81197`, `0924d84e` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-20 | `1.0.5` | Journal and preparation: focus/resume refresh, complete note display, explicit history and legacy so (iOS: offen) | `app/training-journal.tsx`, `app/unit/document.tsx`, `components/training/SelectedExerciseCard.tsx` +1 | `197688a1` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-18 | `1.0.5` | Build47: new sharing and groups hub, first steps and contextual help; existing Android tracking, saf (iOS: kein Gegenstück) | `app/help-center.tsx`, `app/help.tsx`, `app/track/[id].tsx` +29 | `a7ec4e94` | ☐ nachziehen ☐ ausnehmen |

## 3. Android-eigen, ohne iOS-Gegenstück – prüfen (5)

Diese OTAs gab es nur auf Android. Mehrere betreffen dauerhafte Fährtenspeicherung, Medikamentendaten und Gegenstände (Kundendaten): nur nach inhaltlicher Prüfung ausnehmen.

| Datum | Runtime(s) | OTA | betroffene Dateien (Änderung nicht gefunden) | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-10-09 | `1.0.4`, `1.0.3` | Preserve Android original object snapshot for new completed searches (iOS: kein Gegenstück) | `app/track/run.tsx`, `features/tracking/hooks/useSearchRecorder.ts`, `features/tracking/utils/localTrackRun.ts` +1 | `1d64e5ed`, `f5575fc8` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | Health, report export, Shelly help and permanent ACTIVE access (iOS: kein Gegenstück) | `app/dog-health-record/[id].tsx`, `app/dog-health-sharing/[id].tsx`, `app/premium.tsx` +11 | `ee582684` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | fix: durable tracking writes, medication dates, sync and export actions (iOS: kein Gegenstück) | `app/track/[id].tsx`, `app/track/run.tsx`, `components/ui/DateField.tsx` +3 | `b486ae49` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.4` | fix: native45 compatible durable tracking and medication/export fixes (iOS: kein Gegenstück) | `app/track/[id].tsx`, `app/track/run.tsx`, `components/ui/DateField.tsx` +3 | `3060767c` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3`, `1.0.4` | fix: field-informed tracking badges object counts and history preview (iOS: kein Gegenstück) | `features/tracking/components/TrackingMap.tsx`, `features/tracking/utils/angleClassify.ts` | `d7c6f457`, `5af04065` | ☐ nachziehen ☐ ausnehmen |

## 7. Alte Runtimes 1.0.1–1.0.4 – auf iOS bereits ausgenommen (18)

Empfehlung: **ausnehmen** wie auf iOS (alte Runtime, Code seither überarbeitet).

| Datum | Runtime(s) | OTA | betroffene Dateien (Änderung nicht gefunden) | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-09-07 | `1.0.1` | feat(dog): add document training action to dog detail (d9b5a87) (iOS: ausgenommen) | `app/dog/[id].tsx`, `features/dogs/DogHubScreen.tsx` | `53e3be8e` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Kommando-Karten: Long-Press- und Swipe-Aktionen (iOS: ausgenommen) | `STAGING_DEPLOY_RUN.sql`, `app/(tabs)/profile.tsx`, `app/add-dog.tsx` +83 | `4361637d` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA ohne Plus-Icon (iOS: ausgenommen) | `components/dogs/DogDocumentsCard.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts` +3 | `da6d804a` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA mit besserem Abstand (iOS: ausgenommen) | `components/dogs/DogDocumentsCard.tsx` | `0be5b042` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Button-Textabstand verbessert (iOS: ausgenommen) | `app/(tabs)/dogs.tsx`, `app/(tabs)/home.tsx`, `app/dog-backpack/[id].tsx` +18 | `c1301fea` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | tracking: interactive logbook map (iOS: ausgenommen) | `app/dog-heat-new.tsx`, `app/dog-heat/[id].tsx`, `app/dog/[id].tsx` +35 | `2eaaf072` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(dogs): add heat cycle calendar and phase timeline (iOS: ausgenommen) | `STAGING_DEPLOY_RUN.sql`, `app/dog-health/[id].tsx`, `app/dog-heat-calendar/[id].tsx` +63 | `cf0344f1` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(tracking): fullscreen saved track map (iOS: ausgenommen) | `.gitignore`, `app/dog-heat-calendar/[id].tsx`, `app/dog-heat-new.tsx` +39 | `a8a2a6eb` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | tracking: trajectory turn engine (iOS: ausgenommen) | `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/trajectory/trajectoryTurnEngine.ts` | `1c60f02b` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): keep fullscreen control above native map (iOS: ausgenommen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +21 | `49c7a1ac` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(i18n): add French Italian and English localization (iOS: ausgenommen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +31 | `374237bf` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): correct fullscreen safe area (iOS: ausgenommen) | `app/track/[id].tsx`, `features/tracking/components/TrackingMap.tsx` | `3821d84c` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-25 | `1.0.1` | dogs: heat cycle phases, observations and editing (iOS: ausgenommen) | `STAGING_DEPLOY_RUN.sql`, `app/dog-health/[id].tsx`, `app/dog-heat-new.tsx` +61 | `e65835b4` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-23 | `1.0.1` | tracking: track completion and evaluation fixes (iOS: ausgenommen) | `app/track/[id].tsx`, `features/tracking/hooks/useTrackEndGuidance.ts`, `features/tracking/services/trackHistoryService.ts` +3 | `ef3d029b` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-22 | `1.0.1` | tracking: recall and GPS geometry hotfix (iOS: ausgenommen) | `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/angleDiagnostics.ts` | `74f73beb` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-21 | `1.0.1` | fix(prod): restore production supabase after tracking ota (iOS: ausgenommen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +6 | `7ab6551f`, `479b3d9f` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-02 | `1.0.1` | Build 38 tracking, forms and Google sign-in fixes (iOS: ausgenommen) | – | `e8a77f7c` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-02 | `1.0.1` | Build 38 manual search start and picker display fixes (iOS: ausgenommen) | – | `f8c4461c` | ☐ nachziehen ☐ ausnehmen |

## 8. Alte Runtimes 1.0.1–1.0.4 – übrige (55)

Alte Linien (Aug.–Okt.). Auf iOS sind die Gegenstücke enthalten oder ebenfalls offen. Empfehlung: Sammelentscheid **ausnehmen** wie iOS-Abschnitt 5, ausser die Nutzerin will einzelne Zeilen prüfen. Kein Gerät im Store nutzt diese Runtimes mehr als Erstinstallation; bestehende Geräte erhalten den neuen Build über das Store-Update.

| Datum | Runtime(s) | OTA | betroffene Dateien (Änderung nicht gefunden) | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-10-29 | `1.0.4` | Trainingserfassung: Tastatur und Scrollende erreichbar; Daten, Tracking und LiveShare erhalten (iOS: enthalten) | `app/unit/document.tsx` | `5e7d6935` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-18 | `1.0.4` | Calendar editing and keyboard forms, saved angles, transparent logo and dog training documentation;  (iOS: offen) | `app/(tabs)/dogs.tsx`, `app/track/run.tsx`, `app/training-hub.tsx` +21 | `8c716533` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-16 | `1.0.4` | Tracking sensor safeguards: fresh motion evidence and isolated recorder lifecycle (iOS: enthalten) | `features/tracking/hooks/useSearchRecorder.ts` | `cb943be9` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.4` | Local track file exchange and distraction return; group activation remains disabled (iOS: offen) | `features/tracking-exchange/ExchangeScreen.tsx`, `features/tracking-exchange/contract.ts`, `features/tracking-exchange/groups/GroupTasksScreen.tsx` +6 | `cc90ceac` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.4` | Training documentation: atomic saves, exercise history and private follow-up focus (iOS: offen) | `app/unit/document.tsx`, `app/unit/summary.tsx`, `app/unit/timer.tsx` +12 | `3904f13d` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.4` | Group tracking tasks: explicit invitations, accepted reference, reviewed return and revocation (iOS: offen) | `features/tracking-exchange/groups/GroupTasksScreen.tsx` | `0a8818e0` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.4` | Subscription account safety: verified server purchase and restore, protected account changes (iOS: offen) | `app/premium.tsx`, `lib/purchases.ts`, `services/subscriptionAuthorityService.ts` | `19dd2aba` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-14 | `1.0.4` | Tracking: camera controls, main-track distraction flow and special-angle direction (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/sync/services/remoteTrainingSyncService.ts` +13 | `9e2baf5a` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-13 | `1.0.4` | Independent distraction tracks: durable local lines and explicit gaps (iOS: offen) | `features/tracking-distractions/DistractionEntry.tsx`, `features/tracking-distractions/DistractionLayer.tsx`, `features/tracking-distractions/DistractionScreen.tsx` +6 | `49f454ed` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-13 | `1.0.4` | Object corrections: durable offline review and preserved originals (iOS: offen) | `app/track/[id].tsx`, `features/tracking/components/TrackObjectCorrections.tsx`, `features/tracking/services/objectReview/localIntent.ts` +10 | `b1777545` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-13 | `1.0.4` | Track planner: local map templates and planned objects (iOS: offen) | `features/tracking-planner/PlannerMap.tsx`, `features/tracking-planner/PlannerScreen.tsx`, `lib/localDb/client.ts` | `d9c5fa59` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-11 | `1.0.4` | Safe track transfer: protected cloud copies, revision-safe own search and restore (iOS: offen) | `app/track/[id].tsx`, `app/track/index.tsx`, `app/track/liegen.tsx` +25 | `610a1335` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-10 | `1.0.4`, `1.0.3` | Visible map ruler and route meter ticks with reliable camera follow (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/components/TrackingMap.tsx` +1 | `a0ea9214`, `acc09b0a` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | fix(tracking): stabilize end detection and final object handling (iOS: offen) | `app/track/run.tsx`, `features/tracking/hooks/useSearchRecorder.ts`, `features/tracking/hooks/useTrackEndGuidance.ts` | `235b19b1` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | Tracking GPS quality and foreground Shelly diagnostics (iOS: offen) | `features/tracking/remote/shellyDiagnostics.ts`, `features/tracking/utils/positionSource.ts`, `features/tracking/utils/positionStream.ts` | `bd824598` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | Fix distance scale visibility after reference points load (iOS: offen) | `features/tracking/components/TrackingMap.tsx` | `8e92eccb` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | Dog-colored track previews, safe recovery and protected personal diagnostics (iOS: offen) | `app/(tabs)/dogs.tsx`, `app/edit-dog.tsx`, `app/track/index.tsx` +18 | `cb43ecf1` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-06 | `1.0.1` | fix(tracking): search start acquisition (527217d) (iOS: offen) | `.gitignore`, `app/add-dog.tsx`, `app/auth/recovery.tsx` +40 | `3f87e493` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-06 | `1.0.1` | fix(tracking): allow search start acquisition while stationary (c7eba84) (iOS: offen) | `features/tracking/hooks/useSearchRecorder.ts` | `27a379dd` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-03 | `1.0.1` | Hotfix: Hund hinzufügen (d957a60) (iOS: offen) | `app/add-dog.tsx` | `ba373233` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-03 | `1.0.1` | Hotfix: Kommando-Editor Tastatur/Speichern (221ee09) (iOS: offen) | `app/dog-command/edit.tsx` | `9c4eca64` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-03 | `1.0.1` | Fix: eigene Übung in Training dokumentieren (3e48152) (iOS: offen) | `app/unit/document.tsx`, `components/training/CustomExerciseSheet.tsx`, `components/training/SelectedExerciseCard.tsx` | `65c0ccc3` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-02 | `1.0.1` | training: add custom training discipline (iOS: offen) | `app/unit/document.tsx` | `bb311f4b` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-02 | `1.0.1` | Training dokumentieren: kompaktes Redesign (ac6e080) (iOS: offen) | `app/unit/document.tsx`, `components/training/CustomExerciseSheet.tsx`, `components/training/SelectedExerciseCard.tsx` +1 | `601dccab` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-01 | `1.0.1` | fix(tracking): make pocket lock hold reliable (iOS: offen) | `app/dog-heat-calendar/[id].tsx`, `app/dog-heat-new.tsx`, `app/dog-heat/[id].tsx` +11 | `08efb977` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-01 | `1.0.1` | fix(tracking): enable stop from pocket lock (iOS: offen) | `features/tracking/components/PocketLockOverlay.tsx` | `44063509` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-01 | `1.0.1` | fix(tracking): unify hold to stop labels (iOS: offen) | `app/premium.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts` +4 | `11658040` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-01 | `1.0.1` | fix(subscription): make NEWBIE permanently free (iOS: offen) | `features/tracking/components/HoldToStopButton.tsx`, `features/tracking/components/PocketLockOverlay.tsx`, `i18n/de-CH.ts` +2 | `6cadc172` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-28 | `1.0.1` | fix(tracking): make safe stop hold reliable (iOS: enthalten) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/components/PocketLockOverlay.tsx` | `52e2d45f` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-28 | `1.0.1` | fix(tracking): allow navigation after confirmed stop (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx` | `43439f6f` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-28 | `1.0.1` | rollback: restore safe stop hold reliable (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx` | `3f42b2e1` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-28 | `1.0.1` | fix(tracking): restore simple stop confirmation flow (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/components/PocketLockOverlay.tsx` | `70972fc4` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-28 | `1.0.1` | fix(tracking): restore direct stop flow (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/components/PocketLockOverlay.tsx` | `5861bf33` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(tracking): pocket lock and safe stop guards (iOS: offen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +14 | `35a4433f` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): restore pocket lock entry control (iOS: offen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +14 | `730b20d7` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): make pocket lock stop escape tappable (iOS: offen) | `app/auth/recovery.tsx`, `app/language.tsx`, `app/membership.tsx` +23 | `4d51217c` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): distinguish map follow from pocket lock (iOS: offen) | `features/tracking/components/TrackingMap.tsx` | `98e86610` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): clarify long press stop action (iOS: offen) | `app/track/[id].tsx`, `app/track/legen.tsx`, `app/track/run.tsx` +2 | `0d4d7aea` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): clarify map follow control (iOS: offen) | `features/tracking/components/TrackingMap.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts` +1 | `651d5b22` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): make stop tap open safe stop confirmation (iOS: offen) | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/components/PocketLockOverlay.tsx` | `e6592711` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-22 | `1.0.1` | tracking: adaptive corner confidence (iOS: offen) | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx` +7 | `55f75bbe` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-22 | `1.0.1` | tracking: adaptive GPS quality engine (iOS: offen) | `features/tracking/hooks/useTrackRecorder.ts` | `b9fe4438` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-21 | `1.0.1` | tracking: completion, logbook and recovery (iOS: offen) | `app/track/[id].tsx`, `app/track/index.tsx`, `app/track/legen.tsx` +13 | `41456add` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-19 | `1.0.1` | T-59 tracking reliability and adaptive guidance (iOS: enthalten) | `app/dog-health/[id].tsx`, `features/subscription/plans.ts`, `hooks/useCapabilities.ts` +1 | `11e2a6fb` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-17 | `1.0.1` | fix(training): restore documentation for single-dog accounts (iOS: offen) | `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql`, `app/trainer/index.tsx`, `app/unit/document.tsx` +5 | `63f2fa56` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-15 | `1.0.1` | fix(tracking): restore solid track rendering and robust angle detection (iOS: offen) | `features/tracking/components/TrackingMap.tsx`, `features/tracking/utils/angleDiagnostics.ts`, `features/tracking/utils/autoCornerDetection.ts` | `d88e7d0d` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-14 | `1.0.1` | fix(tracking): restore voice guidance and ship verified OTA (iOS: offen) | `app/training-journal.tsx` | `856f04e3` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-12 | `1.0.1` | fix: improve track save reliability (iOS: offen) | `app/track/[id].tsx`, `app/track/index.tsx`, `app/track/legen.tsx` +12 | `f69ea5a8` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-10 | `1.0.1` | chore(iap): add temporary StoreKit diagnostics (iOS: offen) | `app/premium.tsx`, `app/track/kalibrierung.tsx`, `app/track/run.tsx` +9 | `4e05a38a` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-10 | `1.0.1` | fix(iap): initialize RevenueCat before loading products (iOS: offen) | `app/premium.tsx`, `lib/purchases.ts` | `d4f9bfa5` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-10 | `1.0.1` | chore(iap): remove temporary StoreKit diagnostics (iOS: offen) | `app/premium.tsx`, `lib/purchases.ts` | `bcd8969d` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-10 | `1.0.1` | subscription: iOS plan changes + Founder sunset (iOS: offen) | `app/membership.tsx`, `app/premium.tsx` | `4d4aec9e` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-08 | `1.0.1` | fix(auth): add safe recovery diagnostics (iOS: offen) | `app/auth/recovery.tsx` | `34d7612f` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-08 | `1.0.1` | fix(auth): finalize password recovery flow (iOS: offen) | `app/auth/recovery.tsx` | `b9095224` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-08 | `1.0.1` | fix(subscription): improve plan switching and store management (iOS: offen) | `app/membership.tsx`, `app/premium.tsx`, `features/subscription/plans.ts` +1 | `cc909659` | ☐ nachziehen ☐ ausnehmen |
