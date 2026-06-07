import { supabase } from '@/lib/supabase';
import type { TrackSession, TrackPoint, TrackArticle, NewTrackSession } from '@/types/tracking';

export function getTrackSessions(ownerId: string, dogId?: string) {
  let q = supabase
    .from('track_sessions')
    .select('*, dog:dogs(name)')
    .eq('owner_id', ownerId)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .order('created_at',   { ascending: false });
  if (dogId) q = q.eq('dog_id', dogId);
  return q;
}

export function getTrackSessionById(id: string) {
  return supabase
    .from('track_sessions')
    .select('*, dog:dogs(name)')
    .eq('id', id)
    .single();
}

export function getTrackPoints(trackId: string) {
  return supabase
    .from('track_points')
    .select('*')
    .eq('track_id', trackId)
    .order('seq', { ascending: true });
}

export function getTrackArticles(trackId: string) {
  return supabase
    .from('track_articles')
    .select('*')
    .eq('track_id', trackId)
    .order('seq_index', { ascending: true });
}

export async function createTrackSession(ownerId: string, data: NewTrackSession) {
  return supabase
    .from('track_sessions')
    .insert({ ...data, owner_id: ownerId, status: 'active' })
    .select('*')
    .single();
}

export async function finishTrackSession(
  sessionId:  string,
  updates:    {
    distanz_m: number; dauer_sec: number; rating: number | null; notizen: string | null;
    liegezeit_min?: number | null; such_dauer_sec?: number | null; such_distanz_m?: number | null;
  },
  points:       Omit<TrackPoint,   'id' | 'track_id'>[],
  articles:     Omit<TrackArticle, 'id' | 'track_id' | 'created_at'>[],
  searchPoints: Omit<TrackPoint,   'id' | 'track_id'>[] = [],
) {
  const { error: sessErr } = await supabase
    .from('track_sessions')
    .update({ ...updates, status: 'completed' })
    .eq('id', sessionId);
  if (sessErr) return { error: sessErr };

  // Gelegte Fährte + abgelaufener Suchweg, getrennt über `phase`.
  const allPoints = [
    ...points.map(p       => ({ ...p, phase: 'lay'    as const })),
    ...searchPoints.map(p => ({ ...p, phase: 'search' as const })),
  ];
  if (allPoints.length > 0) {
    // Batch-insert in chunks of 500 to stay within Supabase limits
    for (let i = 0; i < allPoints.length; i += 500) {
      const chunk = allPoints.slice(i, i + 500).map(p => ({ ...p, track_id: sessionId }));
      const { error } = await supabase.from('track_points').insert(chunk);
      if (error) return { error };
    }
  }

  if (articles.length > 0) {
    const { error } = await supabase
      .from('track_articles')
      .insert(articles.map(a => ({ ...a, track_id: sessionId })));
    if (error) return { error };
  }

  return { error: null };
}

export function deleteTrackSession(id: string) {
  return supabase.from('track_sessions').delete().eq('id', id);
}

export function getTrackStats(ownerId: string) {
  return supabase
    .from('track_sessions')
    .select('distanz_m, dauer_sec, session_date')
    .eq('owner_id', ownerId)
    .eq('status', 'completed');
}
