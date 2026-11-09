# ANYVO — Kundenprobleme und technische Fehler (Historie)

Stand 2026-11-09. Recherche nur lesend (Statusdoku, Task-Berichte, GitHub-Issues, Git, Supabase).
Verwandt: [Master-Kontext](ANYVO_MASTER_CONTEXT.md) · [Release-Historie](ANYVO_RELEASE_HISTORY.md) ·
[Architektur](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md).

Pflege: Neue Meldungen, Ursachen, Fixes und Tests werden hier ergänzt, ohne Personendaten
(siehe [Zusammenarbeit](ANYVO_COLLABORATION_RULES.md) Abschnitt 2a).
Personen sind anonymisiert („Kundin A/B/C“). Dieses Dokument enthält keine Namen,
E-Mail-Adressen, Nutzer-UUIDs, Geräte-IDs oder Koordinaten.

**Kennzeichnung der Ursache**
- **BESTÄTIGT**: durch Datenbank-/EAS-/Git-Befund, Absturzbericht oder Commit-Analyse belegt (Quelle genannt)
- **VERMUTUNG**: plausibel, aber nicht belegt
- **OFFEN**: nicht geklärt

**Abkürzungen der Quellen**
- `MS` = `~/canisflow-worktrees/anyvo-main/docs/agent/ANYVO_MASTER_STATUS.md`
- `AW` = `~/canisflow-worktrees/anyvo-main/docs/agent/ACTIVE_WORK.md`
- `RH` = `docs/agent/ANYVO_RELEASE_HISTORY.md`
- `ARCH` = `docs/agent/ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md`
- `MC` = `docs/agent/ANYVO_MASTER_CONTEXT.md`
- `VB` = `docs/agent/audits/2026-11-09-verstaendnisbericht.md`
- `RP` = `~/canisflow-worktrees/anyvo-main/docs/agent/release-policy.json`
- Commits beziehen sich auf das Repository `dogbossvibes/CarniFlow`, lokal `~/canisflow/canisflow`.
- „In Linie 57/60 enthalten“ bedeutet, dass der Commit Vorfahre von `17443616` (Build 57) bzw.
  `3858c0ff` (Build 60) ist (am 09.11. mit `git merge-base --is-ancestor` geprüft).
  Ob ein Fix als inhaltsgleicher Patch in eine andere Linie übernommen wurde, ist damit **nicht** geprüft.

---

## Übersicht

