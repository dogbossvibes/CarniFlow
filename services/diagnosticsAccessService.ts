import { supabase } from '@/lib/supabase';
import { getDiagnosticsAccessSnapshot, resolveDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

let sequence = 0;
export type DiagnosticsAccessResult = 'allowed' | 'denied' | 'unavailable' | 'stale';
// Narrow server read, independent of cached profiles and subscription/tester rights.
export async function refreshDiagnosticsAccess(): Promise<DiagnosticsAccessResult> {
  const { userId, generation } = getDiagnosticsAccessSnapshot();
  const request = ++sequence;
  if (!userId) return 'stale';
  let result: DiagnosticsAccessResult = 'unavailable';
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Abort alone does not bound a stalled transport; also settle the caller so
  // foreground recovery can retry. A late response can no longer grant access.
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('DIAGNOSTICS_ACCESS_TIMEOUT')); }, 8_000);
  });
  try {
    const { data, error } = await Promise.race([
      supabase.from('profiles').select('can_use_internal_tracking_diagnostics')
        .eq('id', userId).abortSignal(controller.signal).single(),
      deadline,
    ]);
    if (!error && typeof data?.can_use_internal_tracking_diagnostics === 'boolean') {
      result = data.can_use_internal_tracking_diagnostics ? 'allowed' : 'denied';
    }
  } catch { /* unavailable/missing schema: deny */ }
  finally { clearTimeout(timeout); }
  const current = getDiagnosticsAccessSnapshot();
  if (request !== sequence || current.userId !== userId || current.generation !== generation) return 'stale';
  resolveDiagnosticsAccess(userId, generation, result === 'allowed');
  return result;
}
