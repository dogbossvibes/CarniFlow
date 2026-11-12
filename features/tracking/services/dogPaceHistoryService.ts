import { supabase } from '@/lib/supabase';
import { getLocalDb } from '@/lib/localDb/client';
import { record } from '../utils/trackUserExport';

const LIMIT = 30;
interface PaceRow {
  id: string; dog_id: string; session_date: string | null;
  started_at: string | null; ended_at: string | null; distance: number | null;
  confidence: number | null; segments: unknown;
}
function asHistory(row: PaceRow, local = false) {
  let segments = row.segments;
  if (local && typeof segments === 'string') {
    try { segments = JSON.parse(segments); } catch { segments = null; }
  }
  return { id: row.id, dog_id: row.dog_id, session_date: row.session_date,
    track_data: { run: { started_at: row.started_at, ended_at: row.ended_at,
      search_handler_distance_m: row.distance,
      analytics: { analysisConfidence: row.confidence, segments } } } };
}
/** Bounded summaries only: no historical GPS arrays, notes or another owner's sessions. */
export async function getDogPaceHistory(ownerId: string, dogId: string): Promise<unknown[]> {
  const [remote, local] = await Promise.all([
    (async () => {
      const result = await supabase.from('training_sessions')
        .select('id,dog_id,session_date,started_at:track_data->run->>started_at,ended_at:track_data->run->>ended_at,distance:track_data->run->search_handler_distance_m,confidence:track_data->run->analytics->analysisConfidence,segments:track_data->run->analytics->segments')
        .eq('owner_id', ownerId).eq('dog_id', dogId).eq('type', 'track')
        .order('session_date', { ascending: false }).limit(LIMIT);
      if (result.error) return [];
      return (result.data ?? []).map(row => asHistory(row as unknown as PaceRow));
    })().catch(() => []),
    (async () => {
      const db = await getLocalDb();
      const rows = await db.getAllAsync<PaceRow>(`select local_id as id, dog_id, started_at as session_date,
        json_extract(payload_json, '$.run.started_at') as started_at,
        json_extract(payload_json, '$.run.ended_at') as ended_at,
        json_extract(payload_json, '$.run.search_handler_distance_m') as distance,
        json_extract(payload_json, '$.run.analytics.analysisConfidence') as confidence,
        json_extract(payload_json, '$.run.analytics.segments') as segments
        from local_training_sessions
        where user_id=? and dog_id=? and type='track' and status='completed'
          and deleted_at is null and json_valid(payload_json)
        order by started_at desc limit ?`, ownerId, dogId, LIMIT);
      return rows.map(row => asHistory(row, true));
    })().catch(() => []),
  ]);
  const merged = new Map(remote.map(row => [row.id, row]));
  for (const row of local) {
    const existing = merged.get(row.id);
    if (!existing || !Array.isArray(record(record(record(existing.track_data).run).analytics).segments)) merged.set(row.id, row);
  }
  return [...merged.values()];
}
