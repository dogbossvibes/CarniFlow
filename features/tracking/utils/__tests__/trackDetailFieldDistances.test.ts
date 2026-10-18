import a from './fixtures/field20261012/a.json';
import b from './fixtures/field20261012/b.json';
import { buildTrackDetailMap } from '../trackDetailMap';
import { buildSearchEventArcs } from '../canonicalArc';
const T0 = Date.UTC(2020, 0, 1);
const ll = (p: { x: number; y: number }) => ({ latitude: p.y / 111320, longitude: p.x / 111320 });
function saved(f: typeof a) {
  return {
    points: f.points.map(p => ({ ...ll(p), timestamp: new Date(T0 + p.tMs).toISOString() })),
    markers: f.markers.map((m, i) => ({ id: String(i), ...ll(m), marker_type: m.type,
      angle_kind: m.angleKind, material: m.material, distance_from_start: m.atM,
      created_at: new Date(T0 + m.tMs).toISOString() })),
  };
}
describe('Oct 12 saved field distances — same reference as search, no data rewrite', () => {
  it.each([['A', a], ['B', b]] as const)('%s uses one arc for object/angle display and leg assignment', (_, fixture) => {
    const input = saved(fixture); const original = JSON.stringify(input);
    const arcs = buildSearchEventArcs(input.markers.map(m => ({ id: m.id, lat: m.latitude, lng: m.longitude,
      t: Date.parse(m.created_at), distance_from_start: m.distance_from_start })),
    input.points.map(p => ({ ...p, t: Date.parse(p.timestamp) })));
    const map = buildTrackDetailMap(input);
    for (const marker of map.markers) expect(marker.distanceFromStart).toBeCloseTo(arcs[marker.id].arcM!, 6);
    const lateRight = map.markers.filter(m => m.angleKind === 'rechts').at(-1)!;
    expect(Math.abs(lateRight.distanceFromStart! - input.markers.find(m => m.id === lateRight.id)!.distance_from_start)).toBeGreaterThan(12);
    expect(JSON.stringify(input)).toBe(original);
    expect(map.markers).toHaveLength(fixture.markers.length); // No historical duplicate deletion.
  });
  it('falls back to stored metres when no usable line or coordinate exists', () => {
    const map = buildTrackDetailMap({ markers: [{ id: 'legacy', marker_type: 'winkel', angle_kind: 'rechts', distance_from_start: 23 }] });
    expect(map.markers[0].distanceFromStart).toBe(23);
  });
  it('does not turn an unknown angle location into a first-leg boundary', () => {
    const map = buildTrackDetailMap({ markers: [
      { id: 'unknown', marker_type: 'winkel', angle_kind: 'rechts' },
      { id: 'object', marker_type: 'gegenstand', distance_from_start: 23 },
    ] });
    expect(map.markers[1].legIndex).toBe(1);
  });
});

it('uses the recorded time axis at a return path instead of assigning a late marker to the start', () => {
  const xy = (y: number, time: number) => ({ latitude: y / 111320, longitude: 0, timestamp: new Date(T0 + time).toISOString() });
  const input = { points: [xy(0, 0), xy(10, 10000), xy(0, 20000)], markers: [
    { id: 'late', marker_type: 'winkel', angle_kind: 'links', latitude: 1 / 111320, longitude: 0,
      distance_from_start: 400, created_at: new Date(T0 + 19000).toISOString() },
  ] };
  expect(buildTrackDetailMap(input).markers[0].distanceFromStart).toBeCloseTo(19, 0);
});
it('does not count the unknown connecting path across a continuity break', () => {
  const input = { points: [
    { latitude: 0, longitude: 0 }, { latitude: 10 / 111320, longitude: 0 },
    { latitude: 100 / 111320, longitude: 0, breakBefore: true }, { latitude: 110 / 111320, longitude: 0 },
  ], markers: [{ id: 'after-gap', marker_type: 'gegenstand', latitude: 105 / 111320, longitude: 0, distance_from_start: 105 }] };
  expect(buildTrackDetailMap(input).markers[0].distanceFromStart).toBeCloseTo(15, 0);
});
