import { readFileSync } from 'fs';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';

// Gespeicherte Fährte (Shape wie getTrackSessionById / buildLocalTrackDetail):
// gelegte Punkte (point_type='lay'), Absuche-Run (run_points), Marker mit
// persistiertem angle_kind / material / distance_from_start / note.
const savedTrack = {
  distance_meters: 420,
  points: [
    { latitude: 47.0, longitude: 8.0, point_type: 'lay' },
    { latitude: 47.001, longitude: 8.001, point_type: 'lay' },
    { latitude: 47.002, longitude: 8.002, point_type: 'lay' },
    // Ein Suchpunkt darf die gelegte Linie NICHT verunreinigen:
    { latitude: 47.0025, longitude: 8.0025, point_type: 'search' },
  ],
  runs: [{ run_points: [
    { lat: 47.0, lng: 8.0 }, { lat: 47.0011, lng: 8.0009 }, { lat: 47.002, lng: 8.002 },
  ] }],
  markers: [
    { id: 1, marker_type: 'winkel', latitude: 47.0005, longitude: 8.0005, angle_kind: 'links',        distance_from_start: 40 },
    { id: 2, marker_type: 'winkel', latitude: 47.0007, longitude: 8.0007, angle_kind: 'rechts',       distance_from_start: 80 },
    { id: 3, marker_type: 'winkel', latitude: 47.0009, longitude: 8.0009, angle_kind: 'spitz_links',  distance_from_start: 130 },
    { id: 4, marker_type: 'winkel', latitude: 47.0011, longitude: 8.0011, angle_kind: 'spitz_rechts', distance_from_start: 180 },
    { id: 5, marker_type: 'gegenstand', latitude: 47.0013, longitude: 8.0013, material: 'leder', distance_from_start: 210, note: 'Handschuh' },
    { id: 6, marker_type: 'gegenstand', latitude: 47.0015, longitude: 8.0015, material: 'duebel', distance_from_start: 300 },
  ],
};

describe('buildTrackDetailMap — Logbuch aus gespeicherten Daten', () => {
  const m = buildTrackDetailMap(savedTrack);

  it('gelegte Linie kommt nur aus point_type=lay (Suchpunkte ausgeschlossen)', () => {
    expect(m.lay).toHaveLength(3);
    expect(m.hasLay).toBe(true);
  });

  it('abgesuchte Linie kommt aus run_points; laid + search gleichzeitig vorhanden', () => {
    expect(m.run).toHaveLength(3);
    expect(m.hasRun).toBe(true);
    expect(m.lay.length).toBeGreaterThan(1);
    expect(m.run.length).toBeGreaterThan(1);
  });

  it('Start und Ende stammen aus den gelegten Endpunkten', () => {
    expect(m.start).toEqual({ lat: 47.0, lng: 8.0 });
    expect(m.end).toEqual({ lat: 47.002, lng: 8.002 });
  });

  it('normaler Winkel links/rechts wird 1:1 aus angle_kind gemappt', () => {
    expect(m.markers[0]).toMatchObject({ type: 'winkel', angleKind: 'links', distanceFromStart: 40 });
    expect(m.markers[1]).toMatchObject({ type: 'winkel', angleKind: 'rechts', distanceFromStart: 80 });
  });

  it('Spitzwinkel links/rechts werden 1:1 aus angle_kind gemappt', () => {
    expect(m.markers[2].angleKind).toBe('spitz_links');
    expect(m.markers[3].angleKind).toBe('spitz_rechts');
  });

  it('Gegenstand mit Material + Note wird gemappt', () => {
    expect(m.markers[4]).toMatchObject({ type: 'gegenstand', material: 'leder', distanceFromStart: 210, note: 'Handschuh' });
  });

  it('Dübel (material=duebel) bleibt erhalten', () => {
    const duebel = m.markers.find(x => x.material === 'duebel');
    expect(duebel).toBeTruthy();
    expect(duebel?.type).toBe('gegenstand');
  });

  it('kein Marker verloren, wenn eine Search-Session vorhanden ist', () => {
    expect(m.markers).toHaveLength(6);
  });

  it('Gesamtdistanz aus gespeichertem distance_meters', () => {
    expect(m.totalDistanceM).toBe(420);
  });

  it('leere/kaputte Eingabe → sichere Defaults', () => {
    const empty = buildTrackDetailMap(null);
    expect(empty.lay).toEqual([]);
    expect(empty.start).toBeNull();
    expect(empty.end).toBeNull();
    expect(empty.markers).toEqual([]);
  });

  it('KEINE Winkel-Neuberechnung: Mapping importiert keine Corner-/Angle-Detektion', () => {
    const src = readFileSync('features/tracking/utils/trackDetailMap.ts', 'utf8');
    expect(src).not.toContain('detectCorners');
    expect(src).not.toContain('suggestAngleKind');
    expect(src).not.toContain('autoCornerDetection');
    // angle_kind wird direkt übernommen (kein Re-Klassifizieren):
    expect(src).toContain('m.angle_kind');
  });
});
