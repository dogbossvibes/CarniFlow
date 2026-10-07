import { matchesStoreProduct, planOfProduct, PLAN_META, PRODUCT_IDS } from '@/features/subscription/plans';
import { hasStorePackageForProduct, fromCustomerInfo, type PurchasePackage } from '@/lib/purchases';

const active = 'anyvo_active_monthly_10:anyvo-active-monthly-400';
const trainer = 'anyvo_trainer_monthly_30.00:anyvo-trainer-monthly-3000';

describe('Google Play subscription and base plan identifiers', () => {
  it.each([[active, PRODUCT_IDS.activeMonthly, 'active'], [trainer, PRODUCT_IDS.trainerMonthly, 'trainer']])(
    'recognizes %s in paywall and restore', (id, expected, plan) => {
      const pkg = { productId: id, priceString: 'CHF 6.00', raw: { product: { identifier: id } } } as PurchasePackage;
      expect(matchesStoreProduct(id, expected)).toBe(true);
      expect(hasStorePackageForProduct([pkg], expected)).toBe(true);
      expect(planOfProduct(id)).toBe(plan);
      expect(fromCustomerInfo({ activeSubscriptions: [id] }).plan).toBe(plan);
      expect(pkg.productId).toBe(id);
      expect(pkg.raw).toEqual({ product: { identifier: id } });
    },
  );
  it('preserves exact Apple identifiers and rejects unrelated products', () => {
    expect(matchesStoreProduct(PRODUCT_IDS.activeMonthly, PRODUCT_IDS.activeMonthly)).toBe(true);
    expect(matchesStoreProduct(trainer, PRODUCT_IDS.activeMonthly)).toBe(false);
    expect(matchesStoreProduct(`${PRODUCT_IDS.activeMonthly}_other:monthly`, PRODUCT_IDS.activeMonthly)).toBe(false);
    expect(matchesStoreProduct(`${PRODUCT_IDS.activeMonthly}:`, PRODUCT_IDS.activeMonthly)).toBe(false);
    expect(matchesStoreProduct(null, PRODUCT_IDS.activeMonthly)).toBe(false);
    expect(fromCustomerInfo({ activeSubscriptions: ['unknown:monthly'] }).plan).toBeNull();
  });
  it('does not display a hardcoded paid price when the store is unavailable', () => {
    expect(PLAN_META.active.priceLabel).toBe('—');
    expect(PLAN_META.trainer.priceLabel).toBe('—');
  });
});
