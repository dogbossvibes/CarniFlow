// @ts-nocheck — jest-Globals (describe/it/expect) sind erst mit Test-Runner typisiert.
// Tests für das Subscription-/Capability-Modell.
// HINWEIS: Im Projekt ist (noch) kein Test-Runner konfiguriert. Diese Datei ist
// jest-kompatibel geschrieben und läuft, sobald z. B. jest-expo eingerichtet ist
// (npx expo install jest-expo jest @types/jest + "test": "jest").
import {
  hasCapability, planToCapabilities, isTrainerPlan, planOfProduct,
  ACTIVE_CAPABILITIES, TRAINER_CAPABILITIES, PRODUCT_IDS,
  type SubscriptionPlan,
} from '@/features/subscription/plans';

const sub = (plan: SubscriptionPlan | null, status: any = 'active') => ({ plan, status });

describe('hasCapability', () => {
  it('Beginner Trial: Active-Rechte ja, Trainer-Rechte nein', () => {
    for (const c of ACTIVE_CAPABILITIES)  expect(hasCapability(sub('beginner_trial', 'trialing'), c)).toBe(true);
    for (const c of TRAINER_CAPABILITIES) expect(hasCapability(sub('beginner_trial', 'trialing'), c)).toBe(false);
  });

  it('Founder Active: keine Trainerrechte', () => {
    expect(hasCapability(sub('founder_active'), 'training.create')).toBe(true);
    expect(hasCapability(sub('founder_active'), 'trainer.dashboard')).toBe(false);
    expect(hasCapability(sub('founder_active'), 'trainer.clients')).toBe(false);
  });

  it('Active: keine Trainerrechte', () => {
    expect(hasCapability(sub('active'), 'ai.feedback')).toBe(true);
    expect(hasCapability(sub('active'), 'trainer.plans')).toBe(false);
  });

  it('Trainer: alle Rechte', () => {
    for (const c of [...ACTIVE_CAPABILITIES, ...TRAINER_CAPABILITIES]) {
      expect(hasCapability(sub('trainer'), c)).toBe(true);
    }
  });

  it('Ohne aktives Abo: keine Rechte', () => {
    expect(hasCapability(null, 'training.create')).toBe(false);
    expect(hasCapability(sub('active', 'expired'), 'training.create')).toBe(false);
    expect(hasCapability(sub('active', 'cancelled'), 'training.create')).toBe(false);
  });
});

describe('planToCapabilities', () => {
  it('nur Trainer setzt trainer_module', () => {
    expect(planToCapabilities('beginner_trial')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('founder_active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('trainer')).toEqual({ pro_member: true, trainer_module: true });
  });
});

describe('planOfProduct / isTrainerPlan', () => {
  it('mappt Product-IDs auf Pläne', () => {
    expect(planOfProduct(PRODUCT_IDS.founderActiveMonthly)).toBe('founder_active');
    expect(planOfProduct(PRODUCT_IDS.activeMonthly)).toBe('active');
    expect(planOfProduct(PRODUCT_IDS.trainerMonthly)).toBe('trainer');
  });
  it('isTrainerPlan nur für trainer', () => {
    expect(isTrainerPlan('trainer')).toBe(true);
    expect(isTrainerPlan('founder_active')).toBe(false);
    expect(isTrainerPlan(null)).toBe(false);
  });
});

// Hinweis Founder-Limit (77) + Founder→Trainer-Upgrade:
// - Das 77er-Limit wird serverseitig in der RPC claim_founder_slot erzwungen
//   (pg_advisory_xact_lock + count < 77). Der 78. Claim liefert success=false.
// - Founder→Trainer: activatePlan('trainer') setzt trainer_module=true und den
//   Trainer-Preis (Product anyvo_trainer_monthly_2990); der Founder-Slot bleibt
//   bestehen, der Plan wechselt aber auf 'trainer'.
