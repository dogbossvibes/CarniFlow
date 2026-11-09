# ANYVO — Produktkontext

Teil der zentralen Projektübergabe (2026-11-08, T-181). Verwandt:
[Release-Geschichte](ANYVO_RELEASE_HISTORY.md) ·
[Architektur und kritische Bereiche](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) ·
[Zusammenarbeit](ANYVO_COLLABORATION_RULES.md) ·
[Repository-Inventur](REPOSITORY_INVENTORY.md).

**Kennzeichnung:**
- **[B]** bestätigt im Code, in Git oder in EAS am 2026-11-08
- **[N]** Nutzerangabe aus der bisherigen Projektgeschichte, noch nicht unabhängig belegt
- **[H]** historische Repository-Doku
- **[O]** offen oder widersprüchlich

Dieses Dokument verdichtet und verweist. Die ausführlichen Quellen bleiben massgeblich:
`docs/00_READ_FIRST.md` (Engineering Handbook), `docs/handbook-source/00–12`,
`docs/adr/`, `docs/agent/DECISIONS.md`.

## 1. Was ANYVO ist

ANYVO ist eine **All-in-one-App für Hundehalter** [N][H]. Sie ist ausdrücklich
nicht auf Training oder Fährten reduziert.
- Plattformen iOS und Android, Expo/React Native mit Supabase-Backend [B].
- **Sprachen** [N][B]: Die App gibt es in fünf Sprachen, nämlich Deutsch, Schweizerdeutsch,
  Französisch, Italienisch und Englisch (`i18n/locales/{de,gsw,fr,it,en}.ts`). Dazu kommen
  die Regionalvarianten `i18n/de-CH.ts`, `i18n/gsw-CH.ts` und `i18n/de-DE.ts`. Die
  Übersetzungsparität war historisch mit 1'684 Keys bestätigt [H]. Bei Änderungen neu prüfen.
- Theme-Einstellung: Light, Dark, System [N].

### 1a. Positionierung, Zielgruppe, Ziele [N]

- **Positionierung:** Begleiter für den gesamten Hundealltag. Hundeverwaltung, Alltag,
  Gesundheit, Training, Dokumentation und Zusammenarbeit mit Trainern laufen in einer App
  zusammen.
- **Zielgruppe:**
  - normale Hundehalter, die eine einfache, verständliche App brauchen;
  - ambitionierte Sporthundeführer mit anspruchsvollen Trainingsfunktionen (Fährte, IGP);
  - Trainer, die mit ihren Kunden arbeiten (TRAINER-Plan).
- **Projektziele:**
  - professionelles, langfristig wartbares All-in-one-Produkt;
  - Stabilität und Datenintegrität vor Geschwindigkeit;
  - neue Versionen bauen auf nachweislich funktionierenden Ständen auf.
- **Design:**
  - hochwertig, modern, ruhig, intuitiv;
  - konsistenter Light- und Dark-Mode;
  - grosse Touch-Ziele und klare Navigation;
  - Barrierefreiheit (grosse Schrift);
  - iOS und Android gleichwertig.

### 1b. Trainingsdisziplinen [B: Begriffe im Code von Build 57]

IGP (Unterordnung, Fährte, Schutzdienst), IBGH, Mondioring, Obedience, Agility, Rally
und Mantrailing. Die **GPS-Fährte** ist das wichtigste Unterscheidungsmerkmal [N].

## 2. Module und ihre Verortung im Code

Die Pfade gelten für `origin/main` [B]. **Die Production-Linien sind deutlich weiter**
(z. B. `3bb78943`, Build 60). Sie enthalten zusätzlich die Feature-Module
`features/calendar`, `features/home`, `features/tracking-distractions`,
`features/tracking-exchange` (u. a. Gruppentraining live), `features/tracking-planner`,
`features/tracking-transfer` und `features/training-groups` [B]. Wer den
Kundenstand verstehen will, liest die jeweilige Release-Linie, nicht `main`.

