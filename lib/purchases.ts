import { Platform } from 'react-native';
import type { SubscriptionPlan } from '@/features/subscription/plans';

// RevenueCat (Apple/Google In-App-Purchase). Nativ → defensiv laden, damit Expo
// Go / ein Build ohne das Modul nicht crasht. Ohne API-Key bleibt IAP inaktiv
// und die App zeigt den Trial-Fallback.
let Purchases: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { Purchases = require('react-native-purchases').default; } catch { Purchases = null; }
export const PURCHASES_AVAILABLE = Purchases != null;

const IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

// Zwei Stufen: Pro und Trainer. Das Trainer-Abo enthält die Pro-Funktionen —
// Entitlement-Namen müssen im RevenueCat-Dashboard so heissen.
// Produkte: anyvo_active_monthly_10 (CHF 10) / anyvo_founder_active_monthly_8.00
// (CHF 8) / anyvo_trainer_monthly_30.00 (CHF 30). IDs siehe features/subscription/plans.ts.
export const ENTITLEMENTS = { pro: 'pro', trainer: 'trainer' } as const;
export type Tier = 'pro' | 'trainer';
export type RestorablePlan = Exclude<SubscriptionPlan, 'newbie'>;

let configured = false;

export function configurePurchases(userId?: string) {
  if (!Purchases || configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;
  try { Purchases.configure({ apiKey, appUserID: userId }); configured = true; } catch { /* ignore */ }
}

export function purchasesReady(): boolean {
  return PURCHASES_AVAILABLE && configured;
}

export interface PurchasePackage {
  id:          string;
  offeringId:  string;
  title:       string;
  priceString: string;       // lokalisierter Store-Preis
  packageType: string;
  productId:   string;
  tier:        Tier;         // aus Produkt-ID abgeleitet
  raw:         unknown;
}

export interface EntitlementResult {
  ok:         boolean;
  tier:       Tier | null;   // höchste aktive Stufe
  plan:       RestorablePlan | null;
  expiration: string | null;
  error?:     string;
  cancelled?: boolean;
}

export function hasStorePackageForProduct(packages: PurchasePackage[], productId: string | null | undefined): boolean {
  return !!productId && packages.some(p => p.productId === productId);
}

const TRAINER_IDS = new Set(['trainer', 'anyvo_trainer_monthly_30.00']);
const FOUNDER_IDS = new Set(['founder', 'founder_active', 'anyvo_founder_active_monthly_8.00']);
const ACTIVE_IDS = new Set(['pro', 'active', 'anyvo_active_monthly_10']);
const NEWBIE_IDS = new Set(['newbie', 'anyvo_newbie_monthly_0']);

function rankIdentifier(id: string | null | undefined): RestorablePlan | null {
  if (!id) return null;
  if (NEWBIE_IDS.has(id)) return null;
  if (TRAINER_IDS.has(id)) return 'trainer';
  if (FOUNDER_IDS.has(id)) return 'founder_active';
  if (ACTIVE_IDS.has(id)) return 'active';
  return null;
}

function betterPlan(a: RestorablePlan | null, b: RestorablePlan | null): RestorablePlan | null {
  const rank = (p: RestorablePlan | null) => p === 'trainer' ? 3 : p === 'founder_active' ? 2 : p === 'active' ? 1 : 0;
  return rank(b) > rank(a) ? b : a;
}

function expirationForPlan(info: any, plan: RestorablePlan | null): string | null {
  if (!plan) return null;
  const active = info?.entitlements?.active ?? {};
  for (const [identifier, entitlement] of Object.entries(active)) {
    if (rankIdentifier(identifier) === plan) return (entitlement as any)?.expirationDate ?? null;
  }
  return null;
}

export function planFromCustomerInfo(info: any): RestorablePlan | null {
  const active = info?.entitlements?.active ?? {};

  let entitlementPlan: RestorablePlan | null = null;
  for (const identifier of Object.keys(active)) {
    entitlementPlan = betterPlan(entitlementPlan, rankIdentifier(identifier));
  }
  if (entitlementPlan) return entitlementPlan;

  let activeSubscriptionPlan: RestorablePlan | null = null;
  for (const identifier of info?.activeSubscriptions ?? []) {
    activeSubscriptionPlan = betterPlan(activeSubscriptionPlan, rankIdentifier(identifier));
  }
  if (activeSubscriptionPlan) return activeSubscriptionPlan;

  let legacyPurchasedPlan: RestorablePlan | null = null;
  for (const identifier of info?.allPurchasedProductIdentifiers ?? []) {
    legacyPurchasedPlan = betterPlan(legacyPurchasedPlan, rankIdentifier(identifier));
  }

  return legacyPurchasedPlan;
}

export function restorePlanFromResult(result: EntitlementResult, currentPlan: SubscriptionPlan | null): RestorablePlan | null {
  if (result.plan) return result.plan;
  if (result.tier === 'trainer') return 'trainer';
  if (result.tier === 'pro') return currentPlan === 'founder_active' ? 'founder_active' : 'active';
  return null;
}

export function fromCustomerInfo(info: any): EntitlementResult {
  const plan = planFromCustomerInfo(info);
  const tier: Tier | null = plan === 'trainer' ? 'trainer' : plan ? 'pro' : null;
  return { ok: true, tier, plan, expiration: expirationForPlan(info, plan) };
}

function fromInfo(info: any): EntitlementResult {
  return fromCustomerInfo(info);
}

function tierOf(productId: string): Tier {
  return /trainer/i.test(productId) ? 'trainer' : 'pro';
}

export async function getPackages(): Promise<PurchasePackage[]> {
  if (!purchasesReady()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const offeringId = offerings.current?.identifier ?? '';
    const pkgs = offerings.current?.availablePackages ?? [];
    return pkgs.map((p: any) => {
      const productId = p.product?.identifier ?? p.identifier;
      return {
        id:          p.identifier,
        offeringId,
        title:       p.product?.title ?? p.identifier,
        priceString: p.product?.priceString ?? '',
        packageType: p.packageType ?? '',
        productId,
        tier:        tierOf(productId),
        raw:         p,
      };
    });
  } catch (e: any) {
    if (__DEV__) {
      console.warn('[RevenueCat] getOfferings failed', {
        platform: Platform.OS,
        code: e?.code ?? null,
        message: e?.message ?? null,
      });
    }
    return [];
  }
}

export async function buyPackage(pkg: PurchasePackage): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, tier: null, plan: null, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
    return fromInfo(customerInfo);
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, tier: null, plan: null, expiration: null, cancelled: true };
    if (__DEV__) {
      console.warn('[RevenueCat] purchase failed', {
        platform: Platform.OS,
        packageIdentifier: pkg.id,
        offeringId: pkg.offeringId,
        storeProductIdentifier: pkg.productId,
        code: e?.code ?? null,
        message: e?.message ?? null,
      });
    }
    return { ok: false, tier: null, plan: null, expiration: null, error: e?.message ?? 'Kauf fehlgeschlagen' };
  }
}

export async function restorePurchases(): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, tier: null, plan: null, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    return fromInfo(await Purchases.restorePurchases());
  } catch (e: any) {
    return { ok: false, tier: null, plan: null, expiration: null, error: e?.message ?? 'Wiederherstellen fehlgeschlagen' };
  }
}
