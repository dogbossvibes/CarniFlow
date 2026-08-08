import { canSwitchPlanInApp } from '@/features/subscription/plans';

// In-App erlaubte Wechsel = NUR store-sichere Upgrades. Founder ist limitiert und
// nur aus Gratis erreichbar. Downgrades/Kündigung laufen über „Abo verwalten".
const AVAIL = { founderAvailable: true };
const SOLD_OUT = { founderAvailable: false };

describe('canSwitchPlanInApp — Wechselmatrix', () => {
  it('Gratis/Newbie → Active/Trainer erlaubt', () => {
    expect(canSwitchPlanInApp('newbie', 'active', AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('newbie', 'trainer', AVAIL)).toBe(true);
  });

  it('kein Abo (null) verhält sich wie Newbie', () => {
    expect(canSwitchPlanInApp(null, 'active', AVAIL)).toBe(true);
    expect(canSwitchPlanInApp(null, 'trainer', AVAIL)).toBe(true);
  });

  it('Newbie → Founder nur wenn Founder verfügbar', () => {
    expect(canSwitchPlanInApp('newbie', 'founder_active', AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('newbie', 'founder_active', SOLD_OUT)).toBe(false);
  });

  it('Active → Trainer erlaubt (Upgrade)', () => {
    expect(canSwitchPlanInApp('active', 'trainer', AVAIL)).toBe(true);
  });

  it('Founder Active → Trainer erlaubt (Upgrade)', () => {
    expect(canSwitchPlanInApp('founder_active', 'trainer', AVAIL)).toBe(true);
  });

  it('bezahlte Zahler dürfen NICHT in Founder wechseln (limitiertes Angebot)', () => {
    expect(canSwitchPlanInApp('active', 'founder_active', AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('trainer', 'founder_active', AVAIL)).toBe(false);
  });

  it('Founder → Active ist ein gesperrter Downgrade (nur über Store)', () => {
    expect(canSwitchPlanInApp('founder_active', 'active', AVAIL)).toBe(false);
  });

  it('Trainer → Active/Founder gesperrt (Downgrade → Store)', () => {
    expect(canSwitchPlanInApp('trainer', 'active', AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('trainer', 'founder_active', AVAIL)).toBe(false);
  });

  it('gleicher Plan ist kein Wechsel', () => {
    expect(canSwitchPlanInApp('active', 'active', AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('trainer', 'trainer', AVAIL)).toBe(false);
  });

  it('Newbie ist nie ein Kaufziel (Downgrade auf Gratis → Store)', () => {
    expect(canSwitchPlanInApp('active', 'newbie', AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('trainer', 'newbie', AVAIL)).toBe(false);
  });
});
