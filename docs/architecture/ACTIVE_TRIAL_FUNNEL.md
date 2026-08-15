# ANYVO — ACTIVE 3-Tage-Store-Trial (Funnel) — Architektur & manuelle Schritte

> Stand: 2026-08-16. Implementiert die ANYVO-Seite; Store/RevenueCat/DB-Konfiguration ist **manuell**
> (nicht automatisch verändert). **Kein Commit/Push/Build/OTA/Migration** in diesem Schritt (Spec §25).

## Prinzip
Der 3-Tage-ACTIVE-Trial (iOS + Android einheitlich) läuft als **Apple/Google Introductory Offer** über die **bestehende
RevenueCat-Architektur** (`lib/purchases.ts`, Entitlement `pro`, Produkt `anyvo_active_monthly_10`).
Kein selbstgebauter Timer, keine zweite Subscription-Architektur. Während des Store-Trials liefert
RevenueCat das Entitlement `pro` → `subscriptions.plan='active'` → `pro_member=true` →
**reguläre ACTIVE-Capabilities inkl. Fährten** (keine Sonder-Trial-Capabilities). Nach dem Trial
bleibt **RevenueCat/Store Source of Truth**; der effektive Plan fällt bei Nicht-Verlängerung auf
NEWBIE zurück (kein eigener Cronjob).

## Funnel
Registrierung → NEWBIE → Hund → App kennenlernen → **erstes Training dokumentiert** → Eligibility →
Angebot „Bereit für mehr?" → Store-Purchase (3 Tage gratis) → ACTIVE → danach reguläres ACTIVE, sofern
nicht gekündigt.

## ANYVO-Eligibility (`features/subscription/activeTrial.ts`, rein/testbar)
Angeboten nur wenn ALLE erfüllt: effektiver Plan = newbie · ≥ 1 abgeschlossenes Training · Konto ≥ 24 h ·
kein ACTIVE/FOUNDER/TRAINER aktiv · kein lifetime · Trial serverseitig noch nicht gestartet ·
**Store/RevenueCat bestätigt ein verfügbares/kaufbares Trial-Angebot**. Ein rein lokales Flag ist NICHT
Source of Truth. „Später" verbraucht die Eligibility nicht; Cooldown 3 Tage, max. 3 proaktive Anzeigen.

## F. Trial-Dauer: **3 Tage, iOS + Android einheitlich** (ENTSCHEIDUNG)
Apple erlaubt für Free-Trial-Introductory-Offers nur feste Dauern: **3 Tage, 1 Woche, 2 Wochen, 1/2/3/6
Monate, 1 Jahr** — **4 Tage sind bei Apple NICHT möglich**. Google Play erlaubt frei wählbare Free-Trials
ab min. 3 Tagen. Um plattformübergreifend konsistent zu sein, ist die Zieldauer **auf beiden Plattformen 3 Tage**.
- **iOS:** Apples **3-Tage**-Free-Trial (von Apple unterstützt).
- **Android:** Free-Trial-Phase **3 Tage** (Google-Minimum, deckungsgleich mit iOS).
- Die App zeigt IMMER die **tatsächliche Store-Dauer** (`displayTrialDays` nutzt den Store-Wert) — es wird
  nie eine falsche Dauer angezeigt, wenn der Store abweichende Daten liefert. `ACTIVE_TRIAL_TARGET_DAYS = 3`
  ist nur Fallback/Referenz, keine harte Codierung im Kauf-Flow.

## M. App Store Connect (iOS) — manuell
1. App Store Connect → ANYVO → **Subscriptions** → Gruppe → Produkt **`anyvo_active_monthly_10`** (ACTIVE).
2. **Introductory Offer** anlegen: Typ **Free Trial**.
3. **Dauer:** **3 Tage** (von Apple unterstützt; 4 Tage sind bei Apple nicht verfügbar).
4. **Eligibility:** „New subscribers" (Standard-Introductory-Offer). ANYVO steuert zusätzlich intern, WER das
   Angebot sieht (nur qualifizierte NEWBIE) — Apple prüft die Store-Eligibility zusätzlich.
