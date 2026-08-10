// ANYVO Subscription V2 — Pläne, Product-IDs, Capabilities.
// Founder Active ist ein EIGENER Plan (kein Rabatt). „Active"-Funktionen = pro_member,
// „Trainer"-Funktionen = trainer_module. Der Plan steuert user_capabilities.

// Abo-Stufen: NEWBIE (Einstieg), ACTIVE, FOUNDER_ACTIVE, TRAINER.
// (Die frühere Bezeichnung „Beginner" wird nicht mehr verwendet.)
export type SubscriptionPlan = 'newbie' | 'founder_active' | 'active' | 'trainer';
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled' | 'past_due';

// Maximale Anzahl Founder-Active-Slots (Anzeige/Client). Ehemals 77, seit dem
// Founder-Relaunch 11. Die AUTORITATIVE, race-sichere Prüfung erfolgt serverseitig
// in der RPC public.claim_founder_slot() (Postgres, pg_advisory_xact_lock). Dieser
// Wert MUSS mit public.founder_slot_limit() in SUBSCRIPTION_V2_SETUP.sql übereinstimmen.
export const FOUNDER_SLOT_LIMIT = 11;

export type Capability =
  | 'training.create' | 'training.analytics' | 'dogs.manage' | 'ai.feedback'
  | 'calendar.use' | 'voice.notes'
  | 'dogs.backpack' | 'dogs.heat' | 'dogs.commands' | 'dogs.goal'
  | 'trainer.dashboard' | 'trainer.clients' | 'trainer.surveys' | 'trainer.comments' | 'trainer.plans';

// Funktions-Capabilities, die auch NEWBIE (kostenlos) hat. Die ANZAHL neuer
// Aktionen ist zusätzlich durch Monats-Quotas begrenzt (siehe quotaLimit).
export const BASE_CAPABILITIES: Capability[] = [
  'training.create', 'dogs.manage', 'calendar.use', 'voice.notes',
];
// Premium-only. NEWBIE erhält KEINE davon: Smart Coach/Analyse (training.analytics,
// ai.feedback) sowie die Hunde-Zusatzfunktionen Backpack, Läufigkeit/Heat-Tracking
// (dogs.heat), Kommandoerfassung und persönliches Trainingsziel. Allgemeine
// Gesundheitsdaten sind NICHT premium (NEWBIE erlaubt) — bewusst KEINE dogs.health-
// Capability, damit Gesundheit nicht mit der Läufigkeit gekoppelt/mitgesperrt wird.
// ACTIVE/FOUNDER/TRAINER (und Lifetime) erhalten alle Premium-Capabilities.
export const PREMIUM_CAPABILITIES: Capability[] = [
  'training.analytics', 'ai.feedback',
  'dogs.backpack', 'dogs.heat', 'dogs.commands', 'dogs.goal',
];
// ACTIVE = BASE + PREMIUM (Kompat-Export für Anzeige/Übersicht).
export const ACTIVE_CAPABILITIES: Capability[] = [...BASE_CAPABILITIES, ...PREMIUM_CAPABILITIES];
export const TRAINER_CAPABILITIES: Capability[] = [
  'trainer.dashboard', 'trainer.clients', 'trainer.surveys', 'trainer.comments', 'trainer.plans',
];

export type UserEntitlement =
  | 'lifetime'
  | 'beta_tester'
  | 'ambassador'
  | 'staff';

export interface UserEntitlementRecord {
  id: string;
  userId: string;
  entitlement: UserEntitlement;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  notes?: string | null;
}

export interface RuntimeCapabilities {
  pro_member: boolean;
  trainer_module: boolean;
}

export interface EffectiveCapabilities extends RuntimeCapabilities {
  capabilities: Capability[];
  hasLifetimeAccess: boolean;
  activeEntitlements: UserEntitlement[];
}

export interface EffectiveAccessInput {
  subscription: (SubscriptionLike & { trial_ends_at?: string | null }) | null | undefined;
  subscriptionCapabilities?: RuntimeCapabilities | null;
  entitlements: UserEntitlementRecord[];
}

