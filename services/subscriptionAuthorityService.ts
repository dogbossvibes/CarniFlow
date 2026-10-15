import { supabase } from '@/lib/supabase';
import { boundedAccountRead } from '@/lib/purchaseAccountAdapter';
import type { SubscriptionPlan } from '@/features/subscription/plans';

type PaidPlan = Exclude<SubscriptionPlan, 'newbie'>;
export type SubscriptionSyncResult = { error: string | null; pending?: boolean; plan?: PaidPlan };
const pending = (): SubscriptionSyncResult => ({ error: 'SUBSCRIPTION_SYNC_PENDING', pending: true });
const rank: Record<PaidPlan, number> = { active: 1, founder_active: 2, trainer: 3 };

/** A Store result only triggers reconciliation. All authority comes from the
 * authenticated server; no UID, plan, receipt, dates or platform are sent. */
export async function syncSubscriptionAuthority(expectedUserId: string, expectedPlan: PaidPlan): Promise<SubscriptionSyncResult> {
  if (!expectedUserId) return { error: 'SUBSCRIPTION_ACCOUNT_CHANGED' };
  let accountChanged = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== expectedUserId) accountChanged = true;
  });
  const sameAccount = async () => {
    const { data, error } = await boundedAccountRead(supabase.auth.getUser());
    return !accountChanged && !error && data.user?.id === expectedUserId;
  };
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!await sameAccount()) return { error: 'SUBSCRIPTION_ACCOUNT_CHANGED' };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const { data, error } = await supabase.functions.invoke('subscription-sync', { body: {}, signal: controller.signal });
        if (!await sameAccount()) return { error: 'SUBSCRIPTION_ACCOUNT_CHANGED' };
        const state = data?.state;
        if (!error && data?.version === 1 && state?.verified === true &&
          Object.hasOwn(rank, state.plan) && typeof state.expiresAt === 'string' &&
          Number.isFinite(Date.parse(state.expiresAt)) && Date.parse(state.expiresAt) > Date.now() &&
          rank[state.plan as PaidPlan] >= rank[expectedPlan]) {
          return { error: null, plan: state.plan as PaidPlan };
        }
      } catch {
        if (accountChanged) return { error: 'SUBSCRIPTION_ACCOUNT_CHANGED' };
      } finally { clearTimeout(timeout); }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 400));
    }
    return pending();
  } catch { return pending(); }
  finally { subscription.unsubscribe(); }
}
