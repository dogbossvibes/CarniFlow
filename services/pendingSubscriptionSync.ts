import type { SubscriptionPlan } from '@/features/subscription/plans';

export type PaidPlan = Exclude<SubscriptionPlan, 'newbie'>;
export type PendingSubscriptionSync = { version: 1; plan: PaidPlan; nonce: string; retryAt: number; createdAt: number };
export const SUBSCRIPTION_RETRY_MS = 60_000;
const prefix = '@anyvo/subscription-sync/v1/';
const locks = new Map<string, Promise<unknown>>();
let sequence = 0;
function storage(): typeof import('@react-native-async-storage/async-storage').default {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- pure subscription readers must not require a native persistence module.
  const loaded = require('@react-native-async-storage/async-storage');
  return loaded.default ?? loaded;
}
const listeners = new Set<(uid: string) => void>();
export function onPendingSubscriptionSync(listener: (uid: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Only an operational marker; no receipt, credentials, grant or offer counter.
function locked<T>(uid: string, work: () => Promise<T>): Promise<T> {
  const next = (locks.get(uid) ?? Promise.resolve()).catch(() => {}).then(work);
  const tail = next.then(() => {}, () => {});
  locks.set(uid, tail);
  void tail.then(() => { if (locks.get(uid) === tail) locks.delete(uid); });
  return next;
}
async function read(uid: string): Promise<PendingSubscriptionSync | null> {
  const raw = await storage().getItem(prefix + uid);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !['active', 'founder_active', 'trainer'].includes(value.plan) ||
      typeof value.nonce !== 'string' || !Number.isFinite(value.retryAt)) return null;
    return { ...value, createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now() };
  } catch { return null; }
}
export const readPendingSubscriptionSync = (uid: string) => locked(uid, () => read(uid));
export function rememberPendingSubscriptionSync(uid: string, plan: PaidPlan, replace = true) {
  return locked(uid, async () => {
    const previous = await read(uid);
    if (!replace && previous) return previous;
    const value: PendingSubscriptionSync = { version: 1, plan,
      nonce: `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`,
      retryAt: Date.now() + SUBSCRIPTION_RETRY_MS, createdAt: Date.now() };
    await storage().setItem(prefix + uid, JSON.stringify(value));
    for (const listener of listeners) {
      try { listener(uid); } catch { /* An observer cannot alter persistence. */ }
    }
    return value;
  });
}
export function clearPendingSubscriptionSync(uid: string, nonce: string) {
  return locked(uid, async () => {
    if ((await read(uid))?.nonce === nonce) await storage().removeItem(prefix + uid);
  });
}
export function claimPendingSubscriptionSync(uid: string) {
  return locked(uid, async () => {
    const marker = await read(uid);
    if (!marker) return { marker: null, retryAt: null };
    const now = Date.now();
    if (marker.retryAt > now && marker.retryAt <= now + SUBSCRIPTION_RETRY_MS) {
      return { marker: null, retryAt: marker.retryAt };
    }
    const claimed = { ...marker, retryAt: now + SUBSCRIPTION_RETRY_MS };
    await storage().setItem(prefix + uid, JSON.stringify(claimed));
    return { marker: claimed, retryAt: claimed.retryAt };
  });
}