| Modul | Code (Auszug) [B] | Hinweise |
|---|---|---|
| Hundeverwaltung und Hundeprofile | `features/dogs`, `app/dog*`, `app/add-dog.tsx`, `app/edit-dog.tsx`, `app/(tabs)/dogs.tsx` | inkl. Läufigkeit (`app/dog-heat*`), Ziele, Kommandos, Rucksack |
| Trainingsdokumentation | `features/training`, `app/unit/*`, `app/training*`, `app/(tabs)/training.tsx` | geführte Doku in drei Schritten in `app/unit/document.tsx` [H: BUILD59_CONTENT_AUDIT] |
| GPS-Fährtenarbeit | `features/tracking`, `features/track-sharing`, `app/track/*`, `modules/anyvo-precision-location` | **kritischster Bereich**, siehe Architektur-Dokument |
| Trainer Connect | `features/connect`, `app/connect*`, `app/trainer*`, `app/(tabs)/clients.tsx` | Connect-Flag `EXPO_PUBLIC_FEATURE_CONNECT_ENABLED`, Default aus [H: handbook 11]; zwei „Connection“-Systeme [O] |
| Smart Coach und KI | `features/ai`, Edge Functions `ai-analysis`, `analyze-training`, `generate-coach-summary`, `recommend`, `search-training-memory`, `generate-training-embedding`, `transcribe-voice-note` | Widerspruch: Doku „keine KI zur Trainingsanalyse“, Code mit vollem KI-Subsystem [O: handbook 11 §3] |
| Kalender und Termine | `lib/deviceCalendar.ts`, Edge Function `notify-appointment`; auf den Production-Linien zusätzlich `features/calendar` | auf `main` kein eigenes Feature-Modul |
| Gesundheit und Gesundheitsakte | `app/dog-health*`, `app/dog-health-record`, `app/dog-health-sharing` | Medikamente und Gaben-Historie, Freigabe an Trainer; Kundendatenerhalt besonders streng |
| Journal und Medien | `app/training-journal.tsx`, `features/media`, `features/voice` | Sprachmemos und Transkription |
| Dokumente und Statistiken | `app/dog-document`, `app/analyse`, `app/(tabs)/analytics.tsx`, `app/unit/stats` | |
| Weitere | `features/help` (Hilfe/Onboarding), `features/sync` (Offline/Sync), `features/updates`, `features/appIntents` | Offline-first [H: Handbook §3.3] |

## 3. Pläne und Berechtigungen

| Plan | Typ | Fähigkeiten laut Code [B] (`features/subscription/plans.ts`) | Store-Produkt [B] |
|---|---|---|---|
| NEWBIE | kostenlos | `pro_member=false`; **Monats-Quota 1 Hund, 2 Trainings, 1 Fährte** (serverseitig über `claim_newbie_quota`, Migration `20260925090000_newbie_track_quota_one.sql`) | keins |
| FOUNDER_ACTIVE | bezahlt, begrenzte Plätze („11 jemals“ [H]) | wie ACTIVE | `anyvo_founder_active_monthly_8.00` |
| ACTIVE | bezahlt | `pro_member=true` | `anyvo_active_monthly_10` |
| TRAINER | bezahlt | `pro_member=true` + `trainer_module=true` (Dashboard, Kunden, Umfragen, Kommentare, Pläne) | `anyvo_trainer_monthly_30.00` |
| Entitlement `lifetime` | administrativ | alle regulären Produkt-Capabilities, ohne Admin-Rechte (`user_entitlements`, RLS nur lesend) | keins |

**Entscheidung: NEWBIE darf 1 Fährte pro Monat aufzeichnen** (Nutzerin, 2026-11-08).
- Damit ist die frühere Angabe „NEWBIE hat keine Fährtenaufzeichnung“ überholt.
- Code [B]: Auf `main` und allen fünf Production-Quellen gilt `track: 1` pro Monat.
  Client `NEWBIE_QUOTA`, Server-Funktion `newbie_quota_limit('track') = 1` in der
  Migration `20260925090000_newbie_track_quota_one.sql`, Commit `bf81168e`
  „allow one newbie track per month“ (2026-09-25).
- `DECISIONS.md` nennt ebenfalls „1 Fährte“ [H]. Code, Doku und Entscheidung
  stimmen überein, eine Code-Änderung ist nicht nötig.
- **Geklärt am 2026-11-09 [B]:** Die Migration `20260925090000` ist auf Production
  angewendet, und `newbie_quota_limit('track')` liefert `1`. Das wurde nur lesend geprüft.

**Weitere offene Punkte zu Plänen:**
- [O] Die Preisangaben im Code (`priceChf` 4/9/15) passen nicht zu den Produkt-IDs
  (8.00/10/30.00). Massgeblich sind die Store-Preise, die nicht geprüft sind.
- [O] Es gibt drei Plan-Vokabulare (`Profile.plan`, `PlanLevel`, `SubscriptionPlan`)
  und drei Berechtigungstabellen (`subscriptions`, `user_capabilities`,
  `user_entitlements`) [H: handbook 11 §4].

