import { Platform } from 'react-native';
import { PRODUCT_IDS, type SubscriptionPlan } from '@/features/subscription/plans';
import type { StoreTrialOffer } from '@/features/subscription/activeTrial';

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
let configuredUserId: string | null = null;   // welcher User zuletzt konfiguriert/eingeloggt

function purchasesApiKey(): string {
  return Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
}

// Idempotente Initialisierung. Erstkonfiguration genau EINMAL; bei bereits
// konfiguriertem SDK + anderem User → RC-logIn (kein Re-configure). Wirft nie.
export function configurePurchases(userId?: string) {
  if (!Purchases) return;
  const apiKey = purchasesApiKey();
  if (!apiKey) return;
  try {
    if (!configured) {
      // DEBUG-Log-Level nur in Dev (loggt keine Secrets).
      if (__DEV__) { try { Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG); } catch { /* ignore */ } }
      Purchases.configure({ apiKey, appUserID: userId });
      configured = true;
      configuredUserId = userId ?? null;
    } else if (userId && userId !== configuredUserId) {
      // Bereits konfiguriert, aber neuer/anderer User → sauberer RC-User-Switch.
      void Purchases.logIn(userId);
      configuredUserId = userId;
    }
  } catch { /* ignore */ }
}

// Garantiert (idempotent), dass RevenueCat vor jedem Store-Zugriff konfiguriert ist.
// Der NATIVE Status (`isConfigured`) hat Vorrang vor dem lokalen JS-Flag. Wirft nie;
// liefert false, wenn kein Key vorhanden ist (dann kann/darf configure nicht laufen).
export async function ensurePurchasesConfigured(userId?: string): Promise<boolean> {
  if (!Purchases || !purchasesApiKey()) return false;
  try {
    if (await Purchases.isConfigured()) {
      configured = true;
      if (userId && userId !== configuredUserId) {
        try { await Purchases.logIn(userId); configuredUserId = userId; } catch { /* ignore */ }
      }
      return true;
    }
  } catch { /* isConfigured evtl. nicht verfügbar → lokal weiter */ }
  configurePurchases(userId);
  return configured;
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
    // Defensiv: [] zurückgeben, damit die App nie am Offering-Fehler crasht.
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

// Google-Play-Wechselmodus für Upgrades: Wechsel wirkt sofort, die verbleibende
// Zeit wird anteilig gutgeschrieben (RC-Standard für Upgrades). Der Wert ist der
// String-Enum-Wert von STORE_REPLACEMENT_MODE (react-native-purchases 10.x) und
// wird 1:1 an die native SDK übergeben. Nur für Android relevant.
export const ANDROID_UPGRADE_REPLACEMENT_MODE = 'WITH_TIME_PRORATION' as const;

export interface AndroidProductChange {
  oldProductIdentifier: string;
  replacementMode: typeof ANDROID_UPGRADE_REPLACEMENT_MODE;
}

// Baut die Android-Product-Change-Info für einen Abo-Wechsel. NUR auf Android und
// NUR wenn ein alter Produkt-Identifier vorliegt → sonst null (Neukauf oder iOS,
// wo StoreKit den Wechsel über die Subscription-Group regelt). Rein, testbar.
export function buildAndroidChangeInfo(
  platform: string,
  oldProductIdentifier: string | null | undefined,
): AndroidProductChange | null {
  if (platform !== 'android' || !oldProductIdentifier) return null;
  return { oldProductIdentifier, replacementMode: ANDROID_UPGRADE_REPLACEMENT_MODE };
}

// Aktuell aktives Store-Abo-Produkt (für Android-Product-Change als
// oldProductIdentifier). Quelle: CustomerInfo.activeSubscriptions; bevorzugt ein
// bekanntes ANYVO-Produkt, sonst das erste aktive Abo. Wirft nie; null wenn IAP
// nicht bereit ist oder kein aktives Abo besteht.
export async function getActiveStoreProductId(): Promise<string | null> {
  if (!purchasesReady()) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const subs: string[] = info?.activeSubscriptions ?? [];
    return subs.find(id => rankIdentifier(id) !== null) ?? subs[0] ?? null;
  } catch {
    return null;
  }
}

export async function buyPackage(
  pkg: PurchasePackage,
  opts?: { oldProductIdentifier?: string | null },
): Promise<EntitlementResult> {
  if (!Purchases) return { ok: false, tier: null, plan: null, expiration: null, error: 'IAP nicht verfügbar' };
  try {
    // Android-Wechsel eines bestehenden Abos: alten Produkt-Identifier + Upgrade-
    // Modus übergeben → echter Subscription-Wechsel statt zweitem parallelem Abo.
    // iOS/Neukauf: change === null → unveränderter Standard-Kaufaufruf.
    const change = buildAndroidChangeInfo(Platform.OS, opts?.oldProductIdentifier);
    const { customerInfo } = change
      ? await Purchases.purchasePackage(pkg.raw, null, change)
      : await Purchases.purchasePackage(pkg.raw);
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

// ── ACTIVE 3-Tage-Store-Trial (Introductory Offer) ───────────────────────────
// RevenueCat/Store ist die Quelle der Wahrheit für Verfügbarkeit, Preis UND die
// tatsächliche Trial-Dauer. Kein lokaler Timer, keine harte Preis-/Dauer-Codierung.

// ISO-8601-Periode (z. B. 'P4D', 'P1W', 'P1M') → Tage. Rein/testbar.
export function iso8601PeriodToDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, w, d] = [m[1], m[2], m[3], m[4]].map(x => (x ? Number(x) : 0));
  const days = y * 365 + mo * 30 + w * 7 + d;
  return days > 0 ? days : null;
}

