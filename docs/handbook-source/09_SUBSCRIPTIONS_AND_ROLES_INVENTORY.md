# 09 — Subscriptions & Roles Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme von Abos (RevenueCat), Capabilities/Entitlements, Founder-Modell, Rollen und Auth.

## Gefundene Dateien

- Pläne/Capabilities: `features/subscription/plans.ts`, `features/subscription/internalTester.ts`, `types/capabilities.ts`, `lib/entitlements/getUserAccess.ts`, `lib/planLimits.ts`.
- IAP: `lib/purchases.ts` (RevenueCat), `app/premium.tsx`.
- Services/Hooks: `services/capabilityService.ts`, `services/subscriptionService.ts`, `services/entitlementService.ts`, `hooks/useCapabilities.ts`, `hooks/useAccess.ts`, `hooks/usePlan.ts`, `hooks/useInternalTester.ts`.
- Auth/Rollen: `services/auth.ts`, `lib/session-context.tsx`, `types/index.ts` (`Profile.role`), `types/trainer.ts` (`UserRole`).
- DB/Functions: `subscriptions`, `user_capabilities`, `user_entitlements`, `founder_slots`; `supabase/functions/revenuecat-webhook`, `claim-founder-active`, `delete-account`; SQL `SUBSCRIPTION_V2_SETUP.sql`, `SUBSCRIPTION_NEWBIE_MIGRATION.sql`, `CAPABILITY_MODEL_SETUP.sql`, `USER_ENTITLEMENTS_SETUP.sql`, `INTERNAL_TESTER_SETUP.sql`, `FOUNDER_WEBHOOK_SETUP.sql`, `TRIAL_CANCEL_SETUP.sql`, `PREMIUM_SETUP.sql`, `SUBSCRIPTIONS_SETUP.sql`.
- Tests: `features/subscription/__tests__/capabilities.test.ts`, `internalTester.test.ts`, `newbie-migration.test.ts`.

## Abo-Modell (aktiv, `features/subscription/plans.ts`)

- `SubscriptionPlan = 'newbie' | 'founder_active' | 'active' | 'trainer'`; Status `trialing|active|expired|cancelled|past_due`.
- Preise (`PLAN_META`): Newbie Gratis (CHF 0), Founder Active CHF 4, Active CHF 6, Trainer CHF 15. **[UNKLAR]/Widerspruch:** In `lib/purchases.ts`-Kommentaren stehen CHF 10 (Active) / CHF 8 (Founder) / CHF 30 (Trainer); Product-ID-Suffixe (`_10`, `_8.00`, `_30.00`) weichen ebenfalls von den `PLAN_META`-Preisen ab. Kommentare markieren Suffixe als „historisch". Autoritativ ist der im Store gesetzte Preis (nicht im Repo).
- Product-IDs `PRODUCT_IDS` (nur Monatsabos). `TRIAL_DAYS = 7`.
- **Founder:** `FOUNDER_SLOT_LIMIT = 11` (ehem. 77). Autoritative, race-sichere Prüfung serverseitig: RPC `public.claim_founder_slot()` (`pg_advisory_xact_lock`) + Function `claim-founder-active`. Client-Wert muss mit `public.founder_slot_limit()` übereinstimmen.
- Capability-Prüfung `hasCapability(sub, cap)`; alle 4 Pläne sind „pro" (`ACTIVE_CAPABILITIES`), Trainer zusätzlich `TRAINER_CAPABILITIES`. `planToCapabilities(plan) → { pro_member, trainer_module }`.
- Legacy-Normalisierung `normalizeSubscriptionPlan`: alter DB-Wert `'beginner_trial'` → `'newbie'` (nur beim Lesen), unbekannt → `null`. `isTrialLapsed` (clientseitige Trial-Ablaufprüfung, kein Server-Job).

## Capabilities/Entitlements (mehrschichtig)

