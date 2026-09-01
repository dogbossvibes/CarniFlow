// NEWBIE ist dauerhaft kostenlos (CHF 0), kein Trial, kein Ablaufdatum. Diese Suite
// belegt: (1) isTrialLapsed lässt NEWBIE nie „ablaufen" — auch nicht mit einem
// Alt-Datensatz aus der Zeit, als NEWBIE fälschlich mit status='trialing' +
// trial_ends_at aktiviert wurde; (2) NEWBIE behält dadurch immer seine
// BASE_CAPABILITIES; (3) der 3-Tage-ACTIVE-Trial (activeTrial.ts, c210008) ist ein
// komplett getrennter, unverändert gebliebener Store-Mechanismus.
import {
  BASE_CAPABILITIES,
  isTrialLapsed,
  hasEffectiveCapability,
  resolveEffectiveCapabilities,
  PREMIUM_CAPABILITIES,
  type UserEntitlementRecord,
} from '@/features/subscription/plans';
import { ACTIVE_TRIAL_TARGET_DAYS } from '@/features/subscription/activeTrial';

const now = new Date('2026-09-01T12:00:00.000Z');
const PAST = '2020-01-01T00:00:00.000Z';   // weit in der Vergangenheit — jeder alte Trial wäre „abgelaufen"

describe('isTrialLapsed — NEWBIE kann nie ablaufen', () => {
  it('ist false für NEWBIE mit trialing-Status + abgelaufenem Alt-Datum', () => {
    expect(isTrialLapsed({ plan: 'newbie', status: 'trialing', trial_ends_at: PAST })).toBe(false);
  });

  it('ist false für NEWBIE ganz ohne trial_ends_at (Neuaktivierung nach dem Fix)', () => {
    expect(isTrialLapsed({ plan: 'newbie', status: 'active', trial_ends_at: null })).toBe(false);
  });

  it('ist false für NEWBIE unabhängig vom Status', () => {
    expect(isTrialLapsed({ plan: 'newbie', status: 'active', trial_ends_at: PAST })).toBe(false);
    expect(isTrialLapsed({ plan: 'newbie', status: 'cancelled', trial_ends_at: PAST })).toBe(false);
  });

  it('bleibt für ANDERE Pläne mit echtem abgelaufenem Trial unverändert aktiv (kein Blanket-Fix)', () => {
    expect(isTrialLapsed({ plan: 'active', status: 'trialing', trial_ends_at: PAST })).toBe(true);
  });

  it('ein NICHT abgelaufener Trial eines anderen Plans bleibt unverändert nicht abgelaufen', () => {
    expect(isTrialLapsed({ plan: 'active', status: 'trialing', trial_ends_at: '2099-01-01T00:00:00.000Z' })).toBe(false);
  });
});

describe('resolveEffectiveCapabilities — NEWBIE bleibt nach einem alten trial_ends_at effektiv NEWBIE', () => {
  it('behält BASE_CAPABILITIES trotz Alt-Datensatz status=trialing + abgelaufenem trial_ends_at', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'trialing', trial_ends_at: PAST },
      entitlements: [],
    }, now);
    expect(effective.pro_member).toBe(false);
    expect(effective.trainer_module).toBe(false);
    for (const capability of BASE_CAPABILITIES) {
      expect(hasEffectiveCapability(effective, capability)).toBe(true);
    }
    for (const capability of PREMIUM_CAPABILITIES) {
      expect(hasEffectiveCapability(effective, capability)).toBe(false);
    }
  });

  it('behält BASE_CAPABILITIES für eine frische NEWBIE-Aktivierung (status=active, kein Trial mehr)', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'active', trial_ends_at: null },
      entitlements: [],
    }, now);
    expect(hasEffectiveCapability(effective, 'training.create')).toBe(true);
    expect(hasEffectiveCapability(effective, 'dogs.manage')).toBe(true);
    expect(hasEffectiveCapability(effective, 'calendar.use')).toBe(true);
    expect(hasEffectiveCapability(effective, 'voice.notes')).toBe(true);
  });

  it('ein echt abgelaufener Trial bei ACTIVE entzieht weiterhin alle Capabilities (Gating bleibt für andere Pläne scharf)', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'active', status: 'trialing', trial_ends_at: PAST },
      entitlements: [],
    }, now);
    expect(effective.pro_member).toBe(false);
    for (const capability of BASE_CAPABILITIES) {
      expect(hasEffectiveCapability(effective, capability)).toBe(false);
    }
  });

  it('Lifetime schaltet NEWBIE weiterhin vollständig frei (unverändert)', () => {
    const lifetime: UserEntitlementRecord = {
      id: 'ent-1', userId: 'user-1', entitlement: 'lifetime',
      grantedAt: '2026-08-01T00:00:00.000Z', expiresAt: null, revokedAt: null,
    };
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'active', trial_ends_at: null },
      entitlements: [lifetime],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(effective.hasLifetimeAccess).toBe(true);
  });
});

describe('ACTIVE-3-Tage-Trial-Funnel bleibt strikt getrennt (c210008, activeTrial.ts unverändert)', () => {
  it('die Zieldauer ist weiterhin 3 Tage, unabhängig von der NEWBIE-Trial-Entfernung', () => {
    expect(ACTIVE_TRIAL_TARGET_DAYS).toBe(3);
  });

  it('nutzt eigene, additive subscriptions.active_trial_*-Felder statt status/trial_ends_at', () => {
    // Dieser Fix ändert ausschliesslich, wie NEWBIE status/trial_ends_at nutzt.
    // Der ACTIVE-Trial verwendet dafür separate Spalten (active_trial_started_at
    // etc., siehe services/activeTrialService.ts) und ist davon nicht betroffen.
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'active', status: 'active', trial_ends_at: null },
      entitlements: [],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(isTrialLapsed({ plan: 'active', status: 'active', trial_ends_at: null })).toBe(false);
  });
});
