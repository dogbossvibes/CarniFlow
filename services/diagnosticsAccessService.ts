import { supabase } from '@/lib/supabase';
import { getDiagnosticsAccessSnapshot, hasDiagnosticsAccess, resolveDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

let sequence = 0;
// Only transport/server-availability failures may keep an already-issued lease.
// Nonretryable auth/RLS/schema errors and malformed 2xx must fail closed.
const isTemporaryFailure = (status: number): boolean =>
  status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);
// Narrow server read, independent of cached profiles and subscription/tester rights.
export type DiagnosticsAccessResult = 'allowed' | 'denied' | 'unavailable' | 'stale';
export async function refreshDiagnosticsAccess(): Promise<DiagnosticsAccessResult> {
  const { userId, generation } = getDiagnosticsAccessSnapshot();
  const request = ++sequence;
  if (!userId) return 'stale';
  let allowed = false;
  let result: DiagnosticsAccessResult = 'unavailable';
  let keepValidLease = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const { data, error, status } = await supabase.from('profiles')
      .select('can_use_internal_tracking_diagnostics').eq('id', userId).abortSignal(controller.signal).single();
    allowed = !error && data?.can_use_internal_tracking_diagnostics === true;
    if (!error && typeof data?.can_use_internal_tracking_diagnostics === 'boolean') result = allowed ? 'allowed' : 'denied';
    else if (error && isTemporaryFailure(status)) keepValidLease = true;
  } catch { /* unavailable/missing schema: deny */ }
  finally { clearTimeout(timeout); }
  const current = getDiagnosticsAccessSnapshot();
  if (request !== sequence || current.userId !== userId || current.generation !== generation) return 'stale';
  // Preserve an existing permission ONLY within its original 60s TTL.
  // Never turn a failed lookup into new authorization or renew the lease.
  if (keepValidLease && hasDiagnosticsAccess()) return 'unavailable';
  resolveDiagnosticsAccess(userId, generation, allowed);
  return result;
}
