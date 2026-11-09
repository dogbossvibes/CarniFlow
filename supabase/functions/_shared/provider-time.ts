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
/** A renewal charged before its period starts (App Store up to 24 h early): V1 already
 * reports the NEW period (purchase_date in the future, new expiry), while V2 still reports
 * the running period with auto_renewal_status `has_already_renewed` and ends_at = new expiry.
 * Map V1 onto that independently read V2 period only on an exact, unique match:
 * same owner, product and store, the new period starts where the running one ends,
 * and both report the same new end (to the second). The values written are V2's own
 * millisecond values. Otherwise leave the snapshot unchanged (fail-closed downstream). */
export function canonicalizePendingRenewal(snapshot: AuthoritySnapshot, receipts: Receipt[], owner: string): AuthoritySnapshot {
  if (snapshot.purchaseAt === null || snapshot.expiresAt === null || snapshot.store === null) return snapshot;
  const purchase = Date.parse(snapshot.purchaseAt), expiry = Date.parse(snapshot.expiresAt);
  if (!(purchase > snapshot.observedMs)) return snapshot;
  const matches = receipts.filter(r => r.owner === owner && r.givesAccess && r.store === snapshot.store &&
    r.product === snapshot.productId && r.renewal === 'has_already_renewed' &&
    r.periodStart <= snapshot.observedMs && sameProviderSecond(purchase, r.periodEnd) && sameProviderSecond(expiry, r.endsAt));
  if (matches.length !== 1) return snapshot;
  const r = matches[0];
  return { ...snapshot, purchaseAt: new Date(r.periodStart).toISOString(), expiresAt: new Date(r.endsAt).toISOString() };
}

export function canonicalizeProviderTimes(input: AuthoritySnapshot, receipts: Receipt[], owner: string): AuthoritySnapshot {
  const snapshot = canonicalizePendingRenewal(input, receipts, owner);
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
