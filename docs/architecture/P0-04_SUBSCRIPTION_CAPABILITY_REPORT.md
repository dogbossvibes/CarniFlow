# P0-04 — Subscription / Capability Report

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Bezug:** [[P0-01_DATABASE_TRUTH_REPORT]] · [[P0-09... n/a]]
Keine Produktentscheidung — nur Ist-Zustand aus Code, Doku-Absicht und Remote-Schema.

---

## 1. Pläne (Code: `features/subscription/plans.ts`)

| Plan | `id` | Preis (Code) | Product-ID | trainer |
|---|---|---|---|---|
| Newbie | `newbie` | CHF 0 (Trial) | `anyvo_newbie_monthly_0` | false |
| Founder Active | `founder_active` | CHF 4 | `anyvo_founder_active_monthly_8.00` | false |
| Active | `active` | CHF 6 | `anyvo_active_monthly_10` | false |
| Trainer | `trainer` | CHF 15 | `anyvo_trainer_monthly_30.00` | true |

- `FOUNDER_SLOT_LIMIT = 11` (Client-Anzeige; autoritativ serverseitig `claim_founder_slot()` — RPC **BLOCKED**, nicht read-only prüfbar).
- Legacy `beginner_trial` wird beim **Lesen** auf `newbie` normalisiert (`normalizeSubscriptionPlan`), nie neu gespeichert.

---

## 2. `planToCapabilities()` — Kernfrage

```ts
export function planToCapabilities(plan: SubscriptionPlan): { pro_member: boolean; trainer_module: boolean } {
  return { pro_member: true, trainer_module: plan === 'trainer' };
}
```

### ✅ Bestätigt: **NEWBIE erhält `pro_member = true`**
Alle vier Pläne (inkl. `newbie`) → `pro_member: true`. `trainer_module` nur bei `trainer`.
`services/subscriptionService.ts` (Z. 98–119) schreibt beim Setzen eines Abos:
`status = plan==='newbie' ? 'trialing' : 'active'` und `setCapabilities(planToCapabilities(plan))` → **`user_capabilities.pro_member = true` für Newbie**.

`features/subscription/plans.ts#hasCapability`: alle `ACTIVE_CAPABILITIES` (`training.create, training.analytics, dogs.manage, ai.feedback, calendar.use, voice.notes`) sind für **alle 4 Pläne** true; `TRAINER_CAPABILITIES` nur für `trainer`.

