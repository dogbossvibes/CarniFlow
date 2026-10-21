import { supabase } from '@/lib/supabase';

export type TrackSharingAccessCode = 'TRACKING_ACTIVE_REQUIRED' | 'TRACKING_ACCESS_UNAVAILABLE' | 'ACCOUNT_CHANGED';
export class TrackSharingAccessError extends Error {
  constructor(readonly code: TrackSharingAccessCode) { super(code); this.name = 'TrackSharingAccessError'; }
}
export interface SharingAccessDependencies {
  currentUser(): Promise<string | null>;
  onAuthChange(listener: () => void): () => void;
  request(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
}
/** Read-only, fresh server authority. No plan-name guesses, cached grants or client UID argument. */
export function createTrackSharingAccessCheck(deps: SharingAccessDependencies, timeoutMs = 10_000) {
  return async (expectedUserId: string, signal?: AbortSignal): Promise<void> => {
    let changed = false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const unsubscribe = deps.onAuthChange(() => { changed = true; controller.abort(); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (changed || !expectedUserId) throw new TrackSharingAccessError('ACCOUNT_CHANGED');
      if (controller.signal.aborted) throw new TrackSharingAccessError('TRACKING_ACCESS_UNAVAILABLE');
    };
    try {
      await Promise.race([(async () => {
        check();
        const before = await deps.currentUser(); check();
        if (before !== expectedUserId) throw new TrackSharingAccessError('ACCOUNT_CHANGED');
        const result = await deps.request(controller.signal); check();
        const after = await deps.currentUser(); check();
        if (after !== expectedUserId) throw new TrackSharingAccessError('ACCOUNT_CHANGED');
        const data = result.data as { version?: unknown; canInitiate?: unknown } | null;
        if (result.error || !data || typeof data !== 'object' || Array.isArray(data)
          || data.version !== 1 || typeof data.canInitiate !== 'boolean') {
          throw new TrackSharingAccessError('TRACKING_ACCESS_UNAVAILABLE');
        }
        if (!data.canInitiate) throw new TrackSharingAccessError('TRACKING_ACTIVE_REQUIRED');
      })(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TrackSharingAccessError('TRACKING_ACCESS_UNAVAILABLE')); }, timeoutMs);
      })]);
    } catch (error) {
      throw error instanceof TrackSharingAccessError ? error : new TrackSharingAccessError('TRACKING_ACCESS_UNAVAILABLE');
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort(); signal?.removeEventListener('abort', abort); unsubscribe();
    }
  };
}
export const requireTrackSharingAccess = createTrackSharingAccessCheck({
  async currentUser() {
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session?.user.id ?? null;
  },
  onAuthChange(listener) {
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') listener();
    });
    return () => data.subscription.unsubscribe();
  },
  request(signal) { return supabase.rpc('track_sharing_access_v1').abortSignal(signal); },
});
