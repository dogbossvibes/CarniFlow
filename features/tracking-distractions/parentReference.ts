import { buildTrackDetailMap, type TrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { splitContinuousPoints } from '@/features/tracking/utils/trackContinuity';
import { DistractionError } from './model';

export interface ParentReference {
 exchangeTaskId?: string; groupTaskId?: string;
 version: 1; id: string; ownerId: string; dogId: string; date: string | null;
 distanceM: number | null; map: TrackDetailMap;
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const coordinate = (v: unknown, limit: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
export function buildParentReference(detail: unknown, ownerId: string, id: string): ParentReference {
 const d = object(detail);
 if (!ownerId || d.type !== 'track' || d.owner_id !== ownerId || d.id !== id || typeof d.dog_id !== 'string' || !d.dog_id
   || d.deleted_at || d.status !== 'completed' || !Array.isArray(d.points) || d.points.length > 100000)
  throw new DistractionError('PARENT_UNAVAILABLE');
 const map = buildTrackDetailMap({ ...d, runs: [], track_data: null });
 if (map.lay.some(p => !coordinate(p.lat, 90) || !coordinate(p.lng, 180))
   || !splitContinuousPoints(map.lay).some(part => part.length > 1 && part.some(p => p.lat !== part[0].lat || p.lng !== part[0].lng)))
  throw new DistractionError('PARENT_UNAVAILABLE');
 map.markers = map.markers.filter(m => coordinate(m.lat, 90) && coordinate(m.lng, 180)
   && ['gegenstand', 'winkel', 'verleitung', 'sprachmarker'].includes(m.type));
 const rawDate = d.started_at ?? d.session_date ?? d.created_at;
 return { version: 1, id, ownerId, dogId: d.dog_id, date: typeof rawDate === 'string' && Number.isFinite(Date.parse(rawDate)) ? rawDate : null,
  distanceM: typeof d.distance_meters === 'number' && Number.isFinite(d.distance_meters) && d.distance_meters >= 0 ? d.distance_meters : null, map };
}
/** Revalidate cached identity and geometry rather than trusting a JSON cast. */
export function parseParentReference(value: unknown, ownerId: string, id: string): ParentReference {
 const v = object(value), map = object(v.map);
 if (v.version !== 1 || v.id !== id || v.ownerId !== ownerId || !Array.isArray(map.lay) || !Array.isArray(map.markers)) throw new DistractionError('PARENT_UNAVAILABLE');
 return buildParentReference({ id, type: 'track', owner_id: ownerId, dog_id: v.dogId, status: 'completed', started_at: v.date, distance_meters: v.distanceM,
  points: map.lay.map(p => { const point = object(p); return { latitude: point.lat, longitude: point.lng, point_type: 'lay', breakBefore: point.breakBefore === true }; }),
  markers: map.markers.map(m => { const marker = object(m); return { id: marker.id, marker_type: marker.type, latitude: marker.lat, longitude: marker.lng,
   angle_kind: marker.angleKind, material: marker.material, distance_from_start: marker.distanceFromStart, note: marker.note }; }),
 }, ownerId, id);
}
