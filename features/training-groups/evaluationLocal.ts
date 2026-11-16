import { getLocalDb } from '@/lib/localDb/client';
import type { EvalPoint, EvaluationPackage } from '@/features/tracking-exchange/groups/evaluationService';
import { readGroupTrackMarker } from './blindSearch';

// Stufe 4a: Auswertung aus der eigenen, abgesuchten Gruppenfährte bauen.
// Enthält nur gelegte Linie, Absuchelinie und Kennzahlen; nie Notizen, Bewertung, Wetter oder Orte-Namen.

const MAX_LAID = 5000;
const MAX_SEARCH = 10000;

type RawPoint = { lat?: unknown; lng?: unknown; breakBefore?: unknown };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toPoint = (p: RawPoint): EvalPoint | null => finite(p.lat) && finite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  ? (p.breakBefore === true ? { lat: p.lat, lng: p.lng, breakBefore: true } : { lat: p.lat, lng: p.lng }) : null;

/** Gleichmässig ausdünnen; erster, letzter und jeder Punkt mit Unterbruch bleiben erhalten. */
export function thinPoints(points: EvalPoint[], max: number): EvalPoint[] {
  if (points.length <= max) return points;
  const keep = new Set<number>([0, points.length - 1]);
  points.forEach((p, i) => { if (p.breakBefore) keep.add(i); });
  const rest = Math.max(max - keep.size, 0);
  const step = (points.length - 1) / Math.max(rest, 1);
  for (let k = 1; k <= rest && keep.size < max; k++) keep.add(Math.round(k * step));
  return [...keep].sort((a, b) => a - b).slice(0, max).map(i => points[i]);
}

const count = (v: unknown) => finite(v) && v >= 0 ? Math.min(Math.round(v), 1_000_000) : 0;

/** Rein, testbar. null, wenn die Absuche fehlt oder zu wenig Punkte hat. */
export function buildEvaluationPackage(laidRaw: RawPoint[], payload: Record<string, unknown> | null): EvaluationPackage | null {
  const run = payload?.run as Record<string, unknown> | undefined;
  if (!run || typeof run !== 'object') return null;
  const laid = thinPoints(laidRaw.map(toPoint).filter((p): p is EvalPoint => !!p), MAX_LAID);
  const search = thinPoints((Array.isArray(run.run_points) ? run.run_points as RawPoint[] : [])
    .map(toPoint).filter((p): p is EvalPoint => !!p), MAX_SEARCH);
  if (laid.length < 2 || search.length < 2) return null;
  const deviation = run.average_deviation_meters;
  return {
    version: 1, laid, search,
    metrics: {
      distanceM: count(payload?.distanceMeters ?? run.distance_meters),
      durationS: count(run.duration_seconds),
      articlesFound: count(run.articles_found),
      articlesTotal: count(run.total_objects),
      deviationAvgM: finite(deviation) && deviation >= 0 && deviation <= 100_000 ? Math.round(deviation * 10) / 10 : null,
      breaks: count(run.breaks),
    },
  };
}

/** Gruppenfährten-ID der lokalen Fährte, falls es eine übernommene Gruppenfährte ist. */
export async function readGroupTrackId(localId: string): Promise<string | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ payload_json: string | null }>(
    'select payload_json from local_training_sessions where local_id=? and deleted_at is null', localId);
  return readGroupTrackMarker(row?.payload_json)?.trackId ?? null;
}

export async function readEvaluationPackage(localId: string): Promise<EvaluationPackage | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ payload_json: string | null }>(
    'select payload_json from local_training_sessions where local_id=? and deleted_at is null', localId);
  if (!row) return null;
  let payload: Record<string, unknown> | null = null;
  try { payload = JSON.parse(row.payload_json ?? 'null'); } catch { payload = null; }
  const rows = await db.getAllAsync<{ latitude: number; longitude: number; payload_json: string | null }>(
    "select latitude, longitude, payload_json from local_track_points where session_local_id=? and point_type='lay' order by timestamp asc, rowid asc",
    localId);
  const laid = rows.map(r => {
    let brk = false;
    try { brk = JSON.parse(r.payload_json ?? '{}')?.breakBefore === true; } catch { brk = false; }
    return { lat: r.latitude, lng: r.longitude, breakBefore: brk };
  });
  return buildEvaluationPackage(laid, payload);
}
