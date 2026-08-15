// ANYVO — ACTIVE 3-Tage-Store-Trial: reine, testbare Eligibility- & Anzeige-Logik.
//
// WICHTIG: Die tatsächliche kostenlose Testphase läuft über Apple App Store /
// Google Play + die bestehende RevenueCat-Architektur (Introductory Offer).
// Diese Datei baut KEINEN eigenen Trial-Timer und KEINE zweite Subscription-
// Architektur — sie prüft nur die ANYVO-INTERNEN Vorbedingungen, wer den
// Store-Trial überhaupt angeboten bekommen darf. Store/RevenueCat bleiben die
// Quelle der Wahrheit für die reale Trial-Verfügbarkeit und -Abrechnung.

import type { SubscriptionPlan } from '@/features/subscription/plans';

// Ziel-Trialdauer (iOS + Android einheitlich 3 Tage; von Apple unterstützt, Google ≥ 3).
// NUR Fallback/Referenz — die tatsächliche Dauer kommt aus dem Store (siehe displayTrialDays).
export const ACTIVE_TRIAL_TARGET_DAYS = 3;
export const ACTIVE_TRIAL_MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;       // 24 h
export const ACTIVE_TRIAL_MIN_COMPLETED_TRAININGS = 1;

// Frequency-Capping nach „Später": nicht bei jedem App-Start, sondern frühestens
// nach dieser Zeit erneut proaktiv anbieten; danach max. N proaktive Angebote.
export const ACTIVE_TRIAL_LATER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;    // 3 Tage
export const ACTIVE_TRIAL_MAX_OFFERS = 3;

// Analytics-Events (bestehende/leichte Seam — KEINE zweite Analytics-Lösung).
export const ACTIVE_TRIAL_EVENTS = {
  eligible:        'active_trial_eligible',
  offerShown:      'active_trial_offer_shown',
  later:           'active_trial_later',
  started:         'active_trial_started',
  purchaseFailed:  'active_trial_purchase_failed',
  converted:       'active_trial_converted',
} as const;
export type ActiveTrialEvent = (typeof ACTIVE_TRIAL_EVENTS)[keyof typeof ACTIVE_TRIAL_EVENTS];

export type ActiveTrialIneligibleReason =
  | 'has_lifetime'
  | 'already_has_store_access'   // ACTIVE / FOUNDER ACTIVE / TRAINER aktiv
  | 'not_newbie'
  | 'trial_already_started'      // serverseitig: active_trial_started_at gesetzt
  | 'no_completed_training'
  | 'account_too_new'
  | 'store_offer_unavailable';   // RevenueCat/Store: Angebot nicht verfügbar/kaufbar

export interface ActiveTrialEligibilityInput {
  /** Effektiver Plan aus useCapabilities (null = kein Abo-Datensatz = Newbie/Gratis). */
  effectivePlan: SubscriptionPlan | null;
  /** pro_member (ACTIVE/FOUNDER/TRAINER oder Lifetime) — voller Produktzugriff. */
  isPro: boolean;
  isTrainer: boolean;
  hasLifetime: boolean;
  completedTrainingCount: number;
  accountAgeMs: number;
  /** Serverseitiger Status: dieser Nutzer hat den ACTIVE-Trial bereits gestartet. */
  trialAlreadyStarted: boolean;
  /** RevenueCat/Store bestätigt: Trial-Angebot verfügbar UND für diesen Kunden kaufbar. */
  storeOfferAvailable: boolean;
}

export interface ActiveTrialEligibility {
  eligible: boolean;
  reason: ActiveTrialIneligibleReason | null;
}

function no(reason: ActiveTrialIneligibleReason): ActiveTrialEligibility {
  return { eligible: false, reason };
}

// Alle Bedingungen aus dem Spec (Abschnitt 3). Reihenfolge: harte Zugangs-
// Ausschlüsse zuerst, dann ANYVO-Vorbedingungen, zuletzt die Store-Bestätigung.
export function evaluateActiveTrialEligibility(i: ActiveTrialEligibilityInput): ActiveTrialEligibility {
  if (i.hasLifetime) return no('has_lifetime');
  if (i.isTrainer) return no('already_has_store_access');
  if (i.isPro) return no('already_has_store_access');               // ACTIVE/FOUNDER/TRAINER
  if (i.effectivePlan != null && i.effectivePlan !== 'newbie') return no('not_newbie');
  if (i.trialAlreadyStarted) return no('trial_already_started');
  if (i.completedTrainingCount < ACTIVE_TRIAL_MIN_COMPLETED_TRAININGS) return no('no_completed_training');
  if (i.accountAgeMs < ACTIVE_TRIAL_MIN_ACCOUNT_AGE_MS) return no('account_too_new');
  if (!i.storeOfferAvailable) return no('store_offer_unavailable');  // Store = Source of Truth
  return { eligible: true, reason: null };
}

// „Soll das Angebot JETZT proaktiv gezeigt werden?" — Frequency-Capping/Cooldown
// nach „Später". Der erste Zeitpunkt (nach dem ersten Training) hat offerCount 0
// und lastOfferedAtMs null → wird gezeigt.
export interface ActiveTrialDisplayInput {
  eligible: boolean;
  offerCount: number;                 // wie oft schon proaktiv angeboten
  lastOfferedAtMs: number | null;
  nowMs: number;
}
export function shouldProactivelyShowOffer(i: ActiveTrialDisplayInput): boolean {
  if (!i.eligible) return false;
  if (i.offerCount >= ACTIVE_TRIAL_MAX_OFFERS) return false;
  if (i.lastOfferedAtMs != null && i.nowMs - i.lastOfferedAtMs < ACTIVE_TRIAL_LATER_COOLDOWN_MS) return false;
  return true;
}

// Store-Trial-Angebot (Rohdaten aus RevenueCat, siehe lib/purchases.ts).
export interface StoreTrialOffer {
  available: boolean;
  productId: string | null;
  priceString: string | null;        // lokalisierter Store-Preis, z. B. „CHF 6.00"
  period: string | null;             // Abrechnungsperiode, z. B. 'month'
  freeTrialDays: number | null;      // TATSÄCHLICHE vom Store gelieferte Trial-Dauer
}

// Stimmt die reale Store-Trial-Dauer mit der beworbenen (3 Tage) überein?
// Falls nicht, darf die UI KEINE falsche „3 Tage" anzeigen (Spec Abschnitt 7) —
// gezeigt wird immer die vom Store gelieferte Dauer.
export function storeTrialMatchesTarget(offer: Pick<StoreTrialOffer, 'freeTrialDays'>): boolean {
  return offer.freeTrialDays === ACTIVE_TRIAL_TARGET_DAYS;
}

// Anzuzeigende Trial-Dauer: die vom Store gelieferte Dauer hat Vorrang; nur wenn
// der Store (noch) keine Dauer liefert, wird die Zieldauer als Fallback genutzt.
export function displayTrialDays(offer: Pick<StoreTrialOffer, 'freeTrialDays'> | null): number {
  return offer?.freeTrialDays ?? ACTIVE_TRIAL_TARGET_DAYS;
}
