import { buildParentReference, parseParentReference } from '../parentReference';
export const detail = () => ({ id: 'main', type: 'track', owner_id: 'owner', dog_id: 'dog', status: 'completed', started_at: '2026-10-14T10:00:00Z', distance_meters: 12,
 points: [{ latitude: 47, longitude: 8, point_type: 'lay' }, { latitude: 47.001, longitude: 8, point_type: 'lay' }],
 markers: [{ id: 'object', marker_type: 'gegenstand', latitude: 47, longitude: 8, distance_from_start: 0 }, { id: 'corner', marker_type: 'winkel', latitude: 47.001, longitude: 8, angle_kind: 'rechts' }],
 runs: [{ run_points: [{ lat: 40, lng: 4 }] }],
});
it('preserves the main line, saved markers and identity; never imports a search line', () => {
 const ref = buildParentReference(detail(), 'owner', 'main');
 expect(ref.map.lay).toHaveLength(2); expect(ref.map.markers.map(m => m.type)).toEqual(['gegenstand', 'winkel']); expect(ref.map.run).toEqual([]);
 expect(parseParentReference(JSON.parse(JSON.stringify(ref)), 'owner', 'main')).toEqual(ref);
});
it.each([{ owner_id: 'other' }, { id: 'other' }, { type: 'training' }, { status: 'active' }, { deleted_at: 'now' }, { dog_id: null }, { points: [] }, { points: [{ latitude: NaN, longitude: 8 }, { latitude: 47, longitude: 8 }] }])('rejects invalid/unowned/unfinished reference %j', patch => {
 expect(() => buildParentReference({ ...detail(), ...patch }, 'owner', 'main')).toThrow('PARENT_UNAVAILABLE');
});
it('retains honest gaps and refuses singleton-only segments', () => {
 const d = detail(); const points = [...d.points, { ...d.points[0], breakBefore: true }, { ...d.points[1] }];
 expect(buildParentReference({ ...d, points }, 'owner', 'main').map.lay[2].breakBefore).toBe(true);
 expect(() => buildParentReference({ ...d, points: points.slice(1,3) }, 'owner', 'main')).toThrow();
});
it('cannot relabel cached ownership or session', () => {
 const ref = buildParentReference(detail(), 'owner', 'main');
 expect(() => parseParentReference(ref, 'other', 'main')).toThrow(); expect(() => parseParentReference(ref, 'owner', 'other')).toThrow();
});