export const USER_ENTITLEMENTS: UserEntitlement[] = ['lifetime', 'beta_tester', 'ambassador', 'staff'];
export const REGULAR_PRODUCT_CAPABILITIES: Capability[] = [
  ...ACTIVE_CAPABILITIES,
  ...TRAINER_CAPABILITIES,
];

// App-Store / RevenueCat Product-IDs (nur Monatsabos).
export const PRODUCT_IDS = {
  // ID-Suffix _8.00 ist historisch; tatsächlicher Preis = CHF 4.00 (im Store gesetzt).
  founderActiveMonthly: 'anyvo_founder_active_monthly_8.00',
  activeMonthly:        'anyvo_active_monthly_10',
  trainerMonthly:       'anyvo_trainer_monthly_30.00',
} as const;

export const TRIAL_DAYS = 7;

export interface PlanMeta {
  id:        SubscriptionPlan;
  name:      string;
  priceChf:  number | null;   // null = im Trial gratis
  priceLabel:string;
  productId: string | null;   // welches Produkt gekauft wird (Trial = active)
  trainer:   boolean;
}

export const PLAN_META: Record<SubscriptionPlan, PlanMeta> = {
  // WICHTIG: Der Store-/RevenueCat-Preis ist die Quelle der Wahrheit. priceLabel ist
  // bewusst NEUTRAL ('—'): ein veralteter hardcodierter Preis darf nicht irreführend
  // erscheinen, wenn das Store-Paket (noch) nicht geladen ist (generischer Zustand
  // statt falscher Preis). priceChf ist NICHT autoritativ (nur interne Sortierung).
  newbie:         { id: 'newbie',         name: 'Newbie',         priceChf: 0,  priceLabel: 'Gratis', productId: null,                           trainer: false },
  founder_active: { id: 'founder_active', name: 'Founder Active', priceChf: 4,  priceLabel: '—',      productId: PRODUCT_IDS.founderActiveMonthly,  trainer: false },
  active:         { id: 'active',         name: 'Active',         priceChf: 6,  priceLabel: '—',      productId: PRODUCT_IDS.activeMonthly,         trainer: false },
  trainer:        { id: 'trainer',        name: 'Trainer',        priceChf: 15, priceLabel: '—',      productId: PRODUCT_IDS.trainerMonthly,        trainer: true },
};

// Premium = ACTIVE / FOUNDER_ACTIVE / TRAINER. NEWBIE (und unbekannt/null) NICHT.
export function isPremiumPlan(plan: SubscriptionPlan | null | undefined): boolean {
  return plan === 'active' || plan === 'founder_active' || plan === 'trainer';
}

// In-App erlaubte Plan-Wechsel = NUR store-sichere Upgrades. Kündigung und jeder
// Downgrade/Wechsel auf einen günstigeren bezahlten Plan laufen ausschliesslich
// über die Store-Abo-Verwaltung („Abo verwalten"), da Apple/Google das
// programmatisch nicht zulassen. Founder Active ist ein limitiertes Gründer-
// Angebot (FOUNDER_SLOT_LIMIT, einmalig) und NUR aus dem kostenlosen Tier
// erreichbar — bestehende Zahler können nicht in Founder wechseln.
// Erlaubt: Newbie→Active/Trainer/Founder(nur wenn frei), Active→Trainer,
// Founder→Trainer. Alles andere: false.
export function canSwitchPlanInApp(
  current: SubscriptionPlan | null | undefined,
  target: SubscriptionPlan,
  opts: { founderAvailable?: boolean; platform?: string },
): boolean {
  const from: SubscriptionPlan = current ?? 'newbie';   // kein Abo == Gratis/Newbie
  if (target === from) return false;
  // Gratis-Downgrade/Kündigung → Store. Founder Active wird NICHT mehr angeboten
  // (kein Kauf-/Wechselziel), unabhängig von Plattform/Eligibility. Nur Active/Trainer
  // sind öffentliche Kaufziele.
  if (target === 'newbie' || target === 'founder_active') return false;

  if (opts.platform === 'ios') {
    // iOS: die bezahlten Produkte liegen in EINER Apple-Subscription-Group →
    // StoreKit wickelt Upgrade/Downgrade/Crossgrade selbst ab (Active ↔ Trainer).
    return true;
  }

  // Android / Default (bestehend, unverändert): nur store-sichere Upgrades; Downgrades
  // und Crossgrades laufen über die Store-Abo-Verwaltung (kein Doppel-Abo-Risiko).
  switch (target) {
    case 'trainer':
      return from === 'newbie' || from === 'active' || from === 'founder_active';
    case 'active':
      return from === 'newbie';                          // nur Neueinstieg, kein Downgrade
    default:
      return false;
  }
}

