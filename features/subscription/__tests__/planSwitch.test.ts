import { canSwitchPlanInApp } from '@/features/subscription/plans';

// Android/Default: In-App nur store-sichere Upgrades; Founder limitiert, nur aus Gratis.
// iOS: alle drei bezahlten Produkte in EINER Subscription-Group → StoreKit regelt
// Up-/Down-/Crossgrade; Founder zusätzlich nur bei Eligibility.
const AVAIL = { founderAvailable: true };
const SOLD_OUT = { founderAvailable: false };
const IOS_AVAIL = { founderAvailable: true, platform: 'ios' };
const IOS_SOLD_OUT = { founderAvailable: false, platform: 'ios' };

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

describe('canSwitchPlanInApp — iOS (eine Subscription-Group)', () => {
  it('Newbie → Active/Trainer/Founder(elig.) erlaubt', () => {
    expect(canSwitchPlanInApp('newbie', 'active', IOS_AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('newbie', 'trainer', IOS_AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('newbie', 'founder_active', IOS_AVAIL)).toBe(true);
  });

  it('Active → Trainer und Active → Founder(elig.) erlaubt', () => {
    expect(canSwitchPlanInApp('active', 'trainer', IOS_AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('active', 'founder_active', IOS_AVAIL)).toBe(true);
  });

  it('Founder → Active und Founder → Trainer erlaubt (Down-/Crossgrade via StoreKit)', () => {
    expect(canSwitchPlanInApp('founder_active', 'active', IOS_AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('founder_active', 'trainer', IOS_AVAIL)).toBe(true);
  });

  it('Trainer → Active erlaubt (Downgrade via StoreKit)', () => {
    expect(canSwitchPlanInApp('trainer', 'active', IOS_AVAIL)).toBe(true);
  });

  it('Trainer → Founder nur bei Eligibility', () => {
    expect(canSwitchPlanInApp('trainer', 'founder_active', IOS_AVAIL)).toBe(true);
    expect(canSwitchPlanInApp('trainer', 'founder_active', IOS_SOLD_OUT)).toBe(false);
  });

  it('aktueller Plan ist nie kaufbar; Downgrade auf Gratis → Store', () => {
    expect(canSwitchPlanInApp('trainer', 'trainer', IOS_AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('active', 'active', IOS_AVAIL)).toBe(false);
    expect(canSwitchPlanInApp('trainer', 'newbie', IOS_AVAIL)).toBe(false);
  });
});

describe('canSwitchPlanInApp — Android bleibt konservativ (Regression)', () => {
  it('Android: Trainer → Active bleibt blockiert (Downgrade → Store)', () => {
    expect(canSwitchPlanInApp('trainer', 'active', { founderAvailable: true, platform: 'android' })).toBe(false);
  });
  it('Android: Active → Founder bleibt blockiert', () => {
    expect(canSwitchPlanInApp('active', 'founder_active', { founderAvailable: true, platform: 'android' })).toBe(false);
  });
  it('Android: Active → Trainer bleibt erlaubt (Upgrade)', () => {
    expect(canSwitchPlanInApp('active', 'trainer', { founderAvailable: true, platform: 'android' })).toBe(true);
  });
});
