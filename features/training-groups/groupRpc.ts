import { requireTrackSharingAccess, TrackSharingAccessError } from '@/services/trackSharingAccess';
import { supabase } from '@/lib/supabase';

export type GroupEndpoint = 'training_group_v1' | 'training_group_session_v1'
  | 'training_group_track_v1' | 'training_group_live_v1';
export type GroupErrorCode = 'TRACKING_ACTIVE_REQUIRED' | 'TRACKING_ACCESS_UNAVAILABLE' | 'GROUP_UNAVAILABLE' | 'GROUP_INVALID_REQUEST' | 'GROUP_CONFLICT'
  | 'GROUP_EXPIRED' | 'GROUP_REVOKED' | 'GROUP_REFERENCE_INCOMPLETE' | 'GROUP_REFERENCE_CHANGED'
  | 'GROUP_MAINTENANCE_UNAVAILABLE' | 'GROUP_ACCOUNT_CHANGED' | 'GROUP_CONNECTION' | 'GROUP_INVALID_RESPONSE';
const SERVER_CODES = new Set<GroupErrorCode>(['TRACKING_ACTIVE_REQUIRED', 'GROUP_UNAVAILABLE', 'GROUP_INVALID_REQUEST', 'GROUP_CONFLICT',
  'GROUP_EXPIRED', 'GROUP_REVOKED', 'GROUP_REFERENCE_INCOMPLETE', 'GROUP_REFERENCE_CHANGED', 'GROUP_MAINTENANCE_UNAVAILABLE']);
export class GroupApiError extends Error {
  constructor(readonly code: GroupErrorCode) { super(code); this.name = 'GroupApiError'; }
}
export interface GroupRpcDependencies {
  authorizeInitiation?: typeof requireTrackSharingAccess;
  currentUser(): Promise<string | null>;
  onAuthChange(listener: () => void): () => void;
  request(endpoint: GroupEndpoint, action: string, request: Record<string, unknown>, signal: AbortSignal):
    PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

/** No automatic mutation retry. Caller owns stable operation IDs and explicit retries. */
export function createGroupRpcClient(dependencies: GroupRpcDependencies, timeoutMs = 10_000) {
  let epoch = 0, disposed = false;
  const pending = new Set<AbortController>();
  const unsubscribe = dependencies.onAuthChange(() => {
    epoch++;
    for (const controller of pending) controller.abort();
  });
  return {
    async call(expectedUserId: string, endpoint: GroupEndpoint, action: string,
      request: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
      if (disposed || !expectedUserId) throw new GroupApiError('GROUP_ACCOUNT_CHANGED');
      const requestEpoch = epoch;
      const controller = new AbortController();
      pending.add(controller);
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const check = () => {
        if (disposed || epoch !== requestEpoch) throw new GroupApiError('GROUP_ACCOUNT_CHANGED');
        if (controller.signal.aborted) throw new GroupApiError('GROUP_CONNECTION');
      };
      const operation = async () => {
        check();
        const before = await dependencies.currentUser(); check();
        if (before !== expectedUserId) throw new GroupApiError('GROUP_ACCOUNT_CHANGED');
        if (endpoint === 'training_group_live_v1' && action === 'start') {
          await (dependencies.authorizeInitiation ?? requireTrackSharingAccess)(expectedUserId, controller.signal); check();
        }
        const result = await dependencies.request(endpoint, action, request, controller.signal); check();
        const after = await dependencies.currentUser(); check();
        if (after !== expectedUserId) throw new GroupApiError('GROUP_ACCOUNT_CHANGED');
        if (result.error) {
          const message = result.error.message as GroupErrorCode;
          throw new GroupApiError(SERVER_CODES.has(message) ? message
            : result.error.code === 'PGRST202' ? 'GROUP_UNAVAILABLE' : 'GROUP_CONNECTION');
        }
        const data = result.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)
          || (data as Record<string, unknown>).version !== 1
          || typeof (data as Record<string, unknown>).serverNowMs !== 'number'
          || !Number.isFinite((data as Record<string, unknown>).serverNowMs)) {
          throw new GroupApiError('GROUP_INVALID_RESPONSE');
        }
        return data as Record<string, unknown>;
      };
      try {
        return await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new GroupApiError('GROUP_CONNECTION')); }, timeoutMs);
        })]);
      } catch (error) {
        if (error instanceof TrackSharingAccessError) throw new GroupApiError(error.code === 'ACCOUNT_CHANGED' ? 'GROUP_ACCOUNT_CHANGED' : error.code);
        if (error instanceof GroupApiError) throw error;
        // Never put server payloads, positions, JWTs or arbitrary errors into telemetry/UI.
        throw new GroupApiError('GROUP_CONNECTION');
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.abort(); pending.delete(controller);
      }
    },
    dispose() { disposed = true; epoch++; unsubscribe(); for (const c of pending) c.abort(); pending.clear(); },
  };
}

export function createSupabaseGroupClient() {
  return createGroupRpcClient({
    async currentUser() {
      const { data, error } = await supabase.auth.getSession();
      if (error) return null;
      return data.session?.user.id ?? null;
    },
    onAuthChange(listener) {
      const { data } = supabase.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') listener();
      });
      return () => data.subscription.unsubscribe();
    },
    request(endpoint, action, request, signal) {
      return supabase.rpc(endpoint, { p_action: action, p_request: request }).abortSignal(signal);
    },
  });
}
