/** Server-only reconciliation. Client and webhook events are triggers, never authority. */
export type AuthorityPlan = 'newbie' | 'active' | 'founder_active' | 'trainer';
export type TerminalEvidence = { productId: string; providerProductId: string; store: string; purchasedAt: string; terminalAt: string; kind: 'refund' | 'expired' };
export type AuthoritySnapshot = {
  observedMs: number; plan: AuthorityPlan; productId: string | null;
  providerProductId: string | null; store: 'app_store' | 'play_store' | null; expiresAt: string | null;
  trialStartedAt: string | null; cancelAtPeriodEnd: boolean; purchaseAt: string | null; terminalEvidence: TerminalEvidence[];
};
const products: Record<string, AuthorityPlan> = {
  anyvo_active_monthly_10: 'active',
  'anyvo_founder_active_monthly_8.00': 'founder_active',
  'anyvo_trainer_monthly_30.00': 'trainer',
};
// Observed in ANYVO RevenueCat project 38d74453, 2026-10-11 (read-only catalog).
export const VERIFIED_PRODUCT_ALIASES: Record<string,string> = {
 'anyvo_active_monthly_10:anyvo-active-monthly-400': 'anyvo_active_monthly_10',
 'anyvo_trainer_monthly_30.00:anyvo-trainer-monthly-3000': 'anyvo_trainer_monthly_30.00',
};
const rank: Record<AuthorityPlan, number> = { newbie: 0, active: 1, founder_active: 2, trainer: 3 };
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_PROVIDER_RESPONSE');
  return v as Record<string, unknown>;
};
function date(v: unknown): number {
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error('INVALID_PROVIDER_DATE');
  return Date.parse(v);
}
export function normalizeAuthority(raw: unknown, now = Date.now(), productAliases: Record<string, string> = VERIFIED_PRODUCT_ALIASES): AuthoritySnapshot {
  const data = object(raw), subscriber = object(data.subscriber);
  const observedMs = data.request_date_ms;
  if (typeof observedMs !== 'number' || !Number.isSafeInteger(observedMs) || observedMs > now + 60_000 || observedMs < now - 300_000) throw new Error('STALE_PROVIDER_RESPONSE');
  const subscriptions = object(subscriber.subscriptions), entitlements = object(subscriber.entitlements);
  const terminalEvidence: TerminalEvidence[] = [];
  let result: AuthoritySnapshot = { observedMs, plan: 'newbie', productId: null, providerProductId: null, store: null, expiresAt: null, trialStartedAt: null, cancelAtPeriodEnd: false, purchaseAt: null, terminalEvidence };
  const supported = new Set(['pro','active','founder','founder_active','trainer',...Object.keys(products)]);
  let hasActiveStoreProduct = false;
  for (const [product, value] of Object.entries(subscriptions)) {
    const sub = object(value);
    const canonical = productAliases[product] ?? product;
    if (products[canonical] && sub.is_sandbox === false && ['app_store','play_store'].includes(String(sub.store))) {
      const purchased = date(sub.purchase_date);
      const expired = sub.expires_date == null ? Infinity : date(sub.expires_date);
      const graceEnd = sub.grace_period_expires_date == null ? expired : Math.max(expired,date(sub.grace_period_expires_date));
      const refunded = sub.refunded_at == null ? null : date(sub.refunded_at);
      const refundCurrent = refunded != null && refunded >= purchased && refunded <= observedMs;
      if (refundCurrent || graceEnd <= observedMs) terminalEvidence.push({productId:canonical,providerProductId:product,store:String(sub.store),purchasedAt:new Date(purchased).toISOString(),terminalAt:new Date(refundCurrent ? refunded! : graceEnd).toISOString(),kind:refundCurrent?'refund':'expired'});
      if (refundCurrent) continue;
    }
    const expiry = sub.expires_date == null ? Infinity : date(sub.expires_date);
    const grace = sub.grace_period_expires_date == null ? expiry : date(sub.grace_period_expires_date);
    if (Math.max(expiry, grace) <= observedMs) continue;
    hasActiveStoreProduct = true;
    if (!products[productAliases[product] ?? product] || !Object.entries(entitlements).some(([key,v]) => supported.has(key) && object(v).product_identifier === product)) throw new Error('UNMAPPED_PROVIDER_AUTHORITY');
  }
  for (const [name, value] of Object.entries(entitlements)) {
    if (!supported.has(name)) continue;
    const entitlement = object(value), product = entitlement.product_identifier;
    const entitlementEnd = entitlement.expires_date == null ? Infinity : date(entitlement.expires_date);
    const entitlementGrace = entitlement.grace_period_expires_date == null ? entitlementEnd : date(entitlement.grace_period_expires_date);
    if (Math.max(entitlementEnd, entitlementGrace) <= observedMs) continue;
    if (typeof product === 'string' && terminalEvidence.some(e=>e.providerProductId===product)) continue;
    if (typeof product !== 'string' || !products[productAliases[product] ?? product]) throw new Error('UNMAPPED_PROVIDER_PRODUCT');
    const sub = object(subscriptions[product]);
    // Monthly products must have finite expiry. No implicit lifetime or sandbox grants.
    if (sub.is_sandbox !== false) throw new Error('SANDBOX_OR_UNVERIFIED_ENVIRONMENT');
    if (!['app_store', 'play_store'].includes(String(sub.store))) throw new Error('UNMAPPED_PROVIDER_STORE');
    const expiry = date(entitlement.expires_date), subExpiry = date(sub.expires_date);
    const subGrace = sub.grace_period_expires_date == null ? subExpiry : date(sub.grace_period_expires_date);
    const entGrace = entitlement.grace_period_expires_date == null ? expiry : date(entitlement.grace_period_expires_date);
    const until = Math.min(Math.max(expiry, entGrace), Math.max(subExpiry, subGrace));
    if (until <= observedMs) continue;
    const canonicalProduct = productAliases[product] ?? product;
    const plan = products[canonicalProduct];
    const trainerEntitlement = name === 'trainer' || products[name] === 'trainer';
    if (plan === 'trainer' && !trainerEntitlement) {
      if (Object.entries(entitlements).some(([key,v]) => (key === 'trainer' || products[key] === 'trainer') && object(v).product_identifier === product)) continue;
      throw new Error('PROVIDER_ENTITLEMENT_MISMATCH');
    }
    if (plan !== 'trainer' && trainerEntitlement) throw new Error('PROVIDER_ENTITLEMENT_MISMATCH');
    if (rank[plan] < rank[result.plan]) continue;
    if (rank[plan] === rank[result.plan] && result.expiresAt && until <= Date.parse(result.expiresAt)) continue;
    const purchased = date(sub.purchase_date);
    if (purchased > observedMs) throw new Error('INVALID_PROVIDER_DATE');
    result = { observedMs, plan, productId: canonicalProduct, providerProductId: product, store: sub.store as AuthoritySnapshot['store'], expiresAt: new Date(until).toISOString(),
      trialStartedAt: sub.period_type === 'trial' ? new Date(date(sub.purchase_date)).toISOString() : null,
      cancelAtPeriodEnd: sub.unsubscribe_detected_at != null, purchaseAt: new Date(purchased).toISOString(), terminalEvidence };
  }
  if (hasActiveStoreProduct && result.plan === 'newbie') throw new Error('UNMAPPED_PROVIDER_AUTHORITY');
  return result;
}
