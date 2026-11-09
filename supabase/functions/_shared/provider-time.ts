import type { AuthoritySnapshot } from './normalizer.ts';
import type { Receipt } from './ownership.ts';

/** V1 may omit the fractional second that V2 retains for Google Play. */
export function sameProviderSecond(v1: number, v2: number): boolean {
  return Number.isSafeInteger(v1) && Number.isSafeInteger(v2) && v1 >= 0 && v2 >= 0 &&
    (v1 === v2 || (v1 % 1000 === 0 && Math.floor(v2 / 1000) * 1000 === v1));
}

/** Keep the ownership planner/SQL exact: canonicalize only independently matched
 * Google periods, using V2's authenticated millisecond values. Never round a
 * receipt, accept a neighbouring second, or infer a product/account match. */
export function canonicalizeProviderTimes(snapshot: AuthoritySnapshot, receipts: Receipt[], owner: string): AuthoritySnapshot {
  const owned = receipts.filter(r => r.owner === owner && r.store === 'play_store');
  const matches = owned.filter(r => r.givesAccess && r.product === snapshot.productId && snapshot.store === r.store);
  let result = snapshot;
  if (matches.length === 1 && snapshot.purchaseAt !== null && snapshot.expiresAt !== null) {
    const r = matches[0], purchase = Date.parse(snapshot.purchaseAt), expiry = Date.parse(snapshot.expiresAt);
    const end = sameProviderSecond(expiry, r.periodEnd) ? r.periodEnd :
      r.renewal === 'has_already_renewed' && sameProviderSecond(expiry, r.endsAt) ? r.endsAt : null;
    // Grace expiry remains the independently read V1 grace proof. The regular
    // period and grace dates are checked separately by provider.collect.
    if (sameProviderSecond(purchase, r.periodStart) && r.periodStart <= snapshot.observedMs &&
      (end !== null || r.status === 'in_grace_period')) {
      result = { ...snapshot, purchaseAt: new Date(r.periodStart).toISOString(),
        expiresAt: end === null ? snapshot.expiresAt : new Date(end).toISOString() };
    }
  }
  return { ...result, terminalEvidence: snapshot.terminalEvidence.map(e => {
    if (e.store !== 'play_store') return e;
    const candidates = owned.filter(r => r.product === e.productId &&
      sameProviderSecond(Date.parse(e.purchasedAt), r.periodStart));
    if (candidates.length !== 1) return e;
    return { ...e, purchasedAt: new Date(candidates[0].periodStart).toISOString() };
  }) };
}
