import { readFileSync } from 'fs';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';

const savedTrack = {
  distance_meters: 420,
  points: [
    { latitude: 47.0, longitude: 8.0, point_type: 'lay' },
    { latitude: 47.001, longitude: 8.001, point_type: 'lay' },
    { latitude: 47.002, longitude: 8.002, point_type: 'lay' },
    { latitude: 47.0025, longitude: 8.0025, point_type: 'search' },
  ],
  runs: [{ run_points: [
    { lat: 47.0, lng: 8.0 }, { lat: 47.0011, lng: 8.0009 }, { lat: 47.002, lng: 8.002 },
  ] }],
  markers: [
    { id: 1, marker_type: 'winkel', latitude: 47.0005, longitude: 8.0005, angle_kind: 'links', distance_from_start: 40 },
    { id: 2, marker_type: 'winkel', latitude: 47.0007, longitude: 8.0007, angle_kind: 'rechts', distance_from_start: 80 },
    { id: 3, marker_type: 'winkel', latitude: 47.0009, longitude: 8.0009, angle_kind: 'spitz_links', distance_from_start: 130 },
    { id: 4, marker_type: 'winkel', latitude: 47.0011, longitude: 8.0011, angle_kind: 'spitz_rechts', distance_from_start: 180 },
    { id: 5, marker_type: 'gegenstand', latitude: 47.0013, longitude: 8.0013, material: 'leder', distance_from_start: 210, note: 'Handschuh' },
    { id: 6, marker_type: 'gegenstand', latitude: 47.0015, longitude: 8.0015, material: 'duebel', distance_from_start: 300 },
  ],
};

describe('buildTrackDetailMap — Logbuch aus gespeicherten Daten', () => {
  const m = buildTrackDetailMap(savedTrack);

  it('zeigt laid und searched getrennt aus persistierten Daten', () => {
    expect(m.lay).toHaveLength(3);
    expect(m.run).toHaveLength(3);
    expect(m.hasLay).toBe(true);
    expect(m.hasRun).toBe(true);
  });

  it('Start, Ende und Gesamtdistanz kommen aus der gespeicherten Fährte', () => {
    expect(m.start).toEqual({ lat: 47.0, lng: 8.0 });
    expect(m.end).toEqual({ lat: 47.002, lng: 8.002 });
    expect(m.totalDistanceM).toBe(420);
  });

  it('erhält normale Winkel, Spitzwinkel, Gegenstände und Dübel vollständig', () => {
    expect(m.markers.map(x => x.angleKind).filter(Boolean)).toEqual(['links', 'rechts', 'spitz_links', 'spitz_rechts']);
    expect(m.markers[4]).toMatchObject({ type: 'gegenstand', material: 'leder', distanceFromStart: 210, note: 'Handschuh' });
    expect(m.markers[5]).toMatchObject({ type: 'gegenstand', material: 'duebel', distanceFromStart: 300 });
  });

  it('rechnet historische Winkel nicht neu', () => {
    const src = readFileSync('features/tracking/utils/trackDetailMap.ts', 'utf8');
    expect(src).not.toContain('detectCorners');
    expect(src).not.toContain('suggestAngleKind');
    expect(src).not.toContain('autoCornerDetection');
    expect(src).toContain('m.angle_kind');
  });
});
