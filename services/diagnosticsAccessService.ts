import { supabase } from '@/lib/supabase';
import { getDiagnosticsAccessSnapshot, resolveDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

let sequence = 0;
// Narrow server read, independent of cached profiles and subscription/tester rights.
export async function refreshDiagnosticsAccess(): Promise<void> {
  const { userId, generation } = getDiagnosticsAccessSnapshot();
  const request = ++sequence;
  if (!userId) return;
  let allowed = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const { data, error } = await supabase.from('profiles')
      .select('can_use_internal_tracking_diagnostics').eq('id', userId).abortSignal(controller.signal).single();
    allowed = !error && data?.can_use_internal_tracking_diagnostics === true;
  } catch { /* unavailable/missing schema: deny */ }
  finally { clearTimeout(timeout); }
  if (request === sequence) resolveDiagnosticsAccess(userId, generation, allowed);
}