- `UserCapabilities { pro_member, trainer_module }` + `planLevelOf` → `PlanLevel 'free'|'pro'|'trainer'` (`types/capabilities.ts`).
- `capabilityService.getMyCapabilities` liest **drei** Quellen zusammen: `user_capabilities`, `subscriptions` (status/trial_ends_at), `profiles` (is_internal_tester/tester_level).
- Interner Tester (`features/subscription/internalTester.ts`, `TesterLevel`): schaltet vollen Zugriff **ohne** RevenueCat frei (nur via service_role setzbar, `INTERNAL_TESTER_SETUP.sql`).
- Parallel: `user_entitlements` + `services/entitlementService.ts` + `lib/entitlements/getUserAccess.ts` — **[UNKLAR]** Verhältnis zu `user_capabilities`/`subscriptions` (mehrere Berechtigungsquellen).

## RevenueCat (`lib/purchases.ts`)

- Defensive Ladung (kein Crash ohne Modul/Key). Entitlements `{ pro, trainer }`. `configurePurchases(userId)` beim Login (`(tabs)/_layout.tsx`). `getPackages/buyPackage/restorePurchases`. iOS-Key in `eas.json`/env; **Android-Key** über `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` — in `eas.json` **nicht gesetzt** (nur iOS-Key vorhanden) → **[UNKLAR]** ob Android-IAP konfiguriert ist.
- Webhook `revenuecat-webhook` schreibt vermutlich `subscriptions`/`user_capabilities` (Deno nicht gelesen — **[UNKLAR]**).

## Rollen & Auth

- Rollen: `Profile.role = 'user'|'trainer'|'admin'` (`types/index.ts`); DB-Trigger `handle_new_user` klammert Self-Signup auf `user`/`trainer` (kein Self-`admin`) — `services/auth.ts`.
- Auth-Methoden (`services/auth.ts`): E-Mail/Passwort, **Sign in with Apple** (nativ, Guideline 4.8), **Google OAuth** (PKCE, In-App-WebBrowser), `updatePassword/updateEmail`, `deleteAccount` (Edge Function `delete-account`, service_role).
- Session/PKCE in `lib/supabase.ts` + `lib/session-context.tsx`.

## Aktuelle Regeln

- Trainer-Funktionen ⇒ `trainer_module`; „Active"-Funktionen ⇒ `pro_member`; ohne aktives Abo keine Capabilities (`plans.ts`).
- Founder-Limit serverseitig autoritativ.

## Inkonsistenzen (zentral)

- **Drei Plan-Vokabulare:** `Profile.plan ('free'|'premium')` (`types/index.ts`) vs. `PlanLevel ('free'|'pro'|'trainer')` vs. `SubscriptionPlan ('newbie'|'founder_active'|'active'|'trainer')`. Kein einheitliches Modell.
- **Preis-/Product-ID-Divergenz** zwischen `plans.ts` (`PLAN_META`) und `lib/purchases.ts`-Kommentaren/IDs.
- **Mehrere Berechtigungstabellen** (`subscriptions`, `user_capabilities`, `user_entitlements`) + interner Tester → mehrere „Access"-Quellen.
- Android-RevenueCat-Key fehlt in `eas.json`.

## Offene Fragen

- Welche Preise/Product-IDs gelten produktiv (Store-Wahrheit)?
- Verhältnis `user_entitlements` ↔ `user_capabilities` ↔ `subscriptions`?
- Ist Android-IAP aktiv konfiguriert?
- Wird `Profile.plan ('premium')` noch irgendwo genutzt oder ist es tot?

## Technische Risiken

- Uneinheitliche Plan-/Access-Modelle → Fehler beim Feature-Gating (falscher Zugriff gewährt/verweigert).
- Clientseitige Trial-Ablaufprüfung ohne Server-Job → Zustands-Drift zwischen DB-`status` und tatsächlicher Berechtigung.

## Mögliche spätere Verbesserungen

- Ein Plan-/Access-Modell als Single Source (z. B. `subscriptions.plan` → abgeleitete Capabilities), Legacy-Felder deprecaten.
- Preise/IDs zentral aus einer Quelle mit Store abgleichen; Android-Key ergänzen.