| # | Thema | Plattform | Status |
|---|---|---|---|
| 1 | ACTIVE wird bei zahlenden Kundinnen nicht freigeschaltet (P0, Issue #7) | iOS + Android | Kundinnen A/B behoben; Ursache teilweise OFFEN |
| 2 | RevenueCat → Supabase-Synchronisation (Webhooks, `subscription-sync`) | iOS + Android | OFFEN (Code nicht in Git, Webhook-Ablehnungen 04.11.) |
| 3 | Android: Abo-Produkte / Preise nicht erkannt (Basisplan-IDs) | Android | Fix ausgeliefert 07.10.; Geräteabnahme OFFEN |
| 4 | Support-Fall: abgelaufenes ACTIVE, manuelle Freischaltung | iOS (Altversion 1.0.3) | erledigt 08.10. |
| 5 | Trainer Connect: „ACTIVE-Nutzer können keinen Trainer hinzufügen“ | iOS + Android | Fixes Sept. 2026 in allen Kundenlinien; Aktualität der Meldung OFFEN |
| 6 | GPS-Abweichungen zwischen Geräten (5–15 m) | iOS / Android | OFFEN, kein Messbeleg in den Quellen |
| 7 | Winkel- / Richtungswechselerkennung | iOS + Android | OFFEN |
| 8 | Kartenabsturz beim Öffnen/Vergrößern einer Fährte (iOS 49 → Builds 53/56/57) | iOS | Native Absturzstelle BESTÄTIGT; Fix in 56/57; Geräte-PASS OFFEN |
| 9 | Unterschiede in der Darstellung gelegter Fährten | iOS + Android | mehrere OTAs; Geräteabnahme OFFEN |
| 10 | Build 59: Absturz beim Fährtenabschluss | iOS (TestFlight) | OFFEN |
| 11 | OTA wird auf dem Gerät nicht aktiv (Build 60 `launch=embedded`) | iOS | OFFEN |
| 12 | Weitere Kundenmeldungen (Splash-Hänger Builds 33–35, NEWBIE-Fährte, Läufigkeitsansicht) | iOS / Android | 12a/12b erledigt, 12c OFFEN |

---

## 1. ACTIVE-Abo wird bei zahlenden Kundinnen nicht freigeschaltet (P0)

- **Beschreibung:** Zwei zahlende Kundinnen (Kundin A: iOS, Kundin B: Android) meldeten, dass
  ACTIVE trotz bezahltem Abo nicht freigeschaltet war.
- **Plattform:** iOS und Android.
- **Betroffene Version/Runtime:** nicht exakt festgehalten. Issue #7 fordert ausdrücklich den Abgleich
  des tatsächlich installierten Builds/OTA beider Plattformen. Er ist in den Quellen nicht dokumentiert (**OFFEN**).
- **Aktueller Zustand: BESTÄTIGT (09.11., Datenbankprüfung):** Beide Konten sind seit dem
  **2026-10-28 10:07 UTC** übereinstimmend ACTIVE, und zwar in `subscriptions`, `profiles` und
  `user_capabilities`. Die Nutzerin hat bestätigt, dass es in der App wieder funktioniert
  (Quellen: Auftrag 09.11.; `VB` §2 W8; `MC` §6).
- **Ursache:**
  - **BESTÄTIGT (Datenzustand vor der Korrektur, Android):** `plan = NULL` und ein falscher
    Store-Eintrag (`VB` §2 W8, „Abo-Fall Android“). Am 28.10. um 10:07 UTC korrigiert.
  - **BESTÄTIGT (Code-Befund, nicht als Live-Ursache belegt):** Auf `main` @ `84ba7782` ruft
    `app/premium.tsx` nach dem Kauf den Client-Pfad `activatePlan` auf.
    `services/subscriptionService.ts` wertet dort Schreibfehler von `setCapabilities` und
    `profiles.update` nicht aus, sodass die drei Datenquellen auseinanderlaufen können. Der Webhook
    (`supabase/functions/_shared/revenuecat-webhook.ts`) quittiert Ereignisse mit Nicht-UUID-`app_user_id`,
    unbekannter Produkt-ID oder falschem Store mit `ok:true` und ignoriert sie (Issue #7, Abschnitt „Bestätigte Codebefunde“).
  - **OFFEN:** Warum die Daten beider Kundinnen in diesen Zustand kamen (Webhook-Zustellung,
    Identitätswechsel/Alias, Client-Schreibpfad). Für Kundin A (iOS) ist der Ausgangszustand in den
    gelesenen Quellen nicht beschrieben.
- **Durchgeführter Fix:**
  - Am 28.10. wurden Produktions-Edge-Functions deployed: `subscription-sync` v5, `revenuecat-webhook` v9
    und `revenuecat-webhook-google` v8 (**BESTÄTIGT**). Ihr deployter Code liegt in **keinem Git-Stand**
    (`MC` §6, `VB` §2 W10).
  - Am selben Tag wurden Abo-Client-OTAs „reconcile expired plans and recover pending activations“
    veröffentlicht. Für iOS55 und Android49 ist die Auslieferung belegt (Quelle `89c21770` bzw. `d41ab8ee`,
    `MS` „T93: erste zwei Abo-OTAs bestätigt – 2026-10-28“). Ein inhaltsgleicher Commit `9b85e0fd`
    ist in den Linien 57/60 enthalten.
  - Ob die Korrektur um 10:07 UTC durch die neuen Funktionen, einen Sync oder eine manuelle
    Datenkorrektur entstand, ist in den gelesenen Quellen nicht festgehalten (**OFFEN**).
- **Teststatus:** Datenbankzustand und Nutzerinnenbestätigung **BESTÄTIGT**. Ein echter Kauf- und
  Restore-Test auf beiden Plattformen mit der aktuellen Serverversion ist nicht belegt. Issue #15 nennt
  „RevenueCat ACTIVE/Restore“ als offenen Prüfpunkt für Build 60.
- **Verbleibende Risiken:** siehe Punkt 2. Issue #7 ist auf GitHub weiterhin **OPEN**.
  Der Client-Schreibpfad darf laut `MC` §6 nicht reaktiviert werden.
- **Quellen:** Issue #7; `VB` §2 W8/W10, §3 Nr. 4–5; `MC` §6; `MS` „T93 … 2026-10-28“; Commits `9b85e0fd`, `89c21770`, `d41ab8ee`.

## 2. RevenueCat → Supabase-Synchronisation

- **Beschreibung:** Bezahlte Pläne werden ausschließlich serverseitig gesetzt. Die Kette ist
  RevenueCat → Webhook (iOS `revenuecat-webhook`, Android `revenuecat-webhook-google`) bzw.
  `subscription-sync` → `subscriptions` → `user_capabilities` / `profiles` (`ARCH` §4, `MC` §6).
- **Plattform:** iOS und Android.
- **Betroffene Version:** serverseitig, betrifft alle Client-Runtimes (mindestens 16 Runtimes mit Production-OTAs, `VB` §1.6).
- **Befunde:**
  - **BESTÄTIGT:** Am **2026-11-04 zwischen etwa 07:36 und 09:09 (Ortszeit)** lehnte der iOS-Webhook
    mehrere RevenueCat-Ereignisse mit HTTP 503 und Code `INVALID_PROVIDER_DATE` ab. Wer betroffen ist,
    ist unbekannt. Es könnte eine dritte zahlende Person sein (**OFFEN**, `VB` §3 Nr. 4).
  - **BESTÄTIGT:** `subscription-sync` hatte in den 7 Tagen vor dem 09.11. **0 Aufrufe**.
  - **BESTÄTIGT:** Der deployte Code der drei Funktionen (Stand 28.10.) liegt in keinem Git-Stand.
    Ein unversionierter Vorläufer liegt nur in einem lokalen Codex-Verzeichnis und weicht ab
    (`docs/agent/ANYVO_DIRECTORY_MAP.md` Z. 59, 138–139).
  - **Historie:** Abo-Server-Paket R3 mit drei Edge Functions am 16.10. produktiv installiert und
    aktiviert. Abo-Client-OTAs auf iOS 1.0.4, iOS 1.0.5/TF51 und Android 1.0.4 am 16.10.
    (`MS` „Abo-Serverinstallation … abgeschlossen — 2026-10-16“, „Abo-Client-OTAs … — 2026-10-16“).
    Damals ausdrücklich ohne echten Kauf- oder Restore-Test.
  - Laut `VB` §2 W9 sind „Fixes vom 07./08.11. (Sicherheit, Android-Webhook)“ in keinem lokalen Worktree auffindbar.
- **Ursache der 503-Ablehnungen:** **OFFEN**. Der Fehlercode deutet auf ein nicht akzeptiertes Datumsfeld
  des Providers hin (**VERMUTUNG**). Prüfbar wäre das nur am deployten Code, der nicht in Git liegt.
- **Ursache für 0 Sync-Aufrufe:** **OFFEN**. Es ist nicht geklärt, ob die ausgelieferten Clients
  `subscription-sync` überhaupt aufrufen. Laut `MS` (Z. ~2190, Stand Mitte Oktober) riefen die damals
  veröffentlichten Clients weder `subscription-sync` noch `subscription_client_v1` auf. Für die heutigen
  Linien ist das nicht neu geprüft.
- **Durchgeführter Fix:** keiner seit dem 28.10.
- **Teststatus:** keiner.
- **Verbleibende Risiken:** Zahlende Personen könnten unbemerkt ohne Freischaltung bleiben
  (Ereignisse vom 04.11.). Änderungen am Abo-Code ohne vorherige Sicherung des deployten Stands sind
  riskant. Es fehlt eine Reconciliation, falls Webhooks dauerhaft scheitern.
- **Quellen:** Auftrag 09.11.; `MC` §6; `VB` §2 W9/W10, §3 Nr. 4–5, §4; `ARCH` §4; `MS` Abschnitte 15./16.10.

## 3. Android: Abo-Produkte und Preise nicht erkannt

- **Beschreibung:** Auf Android waren Abo-Pakete, Preise, Testphasen-Auswahl und Restore-Fallback
  betroffen. Die Screenshots der Nutzerin zeigten aktive Google-Basispläne für Active und Trainer.
- **Plattform:** Android.
- **Betroffene Runtime:** Android `1.0.3` (Basis-OTA `68b23f18`).
- **Ursache:** **BESTÄTIGT als Code-Defekt:** Der Code verglich nur reine Abo-IDs und lehnte IDs mit
  Basisplan-Suffix (`…:anyvo-active-monthly-400`, `…:anyvo-trainer-monthly-3000`) ab. Zusätzlich gab es
  einen veralteten fest codierten Ersatzpreis CHF 9.00. Laut Bericht ist **nicht** belegt, dass dies die
  einzige Ursache war (**OFFEN**).
- **Durchgeführter Fix:** Feature-Commit `853f435`, auf `main` als `39792466`. OTA am 2026-10-07:
  Release-Commit `e88371dc`, Update-Group `168ae23f-…`, Android-Runtime 1.0.3.
- **Teststatus:** 245 gezielte Tests bzw. 326 Suiten grün. **Geräte- und Kaufabnahme OFFEN.**
- **Verbleibende Risiken:** Google-Play-Preis, Länderverfügbarkeit und `getOfferings` auf dem betroffenen
  Gerät sind nicht verifiziert.
- **Quellen:** `~/canisflow-worktrees/anyvo-main/docs/agent/tasks/T-63.md` (gesamt, insbesondere „Verified publication“ und „Device acceptance (open)“).

## 4. Support-Fall: abgelaufenes ACTIVE, manuelle Freischaltung (Oktober 2026)

- **Beschreibung:** Für Kundin C sollte ACTIVE ohne Store-Kauf freigeschaltet werden. Vorher war
  ein früheres ACTIVE-Abo abgelaufen (`pro_member=false`, `trainer_module=false`).
- **Plattform:** iOS. Für die iOS-1.0.3-Übergangsprojektion war ein eigener Altpfad nötig.
- **Ursache:** **BESTÄTIGT:** Es gab keinen passenden Admin-Weg für ein reines ACTIVE-Recht.
  Lifetime hätte auch Trainer-Rechte verliehen (`AW` Z. ~1700–1730).
- **Durchgeführter Fix:** Neues, von Store-, Lifetime-, Trainer- und Tester-Rechten unabhängiges
  `active_lifetime`-Recht (Commit `0a475f31`, Branch `feat/active-lifetime-access`). Einzelgrant am
  08.10.2026 gespeichert.
- **Teststatus:** **BESTÄTIGT** durch unabhängige Read-only-Nachprüfung am 08.10.: genau ein permanentes
  ACTIVE-Recht, TRAINER/Tester false, Store-Daten unverändert, RLS- und Claim-Prüfungen PASS
  (`MS` Z. ~3336, `AW` Z. ~1863). Eine Geräteprüfung ist nicht dokumentiert.
- **Verbleibende Risiken:** Ein Sonderrecht neben dem Store-Abo erhöht die Zahl der Berechtigungsquellen.
  `ARCH` §7 nennt „drei Plan-Vokabulare und drei Berechtigungstabellen“.
- **Quellen:** `AW` Z. ~1700–1730, 1816, 1850, 1863; `MS` Z. ~3336; Commit `0a475f31`.

## 5. Trainer Connect: „ACTIVE-Nutzer können keinen Trainer hinzufügen“

- **Beschreibung:** Gemeldet wurde, dass ACTIVE-Nutzer über „Meine Trainer → Trainer verbinden →
  Code eingeben“ keinen Trainer hinzufügen können. Bei RC-Tests auf einem echten iPhone landeten
  NEWBIE- und ACTIVE-Kunden außerdem auf dem Trainer-eigenen Kundenbildschirm.
- **Plattform:** iOS und Android (gemeinsamer JS-Code).
- **Zeitraum:** September 2026.
- **Ursache (chronologisch):**
  1. 11.09. (`7fe9eb8a`, nur Diagnose): Die statische Analyse fand kein Plan-Gate im Connect-Pfad.
     Gefunden wurden zwei echte Defekte mit genau diesem Symptom. Lesefehler in
     `connectionService.listConnections` wurden verschluckt, sodass eine vorhandene Verbindung wie
     „keine Trainer“ aussah. In `app/trainer/index.tsx` fehlte ein `catch`, sodass der Spinner endlos lief.
     **BESTÄTIGT als Defekte**, nicht als einzige Ursache.
  2. 25.09. (`f957546e`): **BESTÄTIGT (Commit-Analyse):** `app/trainer/_layout.tsx` leitete die gesamte
     Route `/trainer/*` ohne `trainer_module` auf `/premium` um. NEWBIE und ACTIVE sahen deshalb beim
     Tippen auf „Meine Trainer“ sofort die Bezahlschranke.
  3. 25.09. (`252a54c6`): **BESTÄTIGT:** Der Knopf „Trainer verbinden“ im Fährten-Teilen
     (`app/track/[id].tsx`) führte zum Trainer-Kundenbildschirm `/(tabs)/clients` statt zu `/trainer`.
  4. 25.09. (`6035cc09`, Sicherheit): Ein Trainer-Profil konnte ohne Berechtigung angelegt werden.
     Die Prüfung erfolgt jetzt serverseitig.
- **Durchgeführter Fix:** `f957546e`, `252a54c6` und `6035cc09` sind in **allen** heutigen Kundenlinien
  enthalten: Build 57, Build 60, iOS57-OTA `d11fcb37`, Android50 `21c04eee` und Android49 `da715fc7`.
  Der Diagnose-Commit `7fe9eb8a` ist **nicht** als Vorfahre enthalten. Ob die beiden Defekte aus Schritt 1
  dort inhaltsgleich behoben sind, ist **nicht geprüft**.
- **Teststatus:** 17 Regressionstests (Connect unabhängig vom Plan) laut `7fe9eb8a`. Eine Geräteprüfung
  auf den heutigen Linien ist nicht dokumentiert.
- **Verbleibende Risiken:** Ob die Meldung heute noch zutrifft, ist **OFFEN** (`VB` §3 Nr. 7).
  Es gibt zwei Connection-Systeme parallel, das alte `connections*` und das neue `connect_*` hinter einem
  Flag (`ARCH` §7 Nr. 5). Issue #14 verlangt Trainer Connect als Pflichtpunkt der Geräte-Regression für Build 60.
- **Quellen:** Commits `7fe9eb8a`, `f957546e`, `252a54c6`, `6035cc09`; `VB` §3 Nr. 7; `ARCH` §7; Issue #14 (Abschnitt 7).

## 6. GPS-Abweichungen zwischen Geräten (5–15 m)

- **Beschreibung:** Laut Auftrag wurden zwischen Geräten Abweichungen von 5–15 m gemeldet.
- **Plattform:** nicht dokumentiert.
- **Betroffene Version:** nicht dokumentiert.
- **Ursache:** **OFFEN.** In MASTER_STATUS, ACTIVE_WORK, den Task-Berichten und den Issues wurde **keine
  dokumentierte Messung oder Ursachenanalyse** zu einer Abweichung von 5–15 m zwischen Geräten gefunden.
  Bekannte Rahmenbedingungen, ausdrücklich keine Ursache:
  - Android arbeitet GPS-only. iOS nutzt zusätzlich Motion-Fusion. Laut `MS`/`AW` (Z. ~1070) gibt es
    „kein Android-v3/GNSS-/Motion-Paritätsversprechen“.
  - Unterschiedliche native Linien: Android50 `1.0.5-gnss-v1` mit Satellitendiagnose (`c4649ad5`),
    iOS55 mit Satellitendiagnose (`6f1556e4`). Build 57/60 stammen nicht von der iOS-Sensorlinie 50–55 ab
    (`VB` §1.2).
- **Durchgeführter Fix:** keiner, der dieser Meldung zugeordnet ist.
  Genauigkeitsbezogene Änderungen gab es an der Absuche-Bewertung (`6b103c17` u. a. „make search scoring accuracy aware“).
- **Teststatus:** keiner.
- **Verbleibende Risiken:** ohne Rohdaten (GNSS/IMU-Export beider Geräte, gleiche Strecke und Zeit) nicht bewertbar.
- **Quellen:** keine spezifische Quelle gefunden. Kontext: `MS` Z. ~1070; `VB` §1.2; Commits `c4649ad5`, `6f1556e4`.

## 7. Winkel- und Richtungswechselerkennung

- **Beschreibung:** Bei Feldtests werden Winkel und Richtungswechsel nicht oder falsch erkannt,
  besonders spitze Winkel („Spitzlinks“/„Spitzrechts“). Am 21.10. meldete die Nutzerin, der neue
  TestFlight-Build erkenne keine Winkel und sei schlechter als die App-Store-Version.
- **Plattform:** vor allem iOS, Android-Winkelport getrennt (`MS` „Tracking-Finish: Android-Winkelport nötig — 2026-10-14“).
- **Betroffene Builds/Runtimes:** iOS 49 (1.0.4), TF53 (`1.0.5-motion-v3`), iOS55 (`1.0.5-motion-v4`)
  sowie die heutigen Linien 57/60, die nicht von 50–55 abstammen.
- **Ursache:**
  - **BESTÄTIGT (Feldabnahmen):** V6-Feldtest (01.10.): F2 mit Soll SR→SL→R→L wurde als R (Schärfe
    ungeklärt)→SR→R→L erkannt (`…/tasks/TRACKING-FIELD-V6.md`). Am 08.10. **scheiterten zwei
    Winkel-Feldabnahmen** (F4/P1). Betroffen waren Anlauf-, Vorher/Nachher-Fenster und
    Split-Apex-Geometrie vor der Persistenz (`AW` Abschnitt „Neue Bedien-/Feldfixes geprüft; Winkelabnahme gescheitert — 2026-10-08“).
  - **BESTÄTIGT (Audit 26.10., eingeschränkt):** Gleiche GPS-Eingaben liefern unter dem Code von 49 und 55
    identische Winkel. Auch der Code von 49 findet in den Daten von 55 kein „Spitzlinks“. Für 55 scheitert
    „Spitzlinks“ vor der Motion-Stufe: Ausgangsschenkel 1,50 m < 2 m, Streuung der übrigen Fenster > 26°.
    Nativ wurden in 55 49 Schritte verworfen. Ob Betriebssystem oder Queue die Ursache ist, bleibt **OFFEN**
    (`MS` „iOS49-vs55-Ursachenaudit: Bericht abgeschlossen …“).
  - Feldincident 21.10.: Die zentralen JS-Dateien für GPS, Recorder, Fusion, Detektor und Karte waren
    zwischen Store-OTA und TF-OTA byteidentisch. Unterschiede lagen im Motion-Manager und im AIRMap-Patch.
    Daraus folgt **kein Kausalitätsbeweis** (`MS` „Feldincident … — 2026-10-21“).
  - Gesamtursache: **OFFEN.**
- **Durchgeführte Fixes:** u. a. `57a6c5e3` (P1-Linienglättung, OTAs am 20.10. auf sechs Linien),
  `12267514`, `15b77b5f` und weitere Turn-Smoothing-Ports je Linie. Keiner davon ist als Vorfahre in
  Linie 57/60 enthalten, Patch-Äquivalenz nicht geprüft. Am 01.11. folgte die OTA „Zeitmarkierung beim
  Fährtenlegen“ (Issue #19): Damit lassen sich Sollwinkel manuell markieren. Laut `MS` ist die automatische
  Winkelerkennung dadurch **nicht verbessert**.
- **Teststatus:** Unit- und Replay-Tests grün. **Feld-PASS fehlt.**
- **Verbleibende Risiken:** Der Detektor ist die Kernfunktion. Schwellen dürfen nicht pauschal gelockert
  werden (`ARCH` §3). Zeitmarkierungen werden bis zum normalen Abschluss nur im RAM gehalten, ohne
  Crash-Recovery (Issue #19).
- **Quellen:** `…/tasks/TRACKING-FIELD-V6.md`; `…/tasks/T-TRACK-FUSION-QUALITY-2026-09-30.md`; `AW` Abschnitt 08.10.; `MS` Abschnitte 21.10., 26.10., 01.11.; Issue #19; Commits `57a6c5e3`, `12267514`, `15b77b5f`.

## 8. Kartenabsturz beim Öffnen/Vergrößern einer Fährte (iOS 49 → Kartenreparatur 53/56/57)

- **Beschreibung:** Auf iOS stürzte die App beim Vergrößern bzw. Öffnen der Fährtenkarte ab
  („P0 iOS49 Kartenvergrößerungs-Crash“). Laut Übergabe trat der „Kartenfehler im Journal“ auf
  Build 49 auf. Dass damit iOS 49 gemeint ist, ist eine Interpretation, die die Nutzerin bestätigen soll (`VB` §1.2, **OFFEN**).
- **Plattform:** iOS (Apple Maps, `react-native-maps` 1.20.1).
- **Betroffene Version:** 1.0.4 (49), nativer Build `994f04ba-…`.
- **Ursache:** **BESTÄTIGT (Absturzbericht 26.10.):** Absturz in `AIRMap insertReactSubview` +328
  (`AIRMap.m` Z. 138/139). **OFFEN:** ob nil oder ungültiger Index, welcher JS-Auslöser und welche OTA installiert war.
- **Durchgeführter Fix:**
  - 20.10.: `b7293b14` „guard AIRMap against nil native children“ → TestFlight **1.0.5 (53)** (`82786fdf`,
    Runtime `1.0.5-motion-v3`), nur interne Gruppe. Nil-Guard und Indexbegrenzung im signierten Binär nachgewiesen.
  - 26.10.: `e8a754f3` „guard legacy map children and prepare build 56“ → **Build 56** (1.0.5 (56),
    Runtime `1.0.5-map49-v1`, Profil `ios49-map-repair`). NATIVE-MAP-BINARY-PASS, TestFlight-Submit, IN_BETA_TESTING am 28.10.
  - 29.10.: **Build 57** (EAS `442f7bc3-…`, Commit `17443616`, Runtime `1.0.6-map49-v1`), stammt von 49 und 56 ab.
    `e8a754f3` ist in 57 und 60 enthalten.
  - Separat rein JS-seitig: Marker-Kandidat `a9e4d5d` (tracksViewChanges) am 26.10. **zurückgezogen**,
    weil er unter iOS nur bei Google Maps wirkt.
- **Teststatus:** Native Tests (1028 Host-Assertions, 6 Map-Guards) PASS. **Kein Geräte-PASS für die
  Absturzfreiheit dokumentiert** (`MS` 20.10. und 28.10.: „kein Crashfix-Geräte-PASS“). Laut Nutzerin
  läuft Build 57 bei Kunden gut [Nutzerangabe, `RH` §1].
- **Verbleibende Risiken:** Der konkrete Auslöser ist unbekannt. Die Kundenlinie ging von 49 direkt zu 56/57
  und hat die Sensorlinie 50–55 ausgelassen. Ob das gewollt war, ist **OFFEN** (`VB` §1.2, §3 Nr. 6).
  Build 60 (SDK 58) braucht eine eigene Geräte-Regression für Karten (Issue #14/#15).
- **Quellen:** `MS` „P0 iOS49 Kartenvergrößerungs-Crash … (26.10.2026)“, „iOS-Crash-Fix abgeschlossen: 1.0.5 (53) … — 2026-10-20“, „Build56 …“ (26.10.), „Koordinationsabgleich 2026-10-28 – Kartenansicht und Build56“; `RH` §2; `VB` §1.2–1.3; Commits `b7293b14`, `82786fdf`, `e8a754f3`, `17443616`.

## 9. Unterschiede in der Darstellung gelegter Fährten

- **Beschreibung:** Gespeicherte Fährten wurden anders dargestellt als gelegt, etwa mit fehlenden oder
  abweichenden Linien, fehlenden Markern oder einem veralteten Detailstand. Laut Video verschwanden
  Vollbild-L-, Start- und Endmarker.
- **Plattform:** iOS und Android.
- **Betroffene Runtimes:** iOS55, iOS49, Android49/50, iOS57.
- **Ursache:**
  - **BESTÄTIGT (Code-Defekt, 21.10.):** `getTrackSessionById` ignorierte Fehler der drei Abfragen für
    points, markers und runs und lieferte leere Teildaten. Dadurch wurde der lokale Fallback blockiert.
    Laut `MS` ist **nicht belegt**, dass dies die Feldprobleme verursacht.
  - **BESTÄTIGT (Daten, 21.10.):** Die Remote-Punktzahlen der beiden QA-Fährten entsprachen den lokalen
    Abschlusslinien, es gab keine Unterbrechungsmarkierungen. Die Datenspeicherung war also für diese
    Fälle vollständig. Die Anzeigeursache blieb **OFFEN**.
  - Verschwundene Vollbild-Marker: **nicht reproduziert** (`MS` Audit 26.10.).
- **Durchgeführte Fixes (OTAs):** gespeicherte Ansicht mit Lege- und Absuchspur, iOS55 `63288908`
  (23.10.); Linienanzeige iOS55 `25cbe12f` (26.10.); schlichte Vollbildansicht T83–T85 auf iOS55/iOS49/
  Android49 (28.10.); Marker-OTAs iOS57 `41efcb29`, Android49 `419288f1`, Android50 `7217e9ff` (30.10.);
  Linienfix iOS57 `01e5c135`, Android49 `2503bb52`, Android50 `952b5fed` (31.10., Issue #20).
  Der Ladefehlerschutz R1 wurde im Review gesperrt, die Nachbesserung R2 in Detail und DogTrackingPanel beauftragt.
  Ob R2 ausgeliefert wurde, ist in den gelesenen Abschnitten nicht belegt (**OFFEN**).
- **Teststatus:** Postflight und CDN PASS je Ziel. **Geräteprüfung bei allen OTAs offen** (Issue #20; `MS` 30./31.10.).
- **Verbleibende Risiken:** zwei Fährten-Datenmodelle (aktiv und Legacy) sowie unterschiedliche
  Event-Modelle in Doku und Code (`ARCH` §7 Nr. 1–2). Alte Fährten müssen lesbar bleiben.
- **Quellen:** `MS` „Feldincident … — 2026-10-21“, „Gespeicherte Fährtenansicht iOS55 … — 2026-10-23“, Einträge 26.10. (Linienanzeige, Marker-Kandidat), „Kartencharge abgeschlossen – 2026-10-30“, „Linienfix abgeschlossen – 2026-10-31“; Issue #20.

## 10. Build 59: Absturz beim Fährtenabschluss

- **Beschreibung:** Auf iOS-TestFlight 1.0.7 (59) stürzt die App beim Abschließen einer Fährte ab.
- **Plattform:** iOS.
- **Betroffene Version:** 1.0.7 (59), Runtime `sdk58-customer-ios-v1`, EAS `4346505a-…`, Commit `00376126`.
  Der aktuelle OTA-Stand `bf0725d7` liegt **nur lokal**, nicht auf GitHub (`RH` §2–3, `VB` §1.5).
- **Ursache:** **OFFEN.** „noch nicht ursächlich geklärt und am Gerät abgenommen“ (`RP` openBlockers).
- **Durchgeführter Fix:** keiner. Die Linie 59 wird nicht als Migrationsbasis genutzt.
  Build 60 entstand stattdessen aus der Build-57-Linie (Issue #14).
- **Teststatus:** keiner. OTA-Empfang auf Build 59 ist ebenfalls nicht bestätigt (`RP`).
- **Verbleibende Risiken:** Ob Build 59 Kundeninstallationen hat, ist unbekannt (`RH` §5 Nr. 3).
  Der Quellcode ist nicht auf GitHub gesichert. Ob derselbe Absturz in Build 60 auftreten kann, ist
  nicht geprüft. Die Fährten-Feldabnahme auf SDK 58 ist nicht belegt (`RH` §2).
- **Quellen:** `RP`; `RH` §2, §5 Nr. 4; `VB` §1.5; Issue #14.

## 11. OTA wird auf dem Gerät nicht aktiv

- **Beschreibung:** Nach den OTAs vom 07.11. auf Build 60 (Trainingsübersicht `3e9d5b3b-…` um 10:27 UTC,
  Fährten-Label `431d93e2-…` um 16:26 UTC) meldete der Feldtest-Export vom 07.11., etwa 1 h nach der
  Trainings-OTA: `launch=embedded`, `updateId=null`. Das Gerät lief also mit dem eingebetteten Stand.
  Davor hatte die Nutzerin gemeldet, dass die neue Trainingsdarstellung auf Build 60 fehlt (Issue #15).
- **Plattform:** iOS.
- **Betroffene Version:** 1.0.8 (60), Runtime `1.0.8-sdk58-v1`, EAS `3b15fc9c-…`, Channel `production`.
- **Ursache:** **OFFEN.** Mögliche Gründe laut `RH`: noch kein zweiter Kaltstart, Download- oder
  Startfehler (**VERMUTUNG**). Die fehlende Trainingsansicht ist erklärt: `app/(tabs)/training.tsx` war in
  Build 60 byteidentisch mit der Build-57-OTA, die neue Ansicht kam erst per OTA (**BESTÄTIGT**, Issue #15).
- **Durchgeführter Fix:** keiner für den OTA-Empfang.
- **Teststatus:** keiner. Für Build 59 ist der OTA-Empfang ebenfalls nicht bestätigt (`RP`).
  Für alle anderen Runtimes ist der Geräteempfang generell nicht belegt (`MC` §5).
- **Verbleibende Risiken:** Fixes, die per OTA verteilt werden, erreichen möglicherweise nicht alle Geräte.
  Das betrifft alle OTA-basierten Korrekturen in diesem Dokument. Ein Release-Protokoll für die OTAs
  vom 07.11. fehlt (`RH` §2).
- **Quellen:** Issue #15 (Text und Kommentare); `RH` §2 „Funktionsänderungen auf der Build-60-Runtime“; `VB` §1.4, §3 Nr. 3; `MC` §5.

## 12. Weitere Kundenmeldungen

### 12a. App hängt auf dem Splash-Screen (iOS Builds 33/34/35, Juli 2026)
- **Ursache:** **BESTÄTIGT (Commit):** Mit `remindersPermission:false` fehlte
  `NSRemindersFullAccessUsageDescription`. Ab iOS 17 wirft expo-calendar deshalb eine fatale Exception
  beim Modul-Setup, und die App bleibt auf dem Splash-Screen hängen.
- **Fix:** `6123775c` (21.07.), im Simulator reproduziert und verifiziert. In allen heutigen Linien enthalten.
- **Risiko:** gering. Jede Änderung an Berechtigungstexten braucht einen nativen Build.

### 12b. NEWBIE konnte keine Fährte legen (Sept. 2026)
- **Ursache:** **BESTÄTIGT (Commit `bf81168e`, 25.09.):** Vier Fährten-Screens leiteten Nicht-Pro-Nutzer
  hart auf `/premium` um. Die serverseitige Quote war dadurch unerreichbar.
- **Fix:** 1 Fährte pro Monat für NEWBIE. Am 08.11. von der Nutzerin bestätigt (`VB` §2 W5).
  **BESTÄTIGT 2026-11-09:** Die Migration `20260925090000` ist auf Production angewendet,
  `newbie_quota_limit('track') = 1` (nur lesend geprüft).

### 12c. Läufigkeitsansicht überlappt, kein Abbruch (08.10.)
- **Beschreibung:** Bei großer Schrift überlappte die Ansicht, es gab keinen Abbruch, ein App-Neustart war nötig.
- **Ursache/Fix:** Kandidat `fix/heat-sheet-dismiss` (3 Dateien: Höhenbegrenzung, Umbrüche), 155 Tests grün.
  Kein Gerätebeleg nach dem Fix. Die Auslieferung ist in den gelesenen Abschnitten nicht belegt (**OFFEN**).
- **Quelle:** `AW` Abschnitt 08.10. (Läufigkeitsbedienfix).

---

## Offene Punkte (Zusammenfassung)

1. Issue #7 formal offen. Die Ursache des Datenzustands, besonders bei Kundin A (iOS), ist nicht geklärt.
   Ein echter Kauf- und Restore-Test fehlt.
2. Code der deployten Edge Functions (v5/v9/v8) sichern und versionieren.
3. Betroffene Person(en) der `INVALID_PROVIDER_DATE`-Ablehnungen vom 04.11. ermitteln (RevenueCat-Daten nötig).
4. Klären, warum `subscription-sync` 0 Aufrufe hatte.
5. Trainer Connect: Prüfen, ob die Meldung noch aktuell ist, und eine Geräteprüfung auf 57/60/Android durchführen.
6. GPS-Abweichung 5–15 m: zuerst Rohdaten beider Geräte erheben, bisher nicht dokumentiert.
7. Winkelerkennung: Feld-PASS fehlt, besonders für spitze Winkel.
8. Kartenabsturz: Geräte-PASS für 56/57/60 fehlt, der JS-Auslöser ist unbekannt.
9. Fährtendarstellung: Geräteabnahme aller OTAs vom 23.–31.10. fehlt, R2-Auslieferung unklar.
10. Build 59: Absturz beim Fährtenabschluss ungeklärt, Quelle nicht auf GitHub.
11. OTA-Empfang auf Build 60 (`launch=embedded`) und auf Build 59 ungeklärt.
