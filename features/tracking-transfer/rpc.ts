import { supabase } from '@/lib/supabase';

const serverCodes = new Set(['TRANSFER_UNAVAILABLE', 'TRANSFER_AUTH_REQUIRED', 'TRANSFER_INVALID_REQUEST', 'REFERENCE_INVALID',
  'REFERENCE_TOO_LARGE', 'TRANSFER_CONFLICT', 'SOURCE_INCOMPLETE', 'TRANSFER_REFERENCE_EXPIRED', 'TRANSFER_QUOTA_EXCEEDED',
  'TRANSFER_MAINTENANCE_UNAVAILABLE', 'TRANSFER_LIMIT_REACHED', 'TRANSFER_REVISION_CONFLICT', 'TRANSFER_COPY_GONE', 'TRANSFER_COPY_INCONSISTENT']);
export class TransferApiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'TransferApiError'; }
}
export interface TransferRpcDependencies {
  currentUser(): Promise<string | null>;
  onAuthChange(listener: () => void): () => void;
  request(action: string, request: Record<string, unknown>, signal: AbortSignal): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}
export function createTransferRpcClient(deps: TransferRpcDependencies, timeoutMs = 15_000) {
  let epoch = 0, disposed = false;
  const controllers = new Set<AbortController>();
  const unsubscribe = deps.onAuthChange(() => { epoch++; controllers.forEach(c => c.abort()); });
  return {
    epoch: () => epoch,
    async call(userId: string, action: string, request: Record<string, unknown>): Promise<Record<string, unknown>> {
      const beforeEpoch = epoch, controller = new AbortController(); controllers.add(controller);
      const check = () => {
        if (disposed || epoch !== beforeEpoch) throw new TransferApiError('ACCOUNT_CHANGED');
        if (controller.signal.aborted) throw new TransferApiError('CONNECTION');
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // A strict wire limit includes RPC argument overhead. No silent point thinning.
        let bytes = 0;
        for (const c of JSON.stringify({ p_action: action, p_request: request })) {
          const cp = c.codePointAt(0)!; bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        }
        if (bytes > 4_000_000) throw new TransferApiError('REFERENCE_TOO_LARGE');
        return await Promise.race([(async () => {
          check(); const before = await deps.currentUser(); check();
          if (!userId || before !== userId) throw new TransferApiError('ACCOUNT_CHANGED');
          const result = await deps.request(action, request, controller.signal); check();
          const after = await deps.currentUser(); check();
          if (after !== userId) throw new TransferApiError('ACCOUNT_CHANGED');
          if (result.error) throw new TransferApiError(serverCodes.has(result.error.message ?? '') ? result.error.message!
            : result.error.code === 'PGRST202' ? 'TRANSFER_UNAVAILABLE' : 'CONNECTION');
          const data = result.data as Record<string, unknown> | null;
          if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1
            || typeof data.serverNowMs !== 'number' || !Number.isSafeInteger(data.serverNowMs) || data.serverNowMs <= 0) {
            throw new TransferApiError('INVALID_RESPONSE');
          }
          return data;
        })(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new TransferApiError('CONNECTION')); }, timeoutMs);
        })]);
      } catch (error) { throw error instanceof TransferApiError ? error : new TransferApiError('CONNECTION'); }
      finally { if (timer) clearTimeout(timer); controller.abort(); controllers.delete(controller); }
    },
    dispose() { disposed = true; epoch++; unsubscribe(); controllers.forEach(c => c.abort()); controllers.clear(); },
  };
}
export function createSupabaseTransferClient() {
  return createTransferRpcClient({
    async currentUser() { const { data, error } = await supabase.auth.getSession(); return error ? null : data.session?.user.id ?? null; },
    onAuthChange(listener) {
      const { data } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') listener(); });
      return () => data.subscription.unsubscribe();
    },
    request(action, request, signal) { return supabase.rpc('track_transfer_v1', { p_action: action, p_request: request }).abortSignal(signal); },
  });
}
