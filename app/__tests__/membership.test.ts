import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';

const membership = readFileSync('app/membership.tsx', 'utf8');
const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');

describe('Membership-Seite — Reuse & Guardrails', () => {
  it('verwendet bestehende Kauf-/Restore-/Quota-Logik (keine neue Abo-Architektur)', () => {
    expect(membership).toMatch(/from '@\/lib\/purchases'/);
    expect(membership).toMatch(/getPackages/);
    expect(membership).toMatch(/restorePurchases/);
    expect(membership).toMatch(/newbieQuotaStatus/);
    expect(membership).toMatch(/getPlanSubscription/);
  });
  it('Upgrade nutzt die bestehende Paywall /premium', () => {
    expect(membership).toMatch(/router\.push\('\/premium'\)/);
  });
  it('sicheres Back-Pattern (canGoBack + Fallback /(tabs)/profile)', () => {
    expect(membership).toMatch(/router\.canGoBack\(\)/);
    expect(membership).toMatch(/\/\(tabs\)\/profile/);
  });
  it('erwähnt „Lifetime" nirgends als sichtbaren Text', () => {
    expect(membership).not.toMatch(/["']Lifetime["']/);
    expect(membership).not.toMatch(/premium\.lifetime|lifetimeActive|lifetimeTrainerActive/);
  });
  it('behandelt Newbie nicht als Kaufprodukt (kein anyvo_newbie_monthly_0)', () => {
    expect(membership).not.toMatch(/anyvo_newbie_monthly_0/);
  });
  it('„Dauerhaft freigeschaltet" nur bei hasLifetimeAccess, NICHT allein bei isPro', () => {
    expect(membership).toMatch(/hasLifetimeAccess \? 'permanent'/);
    expect(membership).not.toMatch(/isPro \|\| hasLifetimeAccess/);
    expect(membership).not.toMatch(/isPro \? 'permanent'/);
  });
  it('Founder im Vergleich nur bei freien Slots ODER wenn Nutzer Founder ist', () => {
    expect(membership).toMatch(/slots\.remaining > 0 \|\| visiblePlan === 'founder_active'/);
    expect(membership).toMatch(/show: founderAvailable/);
  });
  it('verwendet anyvologo + ANYVO-Tokens (C.*), keine Fremdfarben', () => {
    expect(membership).toMatch(/anyvologo\.png/);
    expect(membership).toMatch(/from '@\/constants\/colors'/);
  });
});

describe('Profil — Mitgliedschafts-Row', () => {
  it('navigiert zur Membership-Seite', () => {
    expect(profile).toMatch(/router\.push\('\/membership'\)/);
  });
  it('zeigt kein LIFETIME-Badge / keinen premium.lifetime-Text mehr', () => {
    expect(profile).not.toMatch(/'LIFETIME'/);
    expect(profile).not.toMatch(/premium\.lifetime/);
  });
  it('„Dauerhaft freigeschaltet" nur bei access.isLifetime, nicht bei isPro', () => {
    expect(profile).toMatch(/access\.isLifetime\s*\?\s*t\('membership\.permanentAccess'\)/);
    expect(profile).not.toMatch(/isPro\s*\?\s*t\('membership\.permanentAccess'\)/);
  });
});

describe('Membership i18n (de-CH)', () => {
  const keys = Object.keys(deCH).filter(k => k.startsWith('membership.'));
  it('enthält die geforderten Kern-Keys', () => {
    for (const k of [
      'membership.title', 'membership.subtitle', 'membership.currentPlan',
      'membership.free', 'membership.active', 'membership.founder', 'membership.trainer',
      'membership.usage', 'membership.trainingUsage', 'membership.dogUsage',
      'membership.benefits', 'membership.compare', 'membership.upgradeActive',
      'membership.manage', 'membership.restore', 'membership.permanentAccess',
      'membership.limitReached', 'membership.trainingAvailable',
    ]) {
      expect(keys).toContain(k);
    }
  });
  it('kein membership-Wert enthält das Wort „Lifetime"', () => {
    for (const k of keys) {
      expect(String((deCH as Record<string, string>)[k]).toLowerCase()).not.toContain('lifetime');
    }
  });
  it('NEWBIE-Definition: allgemeine Gesundheit erlaubt, Läufigkeit als eigenes (Premium-)Feature', () => {
    expect(keys).toContain('membership.benefit.generalHealth');
    expect(keys).toContain('membership.benefit.heat');
    // getrennte Keys → Gesundheit ist NICHT mit Läufigkeit gekoppelt
    expect((deCH as Record<string, string>)['membership.benefit.generalHealth'])
      .not.toEqual((deCH as Record<string, string>)['membership.benefit.heat']);
  });
});
