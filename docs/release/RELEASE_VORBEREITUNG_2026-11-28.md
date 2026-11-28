# Release-Vorbereitung und Abo-Diagnose – 2026-11-28

Stand: `main` @ `dfb8811` (nach PR #318), Release-Karte #319 als letzter Production-Stand.
Nur lesend erstellt. Keine OTA, kein Build, kein Deploy, keine DB-Aktion.

## 1. Issue #7 – bezahltes ACTIVE-Abo wird nicht freigeschaltet

### Was der Code heute macht (geprüft)

- Seit `0a018fe4` (16.10.) ruft der Client nach Kauf und Wiederherstellung nur noch die Edge
  Function `subscription-sync` auf (`services/subscriptionAuthorityService.ts`). Build 60 enthält
  diesen Stand (`3bb78943` hat `0a018fe4` als Vorfahren).
- Die Webhooks `revenuecat-webhook` und `revenuecat-webhook-google` nutzen denselben
  serverautoritativen Abgleich (`supabase/functions/_shared/handlers.ts`, `runtime.ts`).
  Die alte Datei `_shared/revenuecat-webhook.ts` wird von keiner Function mehr benutzt.
- Der Abgleich ist absichtlich fail-closed: Bei jedem Widerspruch antwortet der Server 503
  `SUBSCRIPTION_SYNC_PENDING`, und die App zeigt «wird noch bestätigt». Er schreibt dann
  **keine** Rechte. Es gibt rund 50 solcher Gründe. Der Grund steht nur im Server-Log als
  `subscription_authority_failure` mit `code`.
- Tests: Webhook, Verlängerung, `lib/purchases*`, `services/**`: 77 Suiten, 810 Tests grün.

### Warum hier kein Code-Fix kommt

Ohne Server-Log ist nicht feststellbar, welcher der Gründe die zwei Kundinnen blockiert. Ein
Fix auf Verdacht an der Abo-Autorität könnte bezahlte Rechte falsch vergeben oder entziehen.
Das Issue selbst verlangt hier STOP. Die Diagnose unten dauert etwa 10 Minuten und ist rein lesend.

### Diagnose (lesend, Supabase-Dashboard und RevenueCat)

1. **Edge Functions → Logs** von `subscription-sync`, `revenuecat-webhook`,
   `revenuecat-webhook-google`: nach `subscription_authority_failure` filtern und die
   häufigsten Werte von `code` notieren (keine Kundendaten in GitHub kopieren).
2. **Edge Functions → Secrets:** nur prüfen, ob die Namen vorhanden sind:
   `SUBSCRIPTION_OWNERSHIP_ENABLED` (muss `true` sein), `REVENUECAT_SECRET_API_KEY`,
   `REVENUECAT_V2_READ_KEY`, `RC_WEBHOOK_SECRET`.
3. **Edge Functions → Versionen:** Ist der Fix aus PR #29 (Verlängerung vor Periodenbeginn,
   `INVALID_PROVIDER_DATE`) deployed? Laut T-183 war der Deploy offen; Stand damals
   `subscription-sync` v5, `revenuecat-webhook` v9, `revenuecat-webhook-google` v8.
4. **RevenueCat → Integrations → Webhooks:** fehlgeschlagene Zustellungen (503) der
   betroffenen Kundinnen; je Kundin aktives Entitlement, Produkt, Store, App User ID/Aliases.

### Was der Log-Code bedeutet

| `code` | Wahrscheinliche Ursache | Nächster Schritt |
|---|---|---|
| `AUTHORITY_NOT_ACTIVATED` | `SUBSCRIPTION_OWNERSHIP_ENABLED` ist nicht `true` | Secret setzen (Freigabe der Nutzerin) – betrifft dann **alle** Käufe |
| `SERVER_NOT_CONFIGURED` | V1- oder V2-RevenueCat-Key fehlt | Secret ergänzen (Freigabe) |
| `INVALID_PROVIDER_DATE`, `V1_V2_DISAGREE` | Verlängerung vor Periodenbeginn | PR #29-Stand deployen (Freigabe), dann Webhooks in RevenueCat erneut senden |
| `OWNER_NOT_CANONICAL`, `AMBIGUOUS_ALIAS`, `MULTIPLE_AUTH_ACCOUNTS_IN_ALIAS_SET` | Kauf unter anonymer ID oder anderem ANYVO-Konto | RevenueCat-Aliase je Kundin prüfen, Transfer-Regel klären |
| `PROVIDER_PRODUCT`, `UNMAPPED_PROVIDER_*`, `PROVIDER_ENTITLEMENT*` | Produkt-/Base-Plan-/Entitlement-Kennung nicht im Katalog | Kennung mit `catalog` in `_shared/provider.ts` und Aliasen in `normalizer.ts` abgleichen, dann gezielter Code-Fix mit Test |
| `ACCOUNT_PROOF_INVALID` / `AUTH_REQUIRED` | Konto ohne bestätigte E-Mail (`email_confirmed_at`) | Anmeldeart der Kundin prüfen |
| `RECONCILIATION_BUSY`, `SYNC_RATE_LIMIT` | vorübergehend | erneut versuchen; nur bei Dauerzustand Fix |

