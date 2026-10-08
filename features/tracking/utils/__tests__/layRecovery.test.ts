import { mergeLayRecovery } from '../layRecovery';
import type { PendingTrack } from '../../store/trackPersist';
import type { LocalTrackPoint, LocalTrackMarker } from '@/features/sync/types/sync';
const point = (i: number) => ({ lat: 47 + i * 0.0001, lng: 8, t: 1000 + i * 1000, accuracy: 4 });
const pending = (): PendingTrack => ({ sessionId: 's', dogId: 'd', status: 'laying', trackPoints: [point(0), point(1)],
  markers: [], runPoints: [], distanceMeters: 8, durationSeconds: 10, layFinishedAt: null, startAnchor: null, savedAt: 2000 });
const row = (i: number, payload: object | null = null) => ({ latitude: point(i).lat, longitude: 8, timestamp: new Date(point(i).t).toISOString(),
  accuracy: 4, altitude: null, heading: null, speed: null, payload_json: payload && JSON.stringify(payload) }) as LocalTrackPoint;
it('keeps the pending tail and identifies only absent SQLite points for backfill', () => {
  const result = mergeLayRecovery(pending(), [row(0)], [])!;
  expect(result.pending.trackPoints).toHaveLength(2);
  expect(result.pending.distanceMeters).toBe(8);
  expect(result.pointsToPersist.map(p => p.t)).toEqual([2000]);
});
it('merges newer durable points using the saved canonical counter and retains a boundary', () => {
  const result = mergeLayRecovery(pending(), [row(0), row(1), row(2, { breakBefore: true, measuredDistanceM: 8 })], [])!;
  expect(result.pending.trackPoints).toHaveLength(3);
  expect(result.pending.trackPoints[2].breakBefore).toBe(true);
  expect(result.pending.distanceMeters).toBe(8);
  expect(result.pointsToPersist).toEqual([]);
});
it('rejects an unprovable legacy distance counter or invalid timestamps', () => {
  expect(mergeLayRecovery(pending(), [row(2)], [])).toBeNull();
  expect(mergeLayRecovery(pending(), [{ ...row(0), timestamp: 'bad' }], [])).toBeNull();
});
it('retains repeated colocated markers and is idempotent after missing marker backfill', () => {
  const a = { id: 'a', type: 'gegenstand' as const, material: 'holz' as const, angleKind: null,
    lat: 47, lng: 8, t: 1000, accuracy: 4, distance_from_start: 8, note: null, audio_url: null, found: false };
  const b = { ...a, id: 'b', t: 2000 };
  const db = { local_id: 'mk-a', marker_type: a.type, material: a.material, angle_kind: null, latitude: 47, longitude: 8,
    accuracy: 4, distance_from_start: 8, note: null, audio_remote_url: null, created_at: new Date(1000).toISOString(),
    payload_json: JSON.stringify({ sourceMarkerId: 'a', recordedAtMs: 1000 }) } as LocalTrackMarker;
  const p = { ...pending(), markers: [a, b] };
  const first = mergeLayRecovery(p, [row(0), row(1)], [db])!;
  expect(first.markersToPersist).toEqual([b]);
  const second = mergeLayRecovery(p, [row(0), row(1)], [db, { ...db, local_id: 'mk-b', payload_json: JSON.stringify({ sourceMarkerId: 'b', recordedAtMs: 2000 }) }])!;
  expect(second.markersToPersist).toEqual([]);
  expect(second.pending.markers).toHaveLength(2);
});
