import { readSpecialGeometry } from './specialAngleGeometry';
import type { PendingTrack } from '../store/trackPersist';
import type { MarkerSample, TrackPointSample } from '../store/trackingStore';
import type { LocalTrackMarker, LocalTrackPoint } from '@/features/sync/types/sync';
import { readContinuityPoint } from './trackContinuity';

const pointKey = (p: TrackPointSample) => `${p.t}|${p.lat}|${p.lng}`;
const valid = (p: TrackPointSample) => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const metadata = (value: string | null) => { try { return JSON.parse(value ?? '{}') ?? {}; } catch { return {}; } };

/** Merge durable SQLite points with the pending tail without inventing a distance counter. */
export function mergeLayRecovery(pending: PendingTrack, rows: LocalTrackPoint[], markers: LocalTrackMarker[]) {
  const persisted = rows.map(row => {
    const m = metadata(row.payload_json);
    return { lat: row.latitude, lng: row.longitude, t: Date.parse(row.timestamp), accuracy: row.accuracy,
      altitude: row.altitude, speed: row.speed, heading: row.heading, ...readContinuityPoint(row.payload_json),
      ...(typeof m.measuredDistanceM === 'number' && Number.isFinite(m.measuredDistanceM) && m.measuredDistanceM >= 0
        ? { measuredDistanceM: m.measuredDistanceM as number } : {}) };
  });
  if (![...persisted, ...pending.trackPoints].every(valid)) return null;
  const byKey = new Map<string, TrackPointSample>();
  for (const point of [...persisted, ...pending.trackPoints]) {
    const previous = byKey.get(pointKey(point));
    byKey.set(pointKey(point), { ...previous, ...point,
      ...(previous?.breakBefore || point.breakBefore ? { breakBefore: true } : {}) });
  }
  const points = [...byKey.values()].sort((a, b) => a.t - b.t);
  const pendingLastMs = Math.max(...pending.trackPoints.map(p => p.t));
  const last = points.at(-1);
  // Legacy SQLite tails without the canonical counter cannot safely restore that counter.
  if (last && last.t > pendingLastMs && last.measuredDistanceM == null) return null;
  const distanceMeters = Math.max(pending.distanceMeters, last?.measuredDistanceM ?? 0);
  const persistedKeys = new Set(persisted.map(pointKey));
  const pointsToPersist = points.filter(p => !persistedKeys.has(pointKey(p)));
  const matched = new Set<number>();
  const recoveredMarkers = pending.markers.map(marker => ({ ...marker }));
  const extraMarkers: MarkerSample[] = [];
  for (const row of markers) {
    const m = metadata(row.payload_json);
    const index = pending.markers.findIndex((p, i) => !matched.has(i) && (
      p.id === row.local_id || (typeof m.sourceMarkerId === 'string' ? p.id === m.sourceMarkerId : (p.type === row.marker_type
      && p.material === row.material && p.angleKind === row.angle_kind && p.lat === row.latitude && p.lng === row.longitude
      && Math.abs(p.distance_from_start - (row.distance_from_start ?? 0)) < 0.01))));
    if (index >= 0) {
      matched.add(index);
      recoveredMarkers[index] = { ...recoveredMarkers[index], ...readSpecialGeometry(m), ...readSpecialGeometry(recoveredMarkers[index]) };
      continue;
    }
    const t = typeof m.recordedAtMs === 'number' ? m.recordedAtMs : Date.parse(row.created_at);
    if (!Number.isFinite(t)) return null;
    extraMarkers.push({ id: row.local_id, type: row.marker_type as MarkerSample['type'],
      ...readSpecialGeometry(m), material: row.material as MarkerSample['material'], angleKind: row.angle_kind as MarkerSample['angleKind'],
      lat: row.latitude, lng: row.longitude, accuracy: row.accuracy, t,
      distance_from_start: row.distance_from_start ?? 0, note: row.note, audio_url: row.audio_remote_url, found: false });
  }
  return { pending: { ...pending, trackPoints: points, distanceMeters, markers: [...recoveredMarkers, ...extraMarkers] },
    pointsToPersist, markersToPersist: pending.markers.filter((_, i) => !matched.has(i)) };
}
