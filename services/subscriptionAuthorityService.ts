import { supabase } from '@/lib/supabase';
import { boundedAccountRead } from '@/lib/purchaseAccountAdapter';
import {
  claimPendingSubscriptionSync, clearPendingSubscriptionSync, readPendingSubscriptionSync,
  rememberPendingSubscriptionSync, type PaidPlan,
} from './pendingSubscriptionSync';
import { refreshSubscriptionQueries } from './refreshSubscriptionQueries';

export type SubscriptionSyncResult = { error: string | null; pending?: boolean; plan?: PaidPlan };
const pending = (): SubscriptionSyncResult => ({ error: 'SUBSCRIPTION_SYNC_PENDING', pending: true });
const changed = (): SubscriptionSyncResult => ({ error: 'SUBSCRIPTION_ACCOUNT_CHANGED' });
const rank: Record<PaidPlan, number> = { active: 1, founder_active: 2, trainer: 3 };
type Flight = { plan: PaidPlan; cancelled: boolean; promise: Promise<SubscriptionSyncResult> };
const flights = new Map<string, Flight>();

async function execute(uid: string, plan: PaidPlan, flight: Flight, replayNonce?: string): Promise<SubscriptionSyncResult> {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== uid) flight.cancelled = true;
  });
  const account = async () => {
    if (flight.cancelled) return 'changed';
    try {
      const { data, error } = await boundedAccountRead(supabase.auth.getUser());
      if (flight.cancelled) return 'changed';
      if (error) return 'unavailable';
      return data.user?.id === uid ? 'current' : 'changed';
    } catch { return flight.cancelled ? 'changed' : 'unavailable'; }
  };
  let nonce = replayNonce;
  let refreshed = false;
  try {
    const initial = await account();
    if (initial === 'changed') return changed();
    if (initial === 'unavailable') {
      try { await rememberPendingSubscriptionSync(uid, plan, false); } catch { /* storage unavailable */ }
      return pending();
    }
    try {
      if (replayNonce) {
        if ((await readPendingSubscriptionSync(uid))?.nonce !== replayNonce) return pending();
      } else nonce = (await rememberPendingSubscriptionSync(uid, plan)).nonce;
    } catch { /* Storage failure must not block the authenticated server sync. */ }
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await account();
      if (current === 'changed') return changed();
      if (current === 'unavailable') return pending();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        // No UID, plan, Store result, dates or receipt is sent as authority.
        const { data, error } = await supabase.functions.invoke('subscription-sync', { body: {}, signal: controller.signal });
        const after = await account();
        if (after === 'changed') return changed();
        if (after === 'unavailable') return pending();
        const state = data?.state;
        const verifiedInactive = !error && data?.version === 1 && state?.verified === true &&
          state.plan === 'newbie' && state.expiresAt === null;
        if (verifiedInactive) {
          if (!refreshed) { refreshSubscriptionQueries(uid); refreshed = true; }
          if (nonce) {
            const marker = await readPendingSubscriptionSync(uid).catch(() => null);
            // Do not keep retrying an old expired/cancelled purchase forever.
            // A fresh purchase remains pending through temporary provider lag.
            if (marker?.nonce === nonce && Date.now() - marker.createdAt >= 24 * 60 * 60_000) {
              await clearPendingSubscriptionSync(uid, nonce).catch(() => {});
              const finalAccount = await account();
              if (finalAccount !== 'current') return finalAccount === 'changed' ? changed() : pending();
              return { error: 'SUBSCRIPTION_INACTIVE' };
            }
          }
        }
        if (!error && data?.version === 1 && state?.verified === true &&
          Object.hasOwn(rank, state.plan) && typeof state.expiresAt === 'string' &&
          Number.isFinite(Date.parse(state.expiresAt)) && Date.parse(state.expiresAt) > Date.now() &&
          rank[state.plan as PaidPlan] >= rank[plan]) {
          if (nonce) try { await clearPendingSubscriptionSync(uid, nonce); } catch { /* replay remains safe */ }
          const finalAccount = await account();
          if (finalAccount !== 'current') return finalAccount === 'changed' ? changed() : pending();
          refreshSubscriptionQueries(uid);
          return { error: null, plan: state.plan as PaidPlan };
        }
      } catch { if (flight.cancelled) return changed(); }
      finally { clearTimeout(timeout); }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 400));
    }
    return pending();
  } catch { return flight.cancelled ? changed() : pending(); }
  finally { subscription.unsubscribe(); }
}

function start(uid: string, plan: PaidPlan, nonce?: string): Promise<SubscriptionSyncResult> {
  if (!uid) return Promise.resolve(changed());
  const existing = flights.get(uid);
  if (existing && !existing.cancelled && existing.plan === plan) return existing.promise;
  const flight: Flight = { plan, cancelled: false, promise: Promise.resolve(pending()) };
  flight.promise = execute(uid, plan, flight, nonce).finally(() => {
    if (flights.get(uid) === flight) flights.delete(uid);
  });
  flights.set(uid, flight);
  return flight.promise;
}
export const syncSubscriptionAuthority = (uid: string, plan: PaidPlan) => start(uid, plan);

/** Reads only this account's marker. Never launches another Store purchase. */
export async function retryPendingSubscriptionSync(uid: string): Promise<number | null> {
  try {
    const { marker, retryAt } = await claimPendingSubscriptionSync(uid);
    if (!marker) return retryAt;
    await start(uid, marker.plan, marker.nonce);
    return (await readPendingSubscriptionSync(uid))?.retryAt ?? null;
  } catch { return null; }
}
