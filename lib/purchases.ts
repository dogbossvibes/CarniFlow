import { Platform } from 'react-native';

// RevenueCat (Apple/Google In-App-Purchase). Nativ → defensiv laden, damit Expo
// Go / ein Build ohne das Modul nicht crasht. Ohne API-Key bleibt IAP inaktiv
// und die App zeigt den Trial-Fallback.
let Purchases: any = null;
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
  expiration: string | null;
  error?:     string;
  cancelled?: boolean;
}

function fromInfo(info: any): EntitlementResult {
  const active = info?.entitlements?.active ?? {};
  if (active[ENTITLEMENTS.trainer]) return { ok: true, tier: 'trainer', expiration: active[ENTITLEMENTS.trainer].expirationDate ?? null };
  if (active[ENTITLEMENTS.pro])     return { ok: true, tier: 'pro',     expiration: active[ENTITLEMENTS.pro].expirationDate ?? null };
  return { ok: true, tier: null, expiration: null };
}

function tierOf(productId: string): Tier {
  return /trainer/i.test(productId) ? 'trainer' : 'pro';
}

export async function getPackages(): Promise<PurchasePackage[]> {
  if (!purchasesReady()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings.current?.availablePackages ?? [];
    return pkgs.map((p: any) => {
      const productId = p.product?.identifier ?? p.identifier;
      return {
        id:          p.identifier,
        title:       p.product?.title ?? p.identifier,
        priceString: p.product?.priceString ?? '',
        packageType: p.packageType ?? '',
        productId,
        tier:        tierOf(productId),
        raw:         p,
      };
    });
  } catch { return []; }
}

export async function buyPackage(pkg: PurchasePackage): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, tier: null, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
    return fromInfo(customerInfo);
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, tier: null, expiration: null, cancelled: true };
    return { ok: false, tier: null, expiration: null, error: e?.message ?? 'Kauf fehlgeschlagen' };
  }
}

export async function restorePurchases(): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, tier: null, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    return fromInfo(await Purchases.restorePurchases());
  } catch (e: any) {
    return { ok: false, tier: null, expiration: null, error: e?.message ?? 'Wiederherstellen fehlgeschlagen' };
  }
}
