import { iso8601PeriodToDays, unitCountToDays, coarsePeriodLabel, freeTrialDaysFromProduct } from '@/lib/purchases';

// Reine Parser für die Store-Trial-Dauer/-Periode (RevenueCat = Quelle der Wahrheit).

describe('iso8601PeriodToDays', () => {
  it('P4D → 4, P1W → 7, P1M → 30, P1Y → 365', () => {
    expect(iso8601PeriodToDays('P4D')).toBe(4);
    expect(iso8601PeriodToDays('P1W')).toBe(7);
    expect(iso8601PeriodToDays('P1M')).toBe(30);
    expect(iso8601PeriodToDays('P1Y')).toBe(365);
  });
  it('ungültig/leer → null', () => {
    expect(iso8601PeriodToDays('')).toBeNull();
    expect(iso8601PeriodToDays(null)).toBeNull();
    expect(iso8601PeriodToDays('4 Tage')).toBeNull();
  });
});

describe('unitCountToDays (RevenueCat periodUnit)', () => {
  it('DAY×4 → 4, WEEK×1 → 7, MONTH×1 → 30', () => {
    expect(unitCountToDays('DAY', 4)).toBe(4);
    expect(unitCountToDays('WEEK', 1)).toBe(7);
    expect(unitCountToDays('MONTH', 1)).toBe(30);
  });
  it('fehlend → null', () => {
    expect(unitCountToDays(null, 4)).toBeNull();
    expect(unitCountToDays('DAY', 0)).toBeNull();
  });
});

describe('coarsePeriodLabel', () => {
  it('P1M → month, P1W → week, P1Y → year, P4D → day', () => {
    expect(coarsePeriodLabel('P1M')).toBe('month');
    expect(coarsePeriodLabel('P1W')).toBe('week');
    expect(coarsePeriodLabel('P1Y')).toBe('year');
    expect(coarsePeriodLabel('P4D')).toBe('day');
  });
});

describe('freeTrialDaysFromProduct', () => {
  it('iOS introPrice (price 0, DAY×4) → 4', () => {
    expect(freeTrialDaysFromProduct({ introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 4 } })).toBe(4);
  });
  it('iOS introPrice mit ISO-Periode → Tage', () => {
    expect(freeTrialDaysFromProduct({ introPrice: { price: 0, period: 'P4D' } })).toBe(4);
  });
  it('Android defaultOption.freePhase.billingPeriod.iso8601 P4D → 4', () => {
    expect(freeTrialDaysFromProduct({ defaultOption: { freePhase: { billingPeriod: { iso8601: 'P4D' } } } })).toBe(4);
  });
  it('Android subscriptionOptions freePhase → Tage', () => {
    expect(freeTrialDaysFromProduct({ subscriptionOptions: [{ freePhase: { billingPeriod: { iso8601: 'P1W' } } }] })).toBe(7);
  });
  it('kein Free-Trial konfiguriert → null (kein falsches Versprechen)', () => {
    expect(freeTrialDaysFromProduct({ introPrice: { price: 5, periodUnit: 'DAY', periodNumberOfUnits: 4 } })).toBeNull();
    expect(freeTrialDaysFromProduct({})).toBeNull();
    expect(freeTrialDaysFromProduct(null)).toBeNull();
  });
});