5. **Storefronts:** alle relevanten (mind. CH); Preis pro Storefront ist bereits am ACTIVE-Produkt gesetzt.
6. **Startdatum:** sofort/„No End Date". Review durch Apple beachten.
7. Kein neues Produkt anlegen — bestehendes ACTIVE-Produkt verwenden.

## N. Google Play Console (Android) — manuell
1. Play Console → ANYVO → **Monetarisierung → Abonnements** → ACTIVE-Produkt → **Base Plan** (auto-renewing monthly).
2. **Offer** am Base Plan anlegen mit **Free-Trial-Phase**: **3 Tage** (Google-Minimum; einheitlich mit iOS).
3. **Offer-ID / Tag:** eindeutige Offer-ID vergeben (z. B. `active-trial-3d`) + Tag zur Identifikation.
4. **Eligibility:** **„Developer determined"** empfohlen → ANYVO-interne Eligibility entscheidet, wer das
   Offer sieht (nur qualifizierte NEWBIE). (Alternativ „New customer acquisition" — dann bestimmt Google die
   Neukunden-Eligibility; ANYVO-Gate bleibt zusätzlich aktiv.)
5. **Länder/Regionen:** wie ACTIVE-Produkt (mind. CH). Preis kommt aus dem Base Plan.

## O. RevenueCat — manuell
1. **Entitlement `pro`** bleibt (ACTIVE). Kein neues Entitlement.
2. **Produkte:** iOS `anyvo_active_monthly_10` + Introductory Offer; Android Base Plan + Offer verknüpfen.
3. **Offering/Packages:** das aktuelle Offering muss das ACTIVE-Package (monthly) enthalten; das
   Introductory/Free-Trial-Offer ist am Produkt/Base-Plan hinterlegt (RC liest es automatisch).
4. **Android Offer Handling:** bei „Developer determined" das Trial-Offer über die Offer-ID im Angebot führen;
   RC/Google präsentieren es beim Kauf. (RevenueCat 10.x wählt i. d. R. `defaultOption`/`freePhase`.)
5. **Trial Eligibility:** iOS via StoreKit (`checkTrialOrIntroductoryPriceEligibility`, bereits genutzt).
6. Keine neuen Produkte erfinden.

## I. Datenbank — Migration (NICHT ausgeführt)
`supabase/migrations/20260816120000_active_trial_status.sql` erweitert die **bestehende** `subscriptions`-
Tabelle additiv: `active_trial_offered_at`, `active_trial_started_at`, `active_trial_platform`,
`active_trial_offer_count`. Nullable, idempotent, keine RLS-/Datenänderung. **Freigabe zum Ausführen erforderlich.**
`services/activeTrialService.ts` liest/schreibt tolerant (kein Crash vor der Migration).

## Cross-Platform / Restore / Logout
- **Anti-Doppel-Trial:** `active_trial_started_at` ist der plattformübergreifende Marker (an RevenueCat-User =
  ANYVO-User-ID gebunden). iOS-Start → Android-Login sieht `startedAt` gesetzt → kein zweiter Trial.
- **Restore:** unverändert (`restorePurchases`); der Store meldet den bestehenden Trial, kein neuer 3-Tage-Trial.
- **Logout/Accountwechsel:** Capability-/Trial-Queries sind per User-ID getrennt (React Query keys `['…', uid]`).

## Dateien (ANYVO-Seite)
- `features/subscription/activeTrial.ts` (+Test) — Eligibility/Cooldown/Store-Dauer, Event-Konstanten.
- `lib/purchases.ts` (additiv, +Test) — `getActiveTrialOffer`, `buyActiveTrial`, Store-Perioden-Parser.
- `services/activeTrialService.ts` — Server-Status (offered/started/platform) + Analytics-Seam.
- `hooks/useActiveTrialOffer.ts` — Komposition (Capabilities + Trainings + Kontoalter + Server + Store).
- `components/subscription/ActiveTrialSheet.tsx` + `ActiveTrialGate.tsx` — UI + proaktive Anzeige.
- `app/(tabs)/home.tsx` — `<ActiveTrialGate />` eingehängt (Home-Fläche).
- i18n `activeTrial.*` (de-CH/gsw-CH/fr).
