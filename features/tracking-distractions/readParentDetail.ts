import { supabase } from '@/lib/supabase';
import { restoreLayContinuity } from '@/features/tracking/utils/trackContinuity';

/** Only failed transport permits offline fallback, never auth/RLS/server errors. */
export function isParentNetworkFailure(result: { status?: number; error?: { message?: string; code?: string } | null }): boolean {
 return result.status === 0 && !result.error?.code && /network request failed|failed to fetch|fetch failed|networkerror/i.test(result.error?.message ?? '');
}
const denied = (r: { status?: number; error?: { code?: string } | null }) => r.status === 401 || r.status === 403 || r.error?.code === '42501';
async function children(table: 'track_points' | 'track_markers', id: string) {
 const rows: Record<string, unknown>[] = []; let total: number | null = null;
 while (total === null || rows.length < total) {
  const result = await supabase.from(table).select('*', { count: 'exact' }).eq('session_id', id)
   .order(table === 'track_points' ? 'timestamp' : 'created_at').order('id').range(rows.length, rows.length + 999);
  if (result.error) return { data: null, error: result.error, offline: isParentNetworkFailure(result), denied: denied(result) };
  if (result.count === null || result.count > 100000 || total !== null && total !== result.count
    || !result.data || result.count > rows.length && !result.data.length)
   return { data: null, error: new Error('INCOMPLETE_REFERENCE'), offline: false };
  total = result.count; rows.push(...result.data);
  if (rows.length > total) return { data: null, error: new Error('INCOMPLETE_REFERENCE'), offline: false };
 }
 if (new Set(rows.map(row => row.id)).size !== rows.length) return { data: null, error: new Error('INCOMPLETE_REFERENCE'), offline: false };
 return { data: rows, error: null, offline: false };
}
export async function readParentDetail(id: string, ownerId: string) {
 const session = await supabase.from('training_sessions').select('*').eq('id', id).eq('owner_id', ownerId).eq('type', 'track').maybeSingle();
 if (session.error) return { data: null, error: session.error, offline: isParentNetworkFailure(session), denied: denied(session) };
 if (!session.data) return { data: null, error: null, offline: false };
 const [points, markers] = await Promise.all([children('track_points', id), children('track_markers', id)]);
 const errors = [points, markers].filter(response => response.error);
 if (errors.length) return { data: null, error: errors[0].error, offline: errors.every(response => response.offline), denied: errors.some(response => 'denied' in response && response.denied === true) };
 return { data: { ...session.data, points: restoreLayContinuity(points.data ?? [], session.data.track_data?.layContinuity), markers: markers.data ?? [] }, error: null, offline: false };
}