// RevenueCat periodUnit ('DAY'|'WEEK'|'MONTH'|'YEAR') × count → Tage.
export function unitCountToDays(unit: string | null | undefined, count: number | null | undefined): number | null {
  if (!unit || !count) return null;
  const u = String(unit).toUpperCase();
  const per = u.startsWith('DAY') ? 1 : u.startsWith('WEEK') ? 7 : u.startsWith('MONTH') ? 30 : u.startsWith('YEAR') ? 365 : 0;
  return per ? per * count : null;
}

// Grobes Abrechnungs-Intervall für die UI-Darstellung („… / Monat").
export function coarsePeriodLabel(iso: string | null | undefined): 'day' | 'week' | 'month' | 'year' | null {
  const days = iso8601PeriodToDays(iso);
  if (days == null) return null;
  if (days >= 360) return 'year';
  if (days >= 28) return 'month';
  if (days >= 7) return 'week';
  return 'day';
}

// Freie Trial-Dauer (Tage) aus einem RevenueCat-Produkt lesen — iOS introPrice
// (price 0) ODER Android freePhase (billingPeriod). null = kein Free-Trial konfiguriert.
export function freeTrialDaysFromProduct(product: any): number | null {
  const intro = product?.introPrice;
  if (intro && (intro.price === 0 || intro.price === '0' || intro.price === 0.0)) {
    return unitCountToDays(intro.periodUnit, intro.periodNumberOfUnits)
      ?? iso8601PeriodToDays(intro.period ?? intro.periodISO8601);
  }
  const options: any[] = product?.subscriptionOptions ?? [];
  const freePhase = product?.defaultOption?.freePhase
    ?? options.map(o => o?.freePhase).find(Boolean);
  const iso = freePhase?.billingPeriod?.iso8601 ?? freePhase?.billingPeriod;
  return iso8601PeriodToDays(typeof iso === 'string' ? iso : null);
}

// Store-Trial-Angebot für ACTIVE. available=true nur, wenn ein Free-Trial-Phase
// im Store konfiguriert ist UND (iOS) die Introductory-Eligibility nicht klar
// „ineligible" meldet. So gibt es KEIN falsches Trial-Versprechen, wenn der Store
// (noch) nichts konfiguriert hat. Wirft nie.
export async function getActiveTrialOffer(): Promise<StoreTrialOffer> {
  const empty: StoreTrialOffer = { available: false, productId: null, priceString: null, period: null, freeTrialDays: null };
  if (!purchasesReady()) return empty;
  try {
    const pkgs = await getPackages();
    const pkg = pkgs.find(p => p.productId === PRODUCT_IDS.activeMonthly) ?? pkgs.find(p => p.tier === 'pro');
    if (!pkg) return empty;
    const product = (pkg.raw as any)?.product;
    const freeTrialDays = freeTrialDaysFromProduct(product);

    let eligible = true;
    if (Platform.OS === 'ios' && Purchases?.checkTrialOrIntroductoryPriceEligibility) {
      try {
        const map = await Purchases.checkTrialOrIntroductoryPriceEligibility([pkg.productId]);
        // INTRO_ELIGIBILITY_STATUS_INELIGIBLE === 3 → Trial bereits genutzt.
        if (map?.[pkg.productId]?.status === 3) eligible = false;
      } catch { /* Eligibility unbekannt → nicht hart sperren */ }
    }

    const periodIso = product?.subscriptionPeriod ?? product?.defaultOption?.pricingPhases?.slice(-1)?.[0]?.billingPeriod?.iso8601 ?? null;
    return {
      available:     eligible && freeTrialDays != null,
      productId:     pkg.productId,
      priceString:   pkg.priceString || null,
      period:        coarsePeriodLabel(periodIso) ?? 'month',
      freeTrialDays,
    };
  } catch {
    return empty;
  }
}

// ACTIVE-Trial kaufen (Store wickelt den 3-Tage-Free-Trial als Introductory Offer
// ab). Reiner Reuse des bestehenden Kauf-Flows — kein Sonderpfad.
export async function buyActiveTrial(): Promise<EntitlementResult> {
  if (!purchasesReady()) return { ok: false, tier: null, plan: null, expiration: null, error: 'IAP nicht verfügbar' };
  const pkgs = await getPackages();
  const pkg = pkgs.find(p => p.productId === PRODUCT_IDS.activeMonthly) ?? pkgs.find(p => p.tier === 'pro');
  if (!pkg) return { ok: false, tier: null, plan: null, expiration: null, error: 'ACTIVE-Paket nicht verfügbar' };
  return buyPackage(pkg);
}

// Store-Abo-Verwaltung: RevenueCat liefert die korrekte, plattformspezifische
// Management-URL (App Store bzw. Google Play) für das aktuelle Konto. null, wenn
// IAP nicht bereit ist, kein aktives Abo besteht oder der Store sie nicht liefert
// → der Aufrufer nutzt dann einen Store-Fallback. Wirft nie.
export async function getManagementURL(): Promise<string | null> {
  if (!purchasesReady()) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return info?.managementURL ?? null;
  } catch {
    return null;
  }
}
