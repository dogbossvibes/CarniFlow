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
// Idempotent: die lokale local_id IST die training_sessions.id (clientseitige UUID);
// upsert(onConflict:'id') → Retry aktualisiert dieselbe Zeile, erzeugt keine zweite
// Fährte. NOT-NULL-Pflichtfelder (owner_id/dog_id/category/training_type/session_date)
// werden vollständig gesetzt; Summary/Segmente kommen aus payload_json (P-SAVE1-Finalize).
export async function createRemoteTrainingSession(local: LocalTrainingSession): Promise<RemoteResult<{ id: string }>> {
  try {
    const summary = ((): Record<string, any> => {
      try { return local.payload_json ? JSON.parse(local.payload_json) : {}; } catch { return {}; }
    })();
    const { data, error } = await supabase.from('training_sessions').upsert({
      id: local.local_id,   // clientseitige UUID = training_sessions.id
      owner_id: local.user_id, dog_id: local.dog_id, type: local.type ?? 'track',
      category: local.category ?? 'IGP', training_type: 'privat', status: local.status ?? 'completed',
      title: local.title ?? 'Fährte', notes: local.notes, rating: local.score,
      session_date: (local.started_at ?? local.created_at).slice(0, 10),
      started_at: local.started_at, ended_at: local.ended_at, duration_seconds: local.duration_seconds,
      laying_duration_seconds: local.duration_seconds,
      location_name: local.location_name, latitude: local.latitude, longitude: local.longitude,
      temperature: local.temperature, weather_condition: local.weather_condition,
      wind_speed: local.wind_speed, humidity: local.humidity,
      surface_types: parseArr(local.surface_types), terrain_conditions: parseArr(local.terrain_conditions),
      distance_meters:     summary.distanceMeters ?? null,
      articles_total:      summary.articlesTotal ?? null,
      corners_total:       summary.cornersTotal ?? null,
      gps_quality_average: summary.gpsQualityAverage ?? null,
      ...(summary.segments ? { track_data: { segments: summary.segments } } : {}),
    }, { onConflict: 'id' }).select('id').single();
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

// ── Track Points / Markers (idempotenter Replace-by-session) ─────────────────
// Vor dem (Neu-)Einfügen die vorhandenen Remote-Zeilen dieser Session löschen →
// Retry (1×/2×/10×) ergibt remote immer exakt dieselben Trackdaten, keine Duplikate.
// RLS „owner via session" deckt DELETE owner-scoped ab (keine fremden Sessions).
export async function deleteRemoteLayTrackPoints(remoteSessionId: string): Promise<RemoteResult<null>> {
  try {
    const { error } = await supabase.from('track_points').delete()
      .eq('session_id', remoteSessionId).eq('point_type', 'lay');
    if (error) return fail('deleteLayPoints', error);
    return { data: null, error: null };
  } catch (e) { return fail('deleteLayPoints', e); }
}

export async function deleteRemoteTrackMarkers(remoteSessionId: string): Promise<RemoteResult<null>> {
  try {
    const { error } = await supabase.from('track_markers').delete().eq('session_id', remoteSessionId);
    if (error) return fail('deleteMarkers', error);
    return { data: null, error: null };
  } catch (e) { return fail('deleteMarkers', e); }
}

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
