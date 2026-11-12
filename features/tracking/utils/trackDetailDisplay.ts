import { buildTrackDetailMap, type TrackDetailMap } from './trackDetailMap';
import { selectDisplayRunPoints, type DisplayRunPoint } from './searchDisplayGeometry';

type Detail = {
  id?: string; owner_id?: string; dog_id?: string;
  points?: { latitude: number; longitude: number; point_type?: string | null; timestamp?: string; breakBefore?: boolean }[];
  runs?: { id?: string | null; ended_at?: string | null; run_points?: DisplayRunPoint[] }[];
  track_data?: { run?: { run_id?: string | null; ended_at?: string | null; run_points?: DisplayRunPoint[] } };
};
type Point = DisplayRunPoint & { timestamp?: string };
const coordinatesValid = (points: readonly Point[]) => points.every(p => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lng));

// Only extend an exact persisted prefix. Never splice two routes, sort samples,
// relax a gap or replace a divergent (possibly corrected) remote recording.
function isPrefix(prefix: readonly Point[], full: readonly Point[]): boolean {
  return prefix.length <= full.length && prefix.every((p, i) => {
    const q = full[i];
    return p.lat === q.lat && p.lng === q.lng && (!p.breakBefore || q.breakBefore === true)
      && (p.t == null || q.t == null || p.t === q.t)
      && (!p.timestamp || !q.timestamp || Date.parse(p.timestamp) === Date.parse(q.timestamp));
  });
}

/** Detail-map geometry ONLY. Canonical data, analysis, completion and metrics stay remote. */
export function buildTrackDetailDisplay(data: unknown, local: unknown, userId?: string | null): TrackDetailMap {
  const map = buildTrackDetailMap(data);
  const remote = data as Detail | null, device = local as Detail | null;
  if (!userId || !remote?.id || !remote.dog_id || remote.owner_id !== userId
    || device?.id !== remote.id || device.owner_id !== userId || device.dog_id !== remote.dog_id) return map;
  if (!Array.isArray(device.points) || !Array.isArray(device.runs)
    || device.points.some(p => !p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))
    || device.runs.some(r => !r || !Array.isArray(r.run_points) || !coordinatesValid(r.run_points))) return map;
  const saved = buildTrackDetailMap({ ...device, markers: [] });
  const lay = saved.lay.length > map.lay.length && coordinatesValid(saved.lay) && isPrefix(map.lay, saved.lay)
    ? saved.lay : map.lay;

  const remoteChoice = selectDisplayRunPoints(data), localChoice = selectDisplayRunPoints(local);
  const remoteRunId = remoteChoice.source === 'replay_points' ? remote.track_data?.run?.run_id
    : remote.runs?.[0]?.id ?? remote.track_data?.run?.run_id;
  const localRunId = localChoice.source === 'replay_points' ? device.track_data?.run?.run_id
    : device.runs?.[0]?.id ?? device.track_data?.run?.run_id;
  const endedAt = device.track_data?.run?.ended_at ?? device.runs?.[0]?.ended_at;
  // An unidentifiable or different run must never fill this run's display.
  const sameRun = !!remoteRunId && remoteRunId === localRunId;
  const canonicalRemote = remote.runs?.find(r => r.id === remoteRunId)?.run_points ?? [];
  const canonicalLocal = device.runs?.find(r => r.id === localRunId)?.run_points ?? [];
  const parentCanonical = remote.track_data?.run?.run_id === remoteRunId ? remote.track_data?.run?.run_points : undefined;
  const canonicalSources = [canonicalRemote, ...(parentCanonical === undefined ? [] : [parentCanonical])];
  const canonicalCompatible = canonicalSources.every(points => Array.isArray(points) && coordinatesValid(points)
    && isPrefix(points, canonicalLocal));
  const candidate = localChoice.points;
  const localFinal = typeof endedAt === 'string' && Number.isFinite(Date.parse(endedAt));
  const keepsCanonicalGaps = canonicalCompatible && canonicalSources.flat().every(p => !p.breakBefore || candidate.some(q => q.breakBefore
    && q.lat === p.lat && q.lng === p.lng && (p.t == null || p.t === q.t)));
  const canExtend = canonicalCompatible && keepsCanonicalGaps && (remoteChoice.source === localChoice.source
    ? candidate.length > remoteChoice.points.length && isPrefix(remoteChoice.points, candidate)
    : remoteChoice.source === 'run_points' && localChoice.source === 'replay_points'
      && canonicalLocal.length >= 2 && isPrefix(canonicalRemote, canonicalLocal));
  const run = sameRun && localFinal && candidate.length >= 2 && coordinatesValid(candidate) && canExtend
    ? saved.run : map.run;
  return { ...map, lay, run, hasLay: lay.length > 1, hasRun: run.length > 1,
    start: lay[0] ?? null, end: lay[lay.length - 1] ?? null };
}
