import { supabase } from '@/lib/supabase';
import { getDiagnosticsAccessSnapshot, resolveDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

let sequence = 0;
// Narrow server read, independent of cached profiles and subscription/tester rights.
export type DiagnosticsAccessResult = 'allowed' | 'denied' | 'unavailable' | 'stale';
export async function refreshDiagnosticsAccess(): Promise<DiagnosticsAccessResult> {
  const { userId, generation } = getDiagnosticsAccessSnapshot();
  const request = ++sequence;
  if (!userId) return 'stale';
  let allowed = false;
  let result: DiagnosticsAccessResult = 'unavailable';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const { data, error } = await supabase.from('profiles')
      .select('can_use_internal_tracking_diagnostics').eq('id', userId).abortSignal(controller.signal).single();
    allowed = !error && data?.can_use_internal_tracking_diagnostics === true;
    if (!error && typeof data?.can_use_internal_tracking_diagnostics === 'boolean') result = allowed ? 'allowed' : 'denied';
  } catch { /* unavailable/missing schema: deny */ }
  finally { clearTimeout(timeout); }
  const current = getDiagnosticsAccessSnapshot();
  if (request !== sequence || current.userId !== userId || current.generation !== generation) return 'stale';
  resolveDiagnosticsAccess(userId, generation, allowed);
  return result;
}
