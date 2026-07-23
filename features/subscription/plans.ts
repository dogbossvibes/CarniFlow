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
  | 'trainer.dashboard' | 'trainer.clients' | 'trainer.surveys' | 'trainer.comments' | 'trainer.plans';

export const ACTIVE_CAPABILITIES: Capability[] = [
  'training.create', 'training.analytics', 'dogs.manage', 'ai.feedback', 'calendar.use', 'voice.notes',
];
export const TRAINER_CAPABILITIES: Capability[] = [
  'trainer.dashboard', 'trainer.clients', 'trainer.surveys', 'trainer.comments', 'trainer.plans',
];

// App-Store / RevenueCat Product-IDs (nur Monatsabos).
export const PRODUCT_IDS = {
  newbieMonthly:        'anyvo_newbie_monthly_0',
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
  newbie:         { id: 'newbie',         name: 'Newbie',         priceChf: 0,  priceLabel: 'Gratis',        productId: PRODUCT_IDS.newbieMonthly,         trainer: false },
  founder_active: { id: 'founder_active', name: 'Founder Active', priceChf: 4,  priceLabel: 'CHF 4.00/Mt.',  productId: PRODUCT_IDS.founderActiveMonthly,  trainer: false },
  active:         { id: 'active',         name: 'Active',         priceChf: 6,  priceLabel: 'CHF 6.00/Mt.',  productId: PRODUCT_IDS.activeMonthly,         trainer: false },
  trainer:        { id: 'trainer',        name: 'Trainer',        priceChf: 15, priceLabel: 'CHF 15.00/Mt.', productId: PRODUCT_IDS.trainerMonthly,        trainer: true },
};

// Plan → Runtime-Capabilities (user_capabilities). Alle 4 Pläne sind „pro".
export function planToCapabilities(plan: SubscriptionPlan): { pro_member: boolean; trainer_module: boolean } {
  return { pro_member: true, trainer_module: plan === 'trainer' };
}

export interface SubscriptionLike { plan: SubscriptionPlan | null; status: SubscriptionStatus | null }

const STATUS_ACTIVE: SubscriptionStatus[] = ['active', 'trialing'];

// Zentrale Capability-Prüfung. Ohne aktives Abo → keine Capabilities.
export function hasCapability(sub: SubscriptionLike | null | undefined, capability: Capability): boolean {
  if (!sub?.plan || !sub.status || !STATUS_ACTIVE.includes(sub.status)) return false;
  if (TRAINER_CAPABILITIES.includes(capability)) return sub.plan === 'trainer';
  if (ACTIVE_CAPABILITIES.includes(capability))  return true;   // alle 4 Pläne
  return false;
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
  if (productId === PRODUCT_IDS.newbieMonthly) return 'newbie';
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
