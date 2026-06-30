// ANYVO Subscription V2 — Pläne, Product-IDs, Capabilities.
// Founder Active ist ein EIGENER Plan (kein Rabatt). „Active"-Funktionen = pro_member,
// „Trainer"-Funktionen = trainer_module. Der Plan steuert user_capabilities.

export type SubscriptionPlan = 'beginner_trial' | 'founder_active' | 'active' | 'trainer';
export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'cancelled' | 'past_due';

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
  beginner_trial: { id: 'beginner_trial', name: 'Beginner',       priceChf: null, priceLabel: '7 Tage gratis', productId: PRODUCT_IDS.activeMonthly,        trainer: false },
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

// Product-ID → Plan (für Restore / Provider-Bestätigung).
export function planOfProduct(productId: string | null | undefined): SubscriptionPlan {
  if (productId === PRODUCT_IDS.founderActiveMonthly) return 'founder_active';
  if (productId === PRODUCT_IDS.trainerMonthly) return 'trainer';
  return 'active';
}
