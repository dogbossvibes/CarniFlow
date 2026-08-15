import {
  evaluateActiveTrialEligibility, shouldProactivelyShowOffer,
  storeTrialMatchesTarget, displayTrialDays,
  ACTIVE_TRIAL_MIN_ACCOUNT_AGE_MS, ACTIVE_TRIAL_LATER_COOLDOWN_MS, ACTIVE_TRIAL_MAX_OFFERS,
  type ActiveTrialEligibilityInput,
} from '@/features/subscription/activeTrial';

const H = 60 * 60 * 1000;

// Basis = ein qualifizierter NEWBIE: 1 Training, Account 25 h alt, kein Store-Zugang,
// Trial nicht gestartet, Store-Angebot verfügbar.
const base: ActiveTrialEligibilityInput = {
  effectivePlan: 'newbie',
  isPro: false,
  isTrainer: false,
  hasLifetime: false,
  completedTrainingCount: 1,
  accountAgeMs: 25 * H,
  trialAlreadyStarted: false,
  storeOfferAvailable: true,
};
const ev = (over: Partial<ActiveTrialEligibilityInput> = {}) => evaluateActiveTrialEligibility({ ...base, ...over });

describe('evaluateActiveTrialEligibility — NEWBIE', () => {
  it('0 Trainings → kein Trial', () => {
    expect(ev({ completedTrainingCount: 0 })).toEqual({ eligible: false, reason: 'no_completed_training' });
  });
  it('1 Training, Account < 24 h → kein Trial', () => {
    expect(ev({ accountAgeMs: 23 * H })).toEqual({ eligible: false, reason: 'account_too_new' });
    expect(ev({ accountAgeMs: ACTIVE_TRIAL_MIN_ACCOUNT_AGE_MS - 1 }).eligible).toBe(false);
  });
  it('1 Training, Account ≥ 24 h → eligible (wenn Store verfügbar)', () => {
    expect(ev()).toEqual({ eligible: true, reason: null });
    expect(ev({ accountAgeMs: ACTIVE_TRIAL_MIN_ACCOUNT_AGE_MS })).toEqual({ eligible: true, reason: null });
  });
  it('Store nicht eligible → kein falsches Trial-Versprechen', () => {
    expect(ev({ storeOfferAvailable: false })).toEqual({ eligible: false, reason: 'store_offer_unavailable' });
  });
  it('effectivePlan null (kein Abo-Datensatz) wird als Newbie behandelt → eligible', () => {
    expect(ev({ effectivePlan: null }).eligible).toBe(true);
  });
});

describe('evaluateActiveTrialEligibility — kein Trial-Angebot für bezahlte/lebenslange Tiers', () => {
  it('ACTIVE → kein Trial', () => {
    expect(ev({ effectivePlan: 'active', isPro: true }).reason).toBe('already_has_store_access');
  });
  it('FOUNDER ACTIVE → kein Trial', () => {
    expect(ev({ effectivePlan: 'founder_active', isPro: true }).reason).toBe('already_has_store_access');
  });
  it('TRAINER → kein Trial', () => {
    expect(ev({ effectivePlan: 'trainer', isPro: true, isTrainer: true }).reason).toBe('already_has_store_access');
  });
  it('LIFETIME → kein Trial (Entitlement respektiert)', () => {
    expect(ev({ hasLifetime: true, isPro: true }).reason).toBe('has_lifetime');
  });
  it('nicht-newbie Plan ohne isPro-Flag → not_newbie', () => {
    expect(ev({ effectivePlan: 'active', isPro: false }).reason).toBe('not_newbie');
  });
});

describe('evaluateActiveTrialEligibility — Trial bereits gestartet / Wiederholung', () => {
  it('Trial bereits gestartet (serverseitig) → kein zweites Angebot', () => {
    expect(ev({ trialAlreadyStarted: true }).reason).toBe('trial_already_started');
  });
  it('Reihenfolge: bezahlter Zugang schlägt „bereits gestartet"', () => {
    expect(ev({ trialAlreadyStarted: true, isPro: true }).reason).toBe('already_has_store_access');
  });
});

describe('shouldProactivelyShowOffer — „Später"/Cooldown/Frequency-Capping', () => {
  const now = 1_000_000_000_000;
  it('erstes Mal (count 0, nie gezeigt) → zeigen', () => {
    expect(shouldProactivelyShowOffer({ eligible: true, offerCount: 0, lastOfferedAtMs: null, nowMs: now })).toBe(true);
  });
  it('nicht eligible → nie zeigen', () => {
    expect(shouldProactivelyShowOffer({ eligible: false, offerCount: 0, lastOfferedAtMs: null, nowMs: now })).toBe(false);
  });
  it('innerhalb Cooldown nach „Später" → nicht zeigen', () => {
    expect(shouldProactivelyShowOffer({ eligible: true, offerCount: 1, lastOfferedAtMs: now - (ACTIVE_TRIAL_LATER_COOLDOWN_MS - H), nowMs: now })).toBe(false);
  });
  it('nach Cooldown → wieder zeigen', () => {
    expect(shouldProactivelyShowOffer({ eligible: true, offerCount: 1, lastOfferedAtMs: now - (ACTIVE_TRIAL_LATER_COOLDOWN_MS + H), nowMs: now })).toBe(true);
  });
  it('max. Anzahl proaktiver Angebote erreicht → nicht mehr zeigen', () => {
    expect(shouldProactivelyShowOffer({ eligible: true, offerCount: ACTIVE_TRIAL_MAX_OFFERS, lastOfferedAtMs: now - 10 * ACTIVE_TRIAL_LATER_COOLDOWN_MS, nowMs: now })).toBe(false);
  });
});

describe('Store-Trial-Dauer/Preis', () => {
  it('Store liefert exakt 3 Tage → matcht Zielangebot', () => {
    expect(storeTrialMatchesTarget({ freeTrialDays: 3 })).toBe(true);
  });
  it('Store liefert andere Dauer → matcht NICHT (keine falsche „3 Tage"-Anzeige)', () => {
    expect(storeTrialMatchesTarget({ freeTrialDays: 4 })).toBe(false);
    expect(storeTrialMatchesTarget({ freeTrialDays: 7 })).toBe(false);
  });
  it('Anzeige-Dauer nutzt Store-Wert, sonst Ziel-Fallback', () => {
    expect(displayTrialDays({ freeTrialDays: 4 })).toBe(4);
    expect(displayTrialDays({ freeTrialDays: null })).toBe(3);
    expect(displayTrialDays(null)).toBe(3);
  });
});