**Grundsatz** [N][B]: Bezahlte Abos müssen zuverlässig freischalten. Der Weg ist
RevenueCat → Webhooks (`revenuecat-webhook`, `revenuecat-webhook-google`) →
`subscriptions`/`user_capabilities` → RLS und Server-RPCs. Ein Client-Gate allein
genügt nie. Details: `docs/architecture/ENTITLEMENT_SYSTEM.md`,
`docs/handbook-source/09_SUBSCRIPTIONS_AND_ROLES_INVENTORY.md`.

### 3a. Funktionsrechte je Plan (Produktsicht) [N][B]

| Funktion | NEWBIE | ACTIVE / FOUNDER_ACTIVE | TRAINER |
|---|---|---|---|
| Hunde | 1 | unbegrenzt | unbegrenzt |
| Trainings | 2 pro Monat | unbegrenzt | unbegrenzt |
| Fährtenaufzeichnung | **1 pro Monat** [N 08.11.; Production `newbie_quota_limit('track') = 1` B 09.11.] | ja | ja |
| Journal und Gesundheit | ja | ja | ja |
| Smart Coach / KI | nein | ja | ja |
| Trainer Connect | nur lesend [H] | ja | ja |
| Trainer-Hub (Kunden, Dashboard, Umfragen, Pläne) | nein | nein | ja |

Die ChatGPT-Übergabe nannte für NEWBIE noch „keine Fährtenaufzeichnung“. Das ist überholt.

### 3b. Monetarisierung [B][O]

- Monatsabos über RevenueCat (App Store, Google Play), Produkt-IDs siehe Tabelle oben.
- FOUNDER_ACTIVE ist ein begrenztes Kontingent (RPC `claim_founder_slot`).
- Gültige Preise kommen aus dem Store. Die historischen Preisangaben im Code sind nicht
  massgeblich [O].
- Die Freischaltung erfolgt nur serverseitig, siehe Architektur-Dokument und Abschnitt 4
  der [Kundenprobleme](ANYVO_CUSTOMER_ISSUE_HISTORY.md).

## 3c. Weitere Module im Detail

**Trainer Connect** [N][B]
- Trainer und Halter tauschen Trainingsinformationen aus: Text, Sprachnachrichten, Video,
  Fotos, Kommentare.
- Gesundheitsdaten werden nur mit Freigabe geteilt (`app/dog-health-sharing`).
- Gemeldet [H]: „ACTIVE-Nutzer können keinen Trainer hinzufügen“. Status siehe
  Kundenprobleme.

**Smart Coach und KI** [N]
- Die KI ist ein sichtbarer Assistent und gibt dezente, hilfreiche Hinweise.
- Sie ändert **keine** Trainingsdaten ungefragt.
- Geplant:
  - Hundegedächtnis aus freigegebenen Daten, mit Quellenbezug und Korrekturmöglichkeit;
  - Spracheingabe als Entwurf mit Bestätigung;
  - frühere Einheiten als Vorlage wiederaufnehmen, ohne alte Bewertungen ungeprüft zu
    übernehmen.

**Gesundheit und Alltag** [B]
- Gewicht mit eigenem Gewichtsjournal (seit Linie 57).
- Entwurmung, Läufigkeit, Gesundheitsakte mit Medikamenten- und Gabenhistorie.
- Termine und Kalender, Dokumente, Checklisten und Rucksack.

### 3d. Zukünftige Produktideen [N] (keine Umsetzungsfreigabe)

- Bessere GNSS-Qualitätsdiagnose, Verbesserungen bei GPS und IMU
- Umschalter Satellit/Hybrid-Karte, später swisstopo-Luftbilder
- Hundegedächtnis und Smart-Coach-Ausbau (siehe oben)
- Website und Marketing (`legal-web/`; `anyvo-web` nur auf GitHub)

## 4. Produktgrundsätze

- Bestehende Kundendaten haben Vorrang. Keine verlustbehafteten Reparaturen
  (AGENTS.md „Kundendatenerhalt“).
- Funktionierende Kundenfunktionen, insbesondere die Fährtenaufzeichnung, nicht
  durch Architekturumbau gefährden [N].
- Ruhige, verständliche Oberflächen, Barrierefreiheit, grosse Schrift und
  Dark Mode auf beiden Plattformen (AGENTS.md).
- Die SDK-Migration und neue Funktionen sind getrennte Aufgaben [N] (siehe Release-Geschichte).