Mit dem Code kann eine Aufgaben-Sitzung einen gezielten Fix samt Regressionstest bauen.
Auslieferung dann per Edge-Function-Deploy, nicht per OTA.

## 2. Mantrailing (PR #291)

PR #291 ist am 28.11. um 07:44 UTC gemergt (`6beb5794`), samt B2 (#294), C (#300), #309.
Es fehlt nur die Auslieferung, siehe Abschnitt 3.

## 3. Nächste Charge (OTA, iOS 60 + Android 53/54)

Production laut Karte #319: iOS `47848b07`, Android `624df9c2`. Die nächste OTA muss diese
Stände enthalten. Android ist inhaltlich auf iOS-Stand (Nachzug mit #289), es fehlt beiden
Plattformen nur das Native unten.

**Auf main, nicht ausgeliefert**

| Inhalt | PRs | Voraussetzung |
|---|---|---|
| Mantrailing | #287, #291, #294, #300, #309 | Production-Migrationen `20261125180000_newbie_mantrail_quota.sql`, `20261125200000_training_group_mantrail.sql` |
| Vereinsmodus | #302, #304, #305, #306 | Production-Migrationen `20261126120000_training_group_plans.sql`, `20261127120000_training_group_plan_notify.sql` |
| Wochenvorschlag (Coach) | #312, #314, #315 | Gerätetest vorher |
| Trainingswetter + Mantrailing-Unterkarte | #318, #320 | keine |

Testweg: **Vorher** (neue Daten, Migrationen). Reihenfolge: Migrationen in Production, dann
Gerätetest auf einem Preview-/Staging-Stand, dann OTA durch den MASTER mit Freigabe der Charge.

## 4. Nativer Build (nächste Store-Version)

Nur mit Build: #196 (nativer Google-Login), #200 (Android-Start-Logo), #290 Teil 2
(System-Abfrage «App bewerten»).

- Version: Runtime-Policy ist fest je Plattform (`1.0.8-sdk58-v1`, `1.0.8-sdk58-android-v1`).
  Für den Build `ios.buildNumber` auf 61 und `android.versionCode` über den letzten
  Play-Stand (54) heben. Ob die App-Version 1.0.8 bleibt oder auf 1.0.9 geht und ob die
  Runtime wechselt, ist eine Entscheidung der Nutzerin; bei neuer Runtime gilt die
  OTA-Abdeckungsprüfung (`npm run release:check:ota-coverage`).
- Vor dem Build: `npm run release:check:ota-coverage` je Plattform.

## 5. Release-Notes (Vorschlag, 3–5 Punkte)

**Deutsch**
- Mantrailing: Lege Trails, lass deinen Hund suchen, auch doppelblind, und sieh die Auswertung.
- Vereinsmodus: Plane Trainingstage, sammle Zusagen und behalte den Ablauf am Tag im Blick.
- Wochenvorschlag je Hund: ANYVO schlägt dir Einheiten vor, die du direkt in den Kalender übernimmst.
- Trainingswetter: Neu mit eigener Einschätzung fürs Mantrailing.
- Anmelden mit Google geht jetzt schneller. *(nur mit neuem Build)*

**English**
- Mantrailing: lay trails, let your dog work them, even double-blind, and review the results.
- Club mode: plan training days, collect sign-ups and follow the day's schedule.
- Weekly plan per dog: ANYVO suggests sessions you can add straight to your calendar.
- Training weather: now with its own rating for mantrailing.
- Signing in with Google is now quicker. *(new build only)*

Store-Limit «Neue Funktionen»: App Store 4000, Google Play 500 Zeichen. Beide Fassungen
liegen unter 500.

## 6. Was die Nutzerin selbst tun muss

1. Diagnose aus Abschnitt 1 ausführen oder einer Sitzung mit Supabase-/RevenueCat-Zugang freigeben.
2. Die vier Production-Migrationen freigeben und ausführen lassen.
3. Gerätetest Mantrailing, Vereinsmodus, Wochenvorschlag.
4. Konkrete OTA-Charge freigeben (Inhalt und Ziele nennen).
5. Für den Build: Version entscheiden, Build freigeben, Store-Upload und Release-Notes im
   App Store Connect / Play Console eintragen.
