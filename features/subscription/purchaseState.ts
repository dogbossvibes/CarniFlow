import type { SubscriptionPlan } from './plans';

type Subscription = { plan: SubscriptionPlan | null; status: string | null;
  trial_ends_at: string | null; current_period_ends_at: string | null };
type StoreRead = { ok: boolean; plan: Exclude<SubscriptionPlan, 'newbie'> | null };

/** Purchase UI only. Access continues to come from verified capabilities and
 * independent lifetime/tester/manual entitlements. A failed read is not expiry. */
export function resolvePurchasePlan(sub: Subscription | null, store: StoreRead | null, now = Date.now()): SubscriptionPlan | null {
  if (store?.ok && store.plan) return store.plan;
  if (!sub?.plan || sub.plan === 'newbie') return sub?.plan ?? null;
  if (sub.status === 'expired') return null;
  const end = sub.status === 'trialing' ? sub.trial_ends_at : sub.current_period_ends_at;
  if (end && Number.isFinite(Date.parse(end)) && Date.parse(end) <= now) return null;
  // A future/unknown paid DB period and an empty SDK read are contradictory.
  // Keep the purchase blocked until fresh authority/restore resolves it.
  return sub.plan;
}
