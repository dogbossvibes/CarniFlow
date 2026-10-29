import a from './fixtures/field20261029/build55.json';
import b from './fixtures/field20261029/build56.json';
import { buildTrackDetailMap } from '../trackDetailMap';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns } from '../turnFusion';

const ll = (p: { x: number; y: number }) => ({ lat: p.y / 111320, lng: p.x / 111320 });
it.each([['55', a], ['56', b]] as const)('build %s export has both geometries and all three objects in the detail model', (_, f) => {
  // Adapter for anonymized export only, NOT a claim about the device's database rows.
  const data = {
    points: f.points.map(p => ({ latitude: ll(p).lat, longitude: ll(p).lng, point_type: 'lay' })),
    markers: f.markers.map((m, i) => ({ id: String(i), marker_type: m.type, angle_kind: m.angleKind, material: m.material,
      latitude: ll(m).lat, longitude: ll(m).lng, distance_from_start: m.atM })),
    runs: [{ run_points: f.searchGeometry.run.map(p => ({ ...ll(p), t: p.tSec })) }],
    track_data: { run: { replay_points: f.searchGeometry.replay.map(p => ({ ...ll(p), t: p.tSec })) } },
  };
  const before = JSON.stringify(data);
  const map = buildTrackDetailMap(data);
  expect(map.hasLay).toBe(true); expect(map.hasRun).toBe(true);
  expect(map.markers.filter(m => m.type === 'gegenstand').map(m => m.objectIndex)).toEqual([1, 2, 3]);
  expect(map.run).toHaveLength(f.searchGeometry.replay.length);
  expect(JSON.stringify(data)).toBe(before);
});
it.each([['55', a], ['56', b]] as const)('reports GPS-only replay separately from observed build %s events', (name, f) => {
  const result = fuseTurns(capturedDetectorBuffer(f.detectorPoints));
  // No fabricated IMU context or guessed timestamps for the intended corners.
  expect(result.corners.map(c => c.kind)).toEqual(name === '55' ? [] : ['rechts', 'links']);
  expect(result.corners.some(c => c.kind === 'spitz_rechts' || c.kind === 'spitz_links')).toBe(false);
});
