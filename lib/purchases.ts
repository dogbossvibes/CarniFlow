import { Platform } from 'react-native';

// RevenueCat (Apple In-App-Purchase). Nativ → defensiv laden, damit Expo Go /
// ein Build ohne das Modul nicht crasht. Ohne API-Key (RevenueCat-Dashboard)
// bleibt IAP inaktiv und die App zeigt den Trial-Fallback.
let Purchases: any = null;
try { Purchases = require('react-native-purchases').default; } catch { Purchases = null; }
export const PURCHASES_AVAILABLE = Purchases != null;

const IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
export const ENTITLEMENT = 'premium';

let configured = false;

export function configurePurchases(userId?: string) {
  if (!Purchases || configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;                       // nicht konfiguriert → Trial-Fallback
  try {
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  } catch { /* ignore */ }
}

export function purchasesReady(): boolean {
  return PURCHASES_AVAILABLE && configured;
}

export interface PurchasePackage {
  id:          string;
  title:       string;
  priceString: string;       // lokalisierter Apple-Preis
  packageType: string;       // MONTHLY | ANNUAL | LIFETIME | …
  raw:         unknown;
}

export interface EntitlementResult {
  ok:         boolean;
  active:     boolean;
  expiration: string | null;
  error?:     string;
  cancelled?: boolean;
}

function fromInfo(info: any): EntitlementResult {
  const ent = info?.entitlements?.active?.[ENTITLEMENT];
  return { ok: true, active: !!ent, expiration: ent?.expirationDate ?? null };
}

export async function getPackages(): Promise<PurchasePackage[]> {
  if (!purchasesReady()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings.current?.availablePackages ?? [];
    return pkgs.map((p: any) => ({
      id:          p.identifier,
      title:       p.product?.title ?? p.identifier,
      priceString: p.product?.priceString ?? '',
      packageType: p.packageType ?? '',
      raw:         p,
    }));
  } catch { return []; }
}

export async function buyPackage(pkg: PurchasePackage): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, active: false, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
    return fromInfo(customerInfo);
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, active: false, expiration: null, cancelled: true };
    return { ok: false, active: false, expiration: null, error: e?.message ?? 'Kauf fehlgeschlagen' };
  }
}

export async function restorePurchases(): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, active: false, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    const info = await Purchases.restorePurchases();
    return fromInfo(info);
  } catch (e: any) {
    return { ok: false, active: false, expiration: null, error: e?.message ?? 'Wiederherstellen fehlgeschlagen' };
  }
}
