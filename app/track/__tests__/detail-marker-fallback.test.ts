/**
 * Detail-Screen Marker-Fallback: Remote authoritative; Remote 0 + lokal vorhanden →
 * lokal; keine Duplikate; beide leer → leer. Plus Verdrahtung in app/track/[id].tsx.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildLocalTrackDetail, pickDetailMarkers } from '@/features/tracking/utils/localTrackDetail';

const R1 = { id: 'r1', marker_type: 'winkel', angle_kind: 'rechts' };
const R2 = { id: 'r2', marker_type: 'winkel', angle_kind: 'spitz_rechts' };
const L1 = { id: 'mk_1', marker_type: 'winkel', angle_kind: 'rechts' };
const L2 = { id: 'mk_2', marker_type: 'winkel', angle_kind: 'spitz_rechts' };

describe('pickDetailMarkers', () => {
  it('Remote vorhanden → Remote (authoritative), lokale werden ignoriert', () => {
    expect(pickDetailMarkers([R1, R2], [L1, L2])).toEqual([R1, R2]);
    expect(pickDetailMarkers([R1], [L1, L2])).toEqual([R1]);
  });
  it('Remote 0 + lokal vorhanden → lokale Marker (Fall qa-0ec8c4ca: 2 Winkel lokal, remote 0)', () => {
    expect(pickDetailMarkers([], [L1, L2])).toEqual([L1, L2]);
    expect(pickDetailMarkers(null, [L1, L2])).toEqual([L1, L2]);
  });
  it('keine Duplikate innerhalb der gewählten Quelle (stabile id)', () => {
    expect(pickDetailMarkers([R1, R1, R2], [])).toEqual([R1, R2]);
    expect(pickDetailMarkers([], [L1, L1])).toEqual([L1]);
  });
  it('beide leer → leer', () => {
    expect(pickDetailMarkers([], [])).toEqual([]);
    expect(pickDetailMarkers(undefined, null)).toEqual([]);
  });
});

describe('app/track/[id].tsx Verdrahtung', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '[id].tsx'), 'utf8').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  it('nur bei Remote-Session ohne Marker wird lokal nachgeladen; Auswahl über pickDetailMarkers', () => {
    expect(src).toContain('if (d && !localOnly && !(d.markers?.length)) {');
    expect(src).toContain('const picked = pickDetailMarkers(d.markers ?? [], local?.markers ?? []);');
    expect(src).toContain('if (picked.length > 0) d = { ...d, markers: picked };');
  });
  it('lokale Marker haben denselben Row-Shape wie track_markers (angle_kind/material/marker_type)', () => {
    const local = buildLocalTrackDetail({ local_id: 'session', payload_json: '{}' } as never, [], [{
      local_id: 'marker', marker_type: 'winkel', latitude: 47, longitude: 8, angle_kind: 'rechts',
      material: null, distance_from_start: 20, created_at: '2026-10-11T00:00:00.000Z',
    }] as never);
    expect(local.markers[0]).toMatchObject({ id: 'marker', marker_type: 'winkel', latitude: 47, longitude: 8,
      angle_kind: 'rechts', material: null, distance_from_start: 20 });
  });
});
