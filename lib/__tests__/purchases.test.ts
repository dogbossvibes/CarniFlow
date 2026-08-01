import {
  fromCustomerInfo,
  restorePlanFromResult,
  type EntitlementResult,
} from '@/lib/purchases';

const info = (ids: string[], activeProducts: string[] = [], purchasedProducts = activeProducts) => ({
  entitlements: {
    active: Object.fromEntries(ids.map(id => [id, { expirationDate: `${id}-expires` }])),
  },
  activeSubscriptions: activeProducts,
  allPurchasedProductIdentifiers: purchasedProducts,
});

describe('RevenueCat restore mapping', () => {
  it('mappt pro auf active', () => {
    expect(fromCustomerInfo(info(['pro'])).plan).toBe('active');
  });

  it('mappt trainer auf trainer', () => {
    expect(fromCustomerInfo(info(['trainer'])).plan).toBe('trainer');
  });

  it('mappt Active-Produkt-ID auf active', () => {
    expect(fromCustomerInfo(info([], ['anyvo_active_monthly_10'])).plan).toBe('active');
  });

  it('mappt Founder-Produkt-ID auf founder_active', () => {
    expect(fromCustomerInfo(info([], ['anyvo_founder_active_monthly_8.00'])).plan).toBe('founder_active');
  });

  it('mappt Trainer-Produkt-ID auf trainer', () => {
    expect(fromCustomerInfo(info([], ['anyvo_trainer_monthly_30.00'])).plan).toBe('trainer');
  });

  it('liest Product-IDs auch aus allPurchasedProductIdentifiers', () => {
    expect(fromCustomerInfo({
      entitlements: { active: {} },
      activeSubscriptions: [],
      allPurchasedProductIdentifiers: ['anyvo_founder_active_monthly_8.00'],
    }).plan).toBe('founder_active');
  });

  it('Trainer gewinnt bei mehreren Entitlements', () => {
    expect(fromCustomerInfo(info(['active', 'trainer', 'founder_active'])).plan).toBe('trainer');
  });

  it('aktive Entitlements gewinnen vor historischen gekauften Product-IDs', () => {
    expect(fromCustomerInfo(info(['active'], [], ['anyvo_trainer_monthly_30.00'])).plan).toBe('active');
    expect(fromCustomerInfo(info(['founder_active'], [], ['anyvo_trainer_monthly_30.00'])).plan).toBe('founder_active');
  });

  it('activeSubscriptions gewinnen vor historischen gekauften Product-IDs', () => {
    expect(fromCustomerInfo(info([], ['anyvo_active_monthly_10'], ['anyvo_trainer_monthly_30.00'])).plan).toBe('active');
    expect(fromCustomerInfo(info([], ['anyvo_founder_active_monthly_8.00'], ['anyvo_trainer_monthly_30.00'])).plan).toBe('founder_active');
  });

  it('Founder gewinnt vor Active', () => {
    expect(fromCustomerInfo(info(['active', 'founder'])).plan).toBe('founder_active');
  });

  it('ignoriert unbekannte Identifier', () => {
    expect(fromCustomerInfo(info(['unknown_entitlement'], ['unknown_product'])).plan).toBeNull();
  });

  it('gibt NEWBIE-ID niemals Premium', () => {
    expect(fromCustomerInfo(info(['newbie'], ['anyvo_newbie_monthly_0'])).plan).toBeNull();
  });

  it('liefert Restore-Plan fuer activatePlan direkt aus CustomerInfo-Mapping', () => {
    const result = fromCustomerInfo(info(['anyvo_founder_active_monthly_8.00']));
    expect(restorePlanFromResult(result, null)).toBe('founder_active');
  });

  it('behält Legacy-Fallback fuer alte pro/trainer Results', () => {
    const legacyPro: EntitlementResult = { ok: true, tier: 'pro', plan: null, expiration: null };
    const legacyTrainer: EntitlementResult = { ok: true, tier: 'trainer', plan: null, expiration: null };
    expect(restorePlanFromResult(legacyPro, 'founder_active')).toBe('founder_active');
    expect(restorePlanFromResult(legacyPro, null)).toBe('active');
    expect(restorePlanFromResult(legacyTrainer, null)).toBe('trainer');
  });
});
