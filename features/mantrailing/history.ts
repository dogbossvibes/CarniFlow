import { supabase } from '@/lib/supabase';
import { getLocalTrainingSessionById, getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import { getLayTrackPointsBySession, getSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';
import type { LocalTrainingSession } from '@/features/sync/types/sync';
import { MANTRAIL_SESSION_TYPE, parseMantrailData, type LatLng, type MantrailData } from './model';

// Verlauf und Auswertung der Mantrails (Spec 02, PR C). Nur lesend.
// Lokal zuerst (auch noch nicht hochgeladene Trails dieses Geräts), ergänzt um Trails
// vom Server (z. B. von einem anderen Gerät). Gleiche ID = derselbe Trail; dann gilt
// der lokale Stand. Nie eine IGP-Fährte (type = 'mantrail').

export interface MantrailSummary {
  id: string; dogId: string | null; startedAt: string | null;
  data: MantrailData | null;
  /** Strecke des Hundes in Metern (aus dem gespeicherten Ergebnis). */
  dogDistanceM: number | null;
  durationS: number | null;
  hasRun: boolean;
  source: 'local' | 'remote';
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const parseJson = (s: string | null | undefined): Obj => { try { return obj(JSON.parse(s ?? '{}')) ?? {}; } catch { return {}; } };

/** Lokale Sitzung → Zusammenfassung (rein). */
export function summarizeLocal(row: Pick<LocalTrainingSession, 'local_id' | 'dog_id' | 'started_at' | 'created_at' | 'payload_json' | 'type'>): MantrailSummary | null {
  if (row.type !== MANTRAIL_SESSION_TYPE) return null;
  const payload = parseJson(row.payload_json);
  const run = obj(payload.run);
  return {
    id: row.local_id, dogId: row.dog_id, startedAt: row.started_at ?? row.created_at ?? null,
    data: parseMantrailData(payload.mantrail), dogDistanceM: num(run?.distance_meters), durationS: num(run?.duration_seconds),
    hasRun: !!run, source: 'local',
  };
}

/** Serverzeile (training_sessions) → Zusammenfassung (rein). */
export function summarizeRemote(row: Obj): MantrailSummary | null {
  if (row.type !== MANTRAIL_SESSION_TYPE || typeof row.id !== 'string') return null;
  const trackData = obj(row.track_data) ?? {};
  const run = obj(trackData.run);
  return {
    id: row.id, dogId: typeof row.dog_id === 'string' ? row.dog_id : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : typeof row.created_at === 'string' ? row.created_at : null,
    data: parseMantrailData(trackData.mantrail), dogDistanceM: num(run?.distance_meters), durationS: num(run?.duration_seconds),
    hasRun: !!run, source: 'remote',
  };
}

/** Lokal gewinnt bei gleicher ID; neueste zuerst. */
export function mergeMantrails(local: readonly MantrailSummary[], remote: readonly MantrailSummary[]): MantrailSummary[] {
  const byId = new Map<string, MantrailSummary>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) byId.set(l.id, l);
  return [...byId.values()].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
}

export async function listMantrails(userId: string): Promise<MantrailSummary[]> {
  if (!userId) return [];
  const local = (await getLocalTrainingSessions(userId, { type: MANTRAIL_SESSION_TYPE }).catch(() => []))
    .map(summarizeLocal).filter((s): s is MantrailSummary => !!s);
  let remote: MantrailSummary[] = [];
  try {
    const { data, error } = await supabase.from('training_sessions')
      .select('id, dog_id, type, started_at, created_at, track_data')
      .eq('owner_id', userId).eq('type', MANTRAIL_SESSION_TYPE).order('started_at', { ascending: false }).limit(500);
    if (!error && Array.isArray(data)) remote = data.map(r => summarizeRemote(r as Obj)).filter((s): s is MantrailSummary => !!s);
  } catch { /* offline: nur lokal */ }
  return mergeMantrails(local, remote);
}

export interface MantrailDetail extends MantrailSummary { trailer: LatLng[]; dog: LatLng[] }

const toLatLng = (p: { latitude: number; longitude: number }): LatLng => ({ lat: p.latitude, lng: p.longitude });
/** run_points aus dem Ergebnis (lat/lng), robust gegen Altformate. */
export function parseRunPoints(v: unknown): LatLng[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(p => { const o = obj(p); const lat = num(o?.lat), lng = num(o?.lng); return lat == null || lng == null ? [] : [{ lat, lng }]; });
}

export async function loadMantrailDetail(userId: string, id: string): Promise<MantrailDetail | null> {
  if (!userId || !id) return null;
  const local = await getLocalTrainingSessionById(id).catch(() => null);
  if (local && local.user_id === userId && !local.deleted_at) {
    const summary = summarizeLocal(local);
    if (!summary) return null;
    const [lay, search] = await Promise.all([getLayTrackPointsBySession(id), getSearchPointsBySession(id)]);
    const runPoints = parseRunPoints(obj(parseJson(local.payload_json).run)?.run_points);
    return { ...summary, trailer: lay.map(toLatLng), dog: runPoints.length ? runPoints : search.map(toLatLng) };
  }
  try {
    const { data } = await supabase.from('training_sessions').select('id, owner_id, dog_id, type, started_at, created_at, track_data').eq('id', id).maybeSingle();
    const row = obj(data);
    if (!row || row.owner_id !== userId) return null;
    const summary = summarizeRemote(row);
    if (!summary) return null;
    const [lay, runs] = await Promise.all([
      supabase.from('track_points').select('latitude, longitude, timestamp').eq('session_id', id).eq('point_type', 'lay').order('timestamp', { ascending: true }).limit(20000),
      supabase.from('track_runs').select('run_points, ended_at').eq('session_id', id).order('ended_at', { ascending: false }).limit(1),
    ]);
    const trailer = Array.isArray(lay.data) ? (lay.data as { latitude: number; longitude: number }[]).map(toLatLng) : [];
    const dog = Array.isArray(runs.data) && runs.data[0] ? parseRunPoints((runs.data[0] as Obj).run_points) : [];
    return { ...summary, trailer, dog };
  } catch { return null; }
}