// Plan → Runtime-Capabilities (user_capabilities).
// NEWBIE ist das kostenlose Standard-Tier → NICHT pro_member. ACTIVE/FOUNDER = pro,
// TRAINER = pro + trainer_module. FOUNDER_ACTIVE ≡ ACTIVE (keine Sonder-Matrix).
export function planToCapabilities(plan: SubscriptionPlan): { pro_member: boolean; trainer_module: boolean } {
  return { pro_member: isPremiumPlan(plan), trainer_module: plan === 'trainer' };
}

// ── NEWBIE-Quotas (kostenloses Tier) ─────────────────────────
// Serverautoritativ erzwungen (RPC claim_newbie_quota, siehe
// SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql); der Client spiegelt die Limits nur für UX.
export type QuotaKind = 'dog' | 'training' | 'track';

// Max. NEUE Objekte im Zählzeitraum: Hund = 1 (all-time), Training = 1 pro
// Kalendermonat (UTC). Fährte = 0: NEWBIE hat KEINE Fährtenfunktion (Pro-only-Feature),
// daher keine monatliche Fährten-Quota. Premium (ACTIVE/FOUNDER/TRAINER) = unbegrenzt.
export const NEWBIE_QUOTA: Record<QuotaKind, number> = { dog: 1, training: 1, track: 0 };

export function quotaLimit(isPro: boolean, kind: QuotaKind): number {
  return isPro ? Infinity : NEWBIE_QUOTA[kind];
}

// Reine Entscheidung: darf bei aktuellem Zählerstand eine NEUE Aktion beginnen?
// (Bestehende Objekte bleiben immer sichtbar/bearbeitbar — das gaten wir NICHT.)
export function quotaAllowsNew(isPro: boolean, kind: QuotaKind, currentCount: number): boolean {
  return currentCount < quotaLimit(isPro, kind);
}

export interface SubscriptionLike { plan: SubscriptionPlan | null; status: SubscriptionStatus | null }

const STATUS_ACTIVE: SubscriptionStatus[] = ['active', 'trialing'];

// Zentrale Capability-Prüfung. Ohne aktives Abo → keine Capabilities.
// NEWBIE erhält NUR BASE_CAPABILITIES (Anzahl via Quota begrenzt), KEINE Premium-
// Capabilities (Smart Coach/Analyse). ACTIVE/FOUNDER: Base+Premium. TRAINER: alles.
export function hasCapability(sub: SubscriptionLike | null | undefined, capability: Capability): boolean {
  if (!sub?.plan || !sub.status || !STATUS_ACTIVE.includes(sub.status)) return false;
  if (TRAINER_CAPABILITIES.includes(capability)) return sub.plan === 'trainer';
  if (PREMIUM_CAPABILITIES.includes(capability)) return isPremiumPlan(sub.plan); // nicht NEWBIE
  if (BASE_CAPABILITIES.includes(capability))    return true;                    // inkl. NEWBIE
  return false;
}

export function isKnownUserEntitlement(value: string | null | undefined): value is UserEntitlement {
  return USER_ENTITLEMENTS.includes(value as UserEntitlement);
}

export function isActiveUserEntitlement(
  entitlement: Pick<UserEntitlementRecord, 'expiresAt' | 'revokedAt'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!entitlement || entitlement.revokedAt != null) return false;
  if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

export function hasActiveUserEntitlement(
  entitlements: UserEntitlementRecord[],
  entitlement: UserEntitlement,
  now: Date = new Date(),
): boolean {
  return entitlements.some((item) =>
    item.entitlement === entitlement && isActiveUserEntitlement(item, now));
}

