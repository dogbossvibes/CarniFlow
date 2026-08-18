// Tests für das Subscription-/Capability-Modell (jest-expo, `npm test`).
import { readFileSync } from 'fs';
import {
  hasCapability, planToCapabilities, isTrainerPlan, planOfProduct, isPremiumPlan,
  ACTIVE_CAPABILITIES, BASE_CAPABILITIES, PREMIUM_CAPABILITIES, TRAINER_CAPABILITIES,
  PRODUCT_IDS, FOUNDER_SLOT_LIMIT, NEWBIE_QUOTA, quotaLimit, quotaAllowsNew,
  resolveEffectiveCapabilities,
  type SubscriptionPlan, type Capability,
} from '@/features/subscription/plans';

const sub = (plan: SubscriptionPlan | null, status: any = 'active') => ({ plan, status });

describe('hasCapability', () => {
  it('NEWBIE: Base-Rechte ja, Premium (Smart Coach/Analyse) + Trainer NEIN', () => {
    for (const c of BASE_CAPABILITIES)    expect(hasCapability(sub('newbie', 'trialing'), c)).toBe(true);
    for (const c of PREMIUM_CAPABILITIES) expect(hasCapability(sub('newbie', 'trialing'), c)).toBe(false);
    for (const c of TRAINER_CAPABILITIES) expect(hasCapability(sub('newbie', 'trialing'), c)).toBe(false);
  });

  it('Founder Active: alle Active-Rechte (inkl. Smart Coach), keine Trainerrechte', () => {
    expect(hasCapability(sub('founder_active'), 'training.create')).toBe(true);
    expect(hasCapability(sub('founder_active'), 'ai.feedback')).toBe(true);
    expect(hasCapability(sub('founder_active'), 'trainer.dashboard')).toBe(false);
    expect(hasCapability(sub('founder_active'), 'trainer.clients')).toBe(false);
  });

  it('Active: Smart Coach ja, keine Trainerrechte', () => {
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
  it('NEWBIE ist NICHT pro; nur Trainer setzt trainer_module', () => {
    expect(planToCapabilities('newbie')).toEqual({ pro_member: false, trainer_module: false });
    expect(planToCapabilities('founder_active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('trainer')).toEqual({ pro_member: true, trainer_module: true });
  });
  it('isPremiumPlan: nur active/founder_active/trainer', () => {
    expect(isPremiumPlan('newbie')).toBe(false);
    expect(isPremiumPlan(null)).toBe(false);
    expect(isPremiumPlan('active')).toBe(true);
    expect(isPremiumPlan('founder_active')).toBe(true);
    expect(isPremiumPlan('trainer')).toBe(true);
  });
});

describe('FOUNDER_ACTIVE ≡ ACTIVE (keine Sonder-Feature-Matrix)', () => {
  it('identische Capabilities wie ACTIVE', () => {
    expect(planToCapabilities('founder_active')).toEqual(planToCapabilities('active'));
    for (const c of [...ACTIVE_CAPABILITIES, ...TRAINER_CAPABILITIES]) {
      expect(hasCapability(sub('founder_active'), c)).toBe(hasCapability(sub('active'), c));
    }
  });
});

describe('NEWBIE-Quotas (reine Entscheidung)', () => {
  it('Limits: 1 Hund, 2 Trainings/Monat, 0 Fährten (Pro-only)', () => {
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 0 });
  });
  it('Hund: 1. erlaubt, 2. blockiert', () => {
    expect(quotaAllowsNew(false, 'dog', 0)).toBe(true);
    expect(quotaAllowsNew(false, 'dog', 1)).toBe(false);
  });
  it('Training: 1. + 2. erlaubt, 3. blockiert (2/Monat)', () => {
    expect(quotaAllowsNew(false, 'training', 0)).toBe(true);   // 1. Training
    expect(quotaAllowsNew(false, 'training', 1)).toBe(true);   // 2. Training
    expect(quotaAllowsNew(false, 'training', 2)).toBe(false);  // 3. → blockiert
  });
  it('Fährte: NEWBIE hat keine Fährtenfunktion → nie erlaubt', () => {
    expect(quotaLimit(false, 'track')).toBe(0);
    expect(quotaAllowsNew(false, 'track', 0)).toBe(false);
    expect(quotaAllowsNew(false, 'track', 1)).toBe(false);
  });
  it('Premium: unbegrenzt', () => {
    expect(quotaLimit(true, 'dog')).toBe(Infinity);
    expect(quotaAllowsNew(true, 'training', 999)).toBe(true);
    expect(quotaAllowsNew(true, 'track', 999)).toBe(true);
  });
});

describe('NEWBIE finale Produktdefinition — Feature-Locks (Premium-only)', () => {
  // Backpack, Gesundheit, Kommandoerfassung, persönliches Ziel + Smart Analyse.
  const FEATURE_LOCKS: Capability[] = [
    'dogs.backpack', 'dogs.heat', 'dogs.commands', 'dogs.goal',
    'training.analytics', 'ai.feedback',
  ];
  it('NEWBIE: alle Feature-Locks + Trainer gesperrt', () => {
    for (const c of FEATURE_LOCKS) expect(hasCapability(sub('newbie', 'trialing'), c)).toBe(false);
    for (const c of TRAINER_CAPABILITIES) expect(hasCapability(sub('newbie', 'trialing'), c)).toBe(false);
  });
  it('ACTIVE + FOUNDER: alle Feature-Locks freigeschaltet', () => {
    for (const c of FEATURE_LOCKS) {
      expect(hasCapability(sub('active'), c)).toBe(true);
      expect(hasCapability(sub('founder_active'), c)).toBe(true);
    }
  });
  it('TRAINER: Feature-Locks + Trainerrechte', () => {
    for (const c of [...FEATURE_LOCKS, ...TRAINER_CAPABILITIES]) {
      expect(hasCapability(sub('trainer'), c)).toBe(true);
    }
  });
  it('serverseitige Sonderrechte (Lifetime): Feature-Locks freigeschaltet', () => {
    const eff = resolveEffectiveCapabilities({
      subscription: null,
      entitlements: [{
        id: 'e1', userId: 'u1', entitlement: 'lifetime',
        grantedAt: '2026-01-01T00:00:00Z', expiresAt: null, revokedAt: null,
      }],
    });
    expect(eff.pro_member).toBe(true);
    for (const c of FEATURE_LOCKS) expect(eff.capabilities).toContain(c);
  });
});

describe('NEWBIE Gesundheit erlaubt, Läufigkeit (Heat) gesperrt', () => {
  it('Läufigkeit ist premium (dogs.heat), allgemeine Gesundheit NICHT gekoppelt', () => {
    expect(PREMIUM_CAPABILITIES).toContain('dogs.heat');
    // Es gibt bewusst keine dogs.health-Capability (Gesundheit ist für NEWBIE erlaubt).
    expect(PREMIUM_CAPABILITIES as readonly string[]).not.toContain('dogs.health');
    expect(BASE_CAPABILITIES as readonly string[]).not.toContain('dogs.health');
  });
  it('dogs.heat: NEWBIE gesperrt, ACTIVE/FOUNDER/TRAINER erlaubt', () => {
    expect(hasCapability(sub('newbie', 'trialing'), 'dogs.heat')).toBe(false);
    expect(hasCapability(sub('active'), 'dogs.heat')).toBe(true);
    expect(hasCapability(sub('founder_active'), 'dogs.heat')).toBe(true);
    expect(hasCapability(sub('trainer'), 'dogs.heat')).toBe(true);
  });
  it('dog-health-Screen: Basis bleibt ohne Redirect, Premium-Bereiche sind granular gegatet', () => {
    const src = readFileSync('app/dog-health/[id].tsx', 'utf8');
    expect(src).not.toMatch(/router\.replace\('\/premium'/);
    expect(src).toContain('useCapabilities');
    expect(src).toContain("can('dogs.weightHistory')");
    expect(src).toContain("can('dogs.dewormingSchedule')");
    expect(src).toContain('PremiumInlineUpsell');
  });
  it('dog-heat-Screen: Premium-Redirect vorhanden (Läufigkeit gesperrt)', () => {
    const src = readFileSync('app/dog-heat/[id].tsx', 'utf8');
    expect(src).toMatch(/router\.replace\('\/premium'/);
  });
});

describe('Founder 11 JEMALS — FOUNDER_SLOT_LIFECYCLE_SETUP.sql', () => {
  const sql = readFileSync('FOUNDER_SLOT_LIFECYCLE_SETUP.sql', 'utf8').toLowerCase();
  it('gibt Slots NICHT frei (kein DELETE auf founder_slots)', () => {
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?founder_slots/);
  });
  it('Ablauf markiert status=lapsed statt zu löschen', () => {
    expect(sql).toMatch(/lapse_founder_slot/);
    expect(sql).toMatch(/status\s*=\s*'lapsed'/);
  });
  it('Claim zählt historisch (count(*) from founder_slots) gegen founder_slot_limit', () => {
    expect(sql).toMatch(/count\(\*\)\s+into\s+v_count\s+from\s+founder_slots/);
    expect(sql).toMatch(/founder_slot_limit\(\)/);
  });
  it('race-sicher via advisory lock; eigener Slot reaktivierbar (restore)', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/restore_founder_slot/);
  });
  it('härtet claimed_at auf Default now() und NOT NULL ohne stille Datenkorrektur', () => {
    expect(sql).toMatch(/claimed_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/alter column claimed_at set default now\(\)/);
    expect(sql).toMatch(/where claimed_at is null/);
    expect(sql).toMatch(/raise exception/);
    expect(sql).toMatch(/alter column claimed_at set not null/);
  });
});

describe('RevenueCat-Webhook — Legacy-NEWBIE erzeugt kein pro_member', () => {
  const src = readFileSync('supabase/functions/_shared/revenuecat-webhook.ts', 'utf8');
  it('planOfProduct erkennt newbie (Legacy-Free-Produkt)', () => {
    expect(src).toMatch(/newbie/);
    expect(src).toMatch(/_monthly_0/);
  });
  it('newbie ⇒ pro_member = false (pro = plan !== newbie)', () => {
    expect(src).toMatch(/plan !== 'newbie'/);
  });
  it('Expiration gibt Founder-Slot NICHT frei (lapse statt Delete)', () => {
    expect(src).toMatch(/lapse_founder_slot/);
    expect(src).not.toMatch(/delete\(\).*founder/);
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

// Hinweis Founder-Limit (11) + Founder→Trainer-Upgrade:
// - Das Limit (FOUNDER_SLOT_LIMIT, aktuell 11) wird AUTORITATIV serverseitig in der
//   RPC claim_founder_slot erzwungen (pg_advisory_xact_lock + count < founder_slot_limit()).
//   Der (limit+1)-te Claim liefert success=false. Bestehende Founder behalten ihren Slot.
// - Founder→Trainer: activatePlan('trainer') setzt trainer_module=true und den
//   Trainer-Preis (Product anyvo_trainer_monthly_2990); der Founder-Slot bleibt
//   bestehen, der Plan wechselt aber auf 'trainer'.

describe('Founder-Limit', () => {
  it('FOUNDER_SLOT_LIMIT ist 11 (Client-Spiegel des Server-Limits)', () => {
    expect(FOUNDER_SLOT_LIMIT).toBe(11);
  });
});
