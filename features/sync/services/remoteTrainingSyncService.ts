import { supabase } from '@/lib/supabase';
import { uploadImage, uploadVideo, uploadAudio } from '@/services/mediaService';
import type { LocalTrainingSession, LocalTrackPoint, LocalTrackMarker, LocalMediaFile } from '@/features/sync/types/sync';

export interface RemoteResult<T> { data: T | null; error: string | null }
function fail<T>(scope: string, e: unknown): RemoteResult<T> {
  const msg = (e as { message?: string })?.message ?? String(e);
  console.error(`[remoteSync:${scope}]`, e);   // technische Details NUR ins Log
  return { data: null, error: msg };
}

const parseArr = (s: string | null): string[] | null => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };

// ── Training Session ──────────────────────────────────────────
export async function createRemoteTrainingSession(local: LocalTrainingSession): Promise<RemoteResult<{ id: string }>> {
  try {
    const { data, error } = await supabase.from('training_sessions').insert({
      owner_id: local.user_id, dog_id: local.dog_id, type: local.type ?? 'track',
      category: local.category ?? 'IGP', training_type: 'privat', status: local.status ?? 'completed',
      title: local.title ?? 'Fährte', notes: local.notes, rating: local.score,
      session_date: (local.started_at ?? local.created_at).slice(0, 10),
      started_at: local.started_at, ended_at: local.ended_at, duration_seconds: local.duration_seconds,
      location_name: local.location_name, latitude: local.latitude, longitude: local.longitude,
      temperature: local.temperature, weather_condition: local.weather_condition,
      wind_speed: local.wind_speed, humidity: local.humidity,
      surface_types: parseArr(local.surface_types), terrain_conditions: parseArr(local.terrain_conditions),
    }).select('id').single();
    if (error) return fail('createSession', error);
    return { data: data as { id: string }, error: null };
  } catch (e) { return fail('createSession', e); }
}

export async function updateRemoteTrainingSession(remoteId: string, patch: Record<string, any>): Promise<RemoteResult<null>> {
  try {
    const { error } = await supabase.from('training_sessions').update(patch).eq('id', remoteId);
    if (error) return fail('updateSession', error);
    return { data: null, error: null };
  } catch (e) { return fail('updateSession', e); }
}

export async function deleteRemoteTrainingSession(remoteId: string): Promise<RemoteResult<null>> {
  try {
    const { error } = await supabase.from('training_sessions').delete().eq('id', remoteId);
    if (error) return fail('deleteSession', error);
    return { data: null, error: null };
  } catch (e) { return fail('deleteSession', e); }
}

// ── Track Points / Markers (Batches) ─────────────────────────
export async function createRemoteTrackPointsBatch(remoteSessionId: string, points: LocalTrackPoint[]): Promise<RemoteResult<null>> {
  try {
    for (let i = 0; i < points.length; i += 100) {
      const rows = points.slice(i, i + 100).map(p => ({
        session_id: remoteSessionId, latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy,
        altitude: p.altitude, speed: p.speed, heading: p.heading, timestamp: p.timestamp, point_type: p.point_type ?? 'lay',
      }));
      const { error } = await supabase.from('track_points').insert(rows);
      if (error) return fail('pointsBatch', error);
    }
    return { data: null, error: null };
  } catch (e) { return fail('pointsBatch', e); }
}

export async function createRemoteTrackMarkersBatch(remoteSessionId: string, markers: LocalTrackMarker[]): Promise<RemoteResult<null>> {
  try {
    if (markers.length === 0) return { data: null, error: null };
    const rows = markers.map(m => ({
      session_id: remoteSessionId, marker_type: m.marker_type, material: m.material, angle_kind: m.angle_kind,
      latitude: m.latitude, longitude: m.longitude, accuracy: m.accuracy,
      distance_from_start: m.distance_from_start, note: m.note, audio_url: m.audio_remote_url, found: false,
    }));
    const { error } = await supabase.from('track_markers').insert(rows);
    if (error) return fail('markersBatch', error);
    return { data: null, error: null };
  } catch (e) { return fail('markersBatch', e); }
}

// ── Medien ───────────────────────────────────────────────────
export async function uploadRemoteMediaFile(local: LocalMediaFile): Promise<RemoteResult<{ url: string }>> {
  try {
    const up = local.file_type === 'photo' ? uploadImage : local.file_type === 'video' ? uploadVideo : uploadAudio;
    const { url } = await up(local.local_uri);
    return { data: { url }, error: null };
  } catch (e) { return fail('uploadMedia', e); }
}