function capabilitiesFromRuntime(runtime: RuntimeCapabilities): Capability[] {
  if (runtime.trainer_module) return REGULAR_PRODUCT_CAPABILITIES;
  if (runtime.pro_member) return ACTIVE_CAPABILITIES;
  return [];
}

export function resolveEffectiveCapabilities(
  input: EffectiveAccessInput,
  now: Date = new Date(),
): EffectiveCapabilities {
  const subscriptionActive = !!input.subscription?.plan
    && !!input.subscription.status
    && STATUS_ACTIVE.includes(input.subscription.status)
    && !isTrialLapsed(input.subscription);
  const subscriptionRuntime = input.subscriptionCapabilities
    ?? (subscriptionActive && input.subscription?.plan ? planToCapabilities(input.subscription.plan) : null);

  let pro = subscriptionRuntime?.pro_member === true;
  let trainer = subscriptionRuntime?.trainer_module === true;
  const capabilities = new Set<Capability>();

  if (subscriptionActive && input.subscription) {
    for (const capability of REGULAR_PRODUCT_CAPABILITIES) {
      if (hasCapability(input.subscription, capability)) capabilities.add(capability);
    }
  }
  for (const capability of capabilitiesFromRuntime({ pro_member: pro, trainer_module: trainer })) {
    capabilities.add(capability);
  }

  const activeEntitlements = input.entitlements
    .filter((item) => isActiveUserEntitlement(item, now))
    .map((item) => item.entitlement);
  const hasLifetimeAccess = activeEntitlements.includes('lifetime');

  if (hasLifetimeAccess) {
    pro = true;
    trainer = true;
    for (const capability of REGULAR_PRODUCT_CAPABILITIES) capabilities.add(capability);
  }

  return {
    pro_member: pro,
    trainer_module: trainer,
    capabilities: REGULAR_PRODUCT_CAPABILITIES.filter((capability) => capabilities.has(capability)),
    hasLifetimeAccess,
    activeEntitlements,
  };
}

export function hasEffectiveCapability(
  effective: Pick<EffectiveCapabilities, 'capabilities'> | null | undefined,
  capability: string,
): capability is Capability {
  return REGULAR_PRODUCT_CAPABILITIES.includes(capability as Capability)
    && (effective?.capabilities ?? []).includes(capability as Capability);
}

export function isTrainerPlan(plan: SubscriptionPlan | null | undefined): boolean {
  return plan === 'trainer';
}

// Ein Trial ist „abgelaufen", sobald sein Enddatum vergangen ist — unabhängig
// davon, ob der Status in der DB noch 'trialing' steht (es gibt keinen Server-Job,
// der ihn umschaltet). Zentrale Quelle für Gating & Anzeige: gilt für ALLE Trials.
export function isTrialLapsed(
  sub: { status?: SubscriptionStatus | null; trial_ends_at?: string | null } | null | undefined,
): boolean {
  return !!sub && sub.status === 'trialing' && !!sub.trial_ends_at
    && new Date(sub.trial_ends_at).getTime() < Date.now();
}

// Product-ID → Plan (für Restore / Provider-Bestätigung).
export function planOfProduct(productId: string | null | undefined): SubscriptionPlan {
  if (productId === 'anyvo_newbie_monthly_0') return 'newbie';
  if (productId === PRODUCT_IDS.founderActiveMonthly) return 'founder_active';
  if (productId === PRODUCT_IDS.trainerMonthly) return 'trainer';
  return 'active';
}

// Abwärtskompatibilität (Übergangsphase bis zur Migration):
// Der ALTE DB-Wert 'beginner_trial' wird beim LESEN auf 'newbie' normalisiert.
// Er wird NIE neu gespeichert. Unbekannte Werte → null (defensiv, geloggt ohne
// private Daten). So verliert kein Nutzer wegen eines Altwerts sein Abo.
export function normalizeSubscriptionPlan(raw: string | null | undefined): SubscriptionPlan | null {
  if (raw == null) return null;
  if (raw === 'beginner_trial') return 'newbie';   // Legacy → newbie
  if (raw === 'newbie' || raw === 'active' || raw === 'founder_active' || raw === 'trainer') return raw;
  if (__DEV__) console.warn('[subscription] unbekannter Planwert — defensiv auf null gesetzt');
  return null;
}