### Kernbefund P0-04-A: Tiers kollabieren zu 2 Booleans
`user_capabilities` hat remote **nur** `{user_id, pro_member, trainer_module, updated_at}` (verifiziert; `plan`/`is_trainer`/`connect_enabled` = 404). `useCapabilities`/`planLevelOf` leiten alles aus `pro_member`/`trainer_module` ab. ⇒ **Newbie, Active und Founder Active sind auf Capability-Ebene NICHT unterscheidbar** (alle = „pro"). Eine differenzierte Gating-Logik pro Stufe ist damit technisch aktuell nicht möglich.

---

## 3. Auswirkung auf CONNECT (`features/connect/services/connect-entitlements.ts`)

```ts
canCreatePost: isPro, canCreateEvent: isPro, canSearchTrainingPartners: isPro,
maxFriends: isPro ? null : CONNECT_NEWBIE_MAX_FRIENDS,   // 25
canCreateGroup / canManageTrainerProfile: isTrainerModule
```
`isPro` = `pro_member`. Da **Newbie = pro_member=true**, gilt für Newbie: `isPro=true`.

### Kernbefund P0-04-B: Dokumentierte Newbie-Limits greifen nie
Der Datei-Header dokumentiert die **Absicht**: „Newbie: Profil, Feed lesen, **begrenzte** Freunde/Nachrichten". Technisch bekommt Newbie aber `canCreatePost/Event/canSearchTrainingPartners = true` und **`maxFriends = null` (unbegrenzt)**. ⇒ **Konflikt Absicht ↔ Technik.**

### Kernbefund P0-04-C: `EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS`
```ts
export const CONNECT_ENFORCE_ENTITLEMENTS = process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS === 'true';
effectiveConnectEntitlements = enforce ? connectEntitlements(caps) : ALL_ACCESS;
```
- Flag ist **in `.env`, `app.json`, `eas.json` NICHT gesetzt** → default **`false`** → `effectiveConnectEntitlements` liefert **`ALL_ACCESS`** für **jeden** Nutzer.
- ⇒ **Aktuell** ist CONNECT-Gating komplett aus; selbst wenn P0-04-B behoben würde, hätte es ohne dieses Flag keine Wirkung.

---

## 4. Entitlement-/Trainer-Pfad

- `services/capabilityService.getMyCapabilities`: liest `user_capabilities`; Fallback auf `profiles.plan==='premium'` + `profiles.is_trainer`; berücksichtigt Trial-Ablauf (`isTrialLapsed`), manuelle Entitlements und **Internal-Tester** (`profiles.is_internal_tester`/`tester_level`, remote verifiziert).
- **`services/entitlementService.getActiveEntitlement`** fragt Tabelle **`user_entitlements`** ab → remote **404** (siehe [[P0-01_DATABASE_TRUTH_REPORT]] P0-01-C). Fehler wird abgefangen (`return null`).
  ### Kernbefund P0-04-D: Lifetime/manuelle Entitlements sind tot
  Das gesamte Entitlement-Feature (`lifetime_active`, `lifetime_trainer`, `founder`/`admin`-Grants) läuft ins Leere, weil die Tabelle remote fehlt. `USER_ENTITLEMENTS_SETUP.sql` existiert, ist aber nicht angewandt.
- **RevenueCat:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` gesetzt; Webhook `supabase/functions/revenuecat-webhook` vorhanden; Founder-Claim via `supabase/functions/claim-founder-active`. Funktions-Interna und ob der Webhook `user_capabilities`/`subscriptions` korrekt setzt = **nicht in diesem Pass verifiziert** (Edge-Function-Runtime/Secrets BLOCKED).

---

## 5. Capability-Matrix

Legende: **T** = technisch aktueller Ist-Zustand · **D** = dokumentiert beabsichtigt · **K** = Konflikt (T≠D) · **?** = unbekannt/nicht verifiziert.
Annahme: aktives Abo (`status ∈ {active, trialing}`), Flag `CONNECT_ENFORCE_ENTITLEMENTS` **aus** (aktueller Default).

| Funktion / Capability | NEWBIE | ACTIVE | FOUNDER ACTIVE | TRAINER |
|---|:--:|:--:|:--:|:--:|
| `training.create` | T:✅ | T:✅ | T:✅ | T:✅ |
| `training.analytics` | T:✅ | T:✅ | T:✅ | T:✅ |
| `dogs.manage` | T:✅ | T:✅ | T:✅ | T:✅ |
| `ai.feedback` | T:✅ | T:✅ | T:✅ | T:✅ |
| `calendar.use` | T:✅ | T:✅ | T:✅ | T:✅ |
| `voice.notes` | T:✅ | T:✅ | T:✅ | T:✅ |
| `trainer.*` (dashboard/clients/surveys/comments/plans) | T:❌ | T:❌ | T:❌ | T:✅ |
| CONNECT: Feed lesen | T:✅ | T:✅ | T:✅ | T:✅ |
| CONNECT: Post/Event/Partner-Suche | **T:✅ / D:❌ → K** | T:✅ | T:✅ | T:✅ |
| CONNECT: maxFriends | **T:∞ / D:25 → K** | T:∞ | T:∞ | T:∞ |
| CONNECT: Gruppe/Trainerprofil | T:❌ | T:❌ | T:❌ | T:✅ |
| CONNECT-Gating aktiv? | **T:❌ (Flag aus) → ALL_ACCESS** | ❌ | ❌ | ❌ |
| Lifetime/manuelles Entitlement | **T:❌ (Tabelle 404) → K** | T:❌ K | T:❌ K | T:❌ K |
| Unterscheidbarkeit newbie/active/founder | **T:❌ (nur pro_member) → K** | — | — | — |

### Konflikte (Zusammenfassung)
- **K1** Newbie = pro_member → keine echten „Free"-Limits (App + CONNECT). *(P0-04-A/B)*
- **K2** CONNECT-Enforce-Flag aus → ALL_ACCESS für alle. *(P0-04-C)*
- **K3** `user_entitlements` fehlt remote → Lifetime/manuell/Founder-Grants wirkungslos. *(P0-04-D)*
- **K4** Capability-Modell kann Stufen (newbie/active/founder) nicht unterscheiden. *(P0-04-A)*

### Nicht verifiziert (BLOCKED)
RevenueCat-Webhook-Interna, `claim_founder_slot()`-RPC/Advisory-Lock, RLS auf `subscriptions`/`user_capabilities`, ob `profiles.plan='premium'` noch produktiv genutzt wird.
