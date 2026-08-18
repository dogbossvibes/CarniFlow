import {
  hasCapability, runtimeGrantsCapability, resolveEffectiveCapabilities,
  PREMIUM_CAPABILITIES, BASE_CAPABILITIES,
  type SubscriptionLike, type Capability,
} from '@/features/subscription/plans';

const sub = (plan: SubscriptionLike['plan'], status: SubscriptionLike['status'] = 'active'): SubscriptionLike => ({ plan, status });
const WEIGHT: Capability = 'dogs.weightHistory';
const DEWORM: Capability = 'dogs.dewormingSchedule';

// Finale HEALTH-Trennung: weiterführende Funktionen premium, Basiswerte frei.

describe('Health-Capabilities sind premium-only (weiterführende Funktionen)', () => {
  it('beide neuen Capabilities sind als PREMIUM registriert (nicht BASE)', () => {
    expect(PREMIUM_CAPABILITIES).toEqual(expect.arrayContaining([WEIGHT, DEWORM]));
    expect(BASE_CAPABILITIES).not.toContain(WEIGHT);
    expect(BASE_CAPABILITIES).not.toContain(DEWORM);
  });

  it('NEWBIE: KEIN Gewichtsverlauf, KEIN Entwurmungsrhythmus', () => {
    expect(hasCapability(sub('newbie', 'trialing'), WEIGHT)).toBe(false);
    expect(hasCapability(sub('newbie', 'trialing'), DEWORM)).toBe(false);
  });

  it('NEWBIE behält Basis-Health: es gibt bewusst KEINE dogs.health-Capability (Basiswerte ungegated)', () => {
    // Basiswerte (allgemeine Gesundheit, aktuelles Gewicht, letzte Entwurmung) laufen
    // NICHT über eine Capability → keine „dogs.health"-Sperre. dogs.manage bleibt Basis.
    expect(BASE_CAPABILITIES).toContain('dogs.manage');
    expect(hasCapability(sub('newbie', 'trialing'), 'dogs.manage')).toBe(true);
  });

  it('ACTIVE / FOUNDER ACTIVE / TRAINER: beide Capabilities + Läufigkeit', () => {
    for (const plan of ['active', 'founder_active', 'trainer'] as const) {
      expect(hasCapability(sub(plan), WEIGHT)).toBe(true);
      expect(hasCapability(sub(plan), DEWORM)).toBe(true);
      expect(hasCapability(sub(plan), 'dogs.heat')).toBe(true);   // Läufigkeit unverändert premium
    }
  });
});

describe('runtimeGrantsCapability — granular pro Bereich (keine pauschale isPro-Sperre)', () => {
  it('NEWBIE-Flags → false', () => {
    expect(runtimeGrantsCapability({ pro_member: false, trainer_module: false }, WEIGHT)).toBe(false);
    expect(runtimeGrantsCapability({ pro_member: false, trainer_module: false }, DEWORM)).toBe(false);
  });
  it('pro_member → beide true', () => {
    expect(runtimeGrantsCapability({ pro_member: true, trainer_module: false }, WEIGHT)).toBe(true);
    expect(runtimeGrantsCapability({ pro_member: true, trainer_module: false }, DEWORM)).toBe(true);
  });
  it('trainer → beide true', () => {
    expect(runtimeGrantsCapability({ pro_member: true, trainer_module: true }, WEIGHT)).toBe(true);
  });
  it('null runtime → false', () => {
    expect(runtimeGrantsCapability(null, WEIGHT)).toBe(false);
  });
});

describe('Upgrade/Downgrade — Capability toggelt, Daten bleiben (nur Kapazität ändert sich)', () => {
  const entitlements: never[] = [];

  it('LIFETIME (Entitlement) schaltet beide frei — unabhängig vom Abo', () => {
    const eff = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'trialing', trial_ends_at: null },
      subscriptionCapabilities: { pro_member: false, trainer_module: false },
      entitlements: [{ id: 'e', userId: 'u', entitlement: 'lifetime', grantedAt: '2026-01-01', expiresAt: null, revokedAt: null }],
    });
    expect(eff.capabilities).toEqual(expect.arrayContaining([WEIGHT, DEWORM]));
  });

  it('Upgrade newbie→active: Capabilities erscheinen', () => {
    const eff = resolveEffectiveCapabilities({
      subscription: { plan: 'active', status: 'active', trial_ends_at: null },
      subscriptionCapabilities: { pro_member: true, trainer_module: false },
      entitlements,
    });
    expect(eff.capabilities).toEqual(expect.arrayContaining([WEIGHT, DEWORM]));
  });

  it('Downgrade active→newbie: Capabilities verschwinden (Datenlöschung ist NICHT Teil davon)', () => {
    const eff = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'trialing', trial_ends_at: null },
      subscriptionCapabilities: { pro_member: false, trainer_module: false },
      entitlements,
    });
    expect(eff.capabilities).not.toContain(WEIGHT);
    expect(eff.capabilities).not.toContain(DEWORM);
    // resolveEffectiveCapabilities ist rein (liest nur) → berührt keine gespeicherten Daten.
  });
});
