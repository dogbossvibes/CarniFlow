import { buildSharedTrackCopy, findHomeZoneCoordinates, SHARED_COPY_MAX_CHARS } from '../sharedCopy';
import { insideHomeZone, type HomeZone } from '../zones';

const zone: HomeZone = { id: 'home', lat: 47, lng: 8, radiusM: 200 };
const point = (latitude: number, i: number) => ({ id: `p${i}`, latitude, longitude: 8, point_type: 'lay', timestamp: `2026-11-16T10:00:0${i}.000Z`,
  payload_json: JSON.stringify({ raw: { lat: latitude, lng: 8 } }) });
// Form wie getTrackSessionById: Sitzung + Punkte + Marker + Absuchen + Engine.
const detail = () => ({
  id: 'track-1', owner_id: 'owner', dog_id: 'dog', type: 'track', status: 'completed', notes: 'Notiz', distance_meters: 480,
  latitude: 47.0001, longitude: 8, location_name: 'Musterweg 1', session_date: '2026-11-16',
  points: [47.0002, 47.0010, 47.0030, 47.0040].map(point),
  markers: [
    { id: 'm1', marker_type: 'gegenstand', material: 'holz', latitude: 47.0003, longitude: 8 },
    { id: 'm2', marker_type: 'gegenstand', material: 'leder', latitude: 47.0035, longitude: 8 },
  ],
  runs: [{ id: 'r1', duration_seconds: 300, run_points: [{ lat: 47.0040, lng: 8, t: 0 }, { lat: 47.0030, lng: 8, t: 20 }, { lat: 47.0005, lng: 8, t: 40 }] }],
  engine: { average_accuracy: 4, start_lat: 47.0002, start_lng: 8 },
  track_data: {
    segments: [{ id: 's1', start: { lat: 47.0002, lng: 8 }, end: { lat: 47.0030, lng: 8 }, lengthM: 310 }],
    manualAngleGeometry: [{ apexLat: 47.0008, apexLng: 8, kind: 'bw' }, { apexLat: 47.0036, apexLng: 8, kind: 'ow' }],
    run: { run_id: 'r1', analytics: { trackScore: 82, deviation: { meanM: 1.2 }, objects: [{ lat: 47.0003, lng: 8, material: 'holz' }] },
      replay_points: [{ lat: 47.0004, lng: 8 }, { lat: 47.0038, lng: 8 }] },
  },
});

describe('gekürzte Kopie für Trainer-Freigaben', () => {
  it('enthält auf keinem Pfad eine Koordinate innerhalb der Zone', () => {
    const source = detail();
    expect(findHomeZoneCoordinates(source, [zone])).toBeGreaterThan(8);
    const built = buildSharedTrackCopy(source, [zone])!;
    expect(findHomeZoneCoordinates(built.copy, [zone])).toBe(0);
    expect(findHomeZoneCoordinates(JSON.parse(built.json), [zone])).toBe(0);
    expect(built.json).not.toContain('47.0002');
    expect(built.json).not.toContain('Musterweg');
    expect(built.allRemoved).toBe(false);
  });

  it('behält alles ausserhalb der Zone und die Kennzahlen', () => {
    const copy = buildSharedTrackCopy(detail(), [zone])!.copy as ReturnType<typeof detail> & { homeZoneApplied: boolean };
    expect(copy.points.map(p => p.latitude)).toEqual([47.0030, 47.0040]);
    expect(copy.points[0]).toMatchObject({ breakBefore: true });
    expect(copy.markers.map(m => m.id)).toEqual(['m2']);
    expect(copy.runs[0].run_points.map(p => p.lat)).toEqual([47.0040, 47.0030]);
    expect(copy.runs[0].duration_seconds).toBe(300);
    expect(copy.track_data.run.analytics).toMatchObject({ trackScore: 82, deviation: { meanM: 1.2 }, objects: [] });
    expect(copy.track_data.manualAngleGeometry).toEqual([{ apexLat: null, apexLng: null, kind: 'bw' }, { apexLat: 47.0036, apexLng: 8, kind: 'ow' }]);
    expect(copy.track_data.segments[0]).toMatchObject({ start: { lat: null, lng: null }, end: { lat: 47.0030, lng: 8 }, lengthM: 310 });
    expect(copy).toMatchObject({ latitude: null, longitude: null, location_name: null, notes: 'Notiz', distance_meters: 480, homeZoneApplied: true });
    expect(copy.points.every(p => !insideHomeZone({ lat: p.latitude, lng: p.longitude }, [zone]))).toBe(true);
  });

  it('lässt die Eingabe unverändert', () => {
    const source = detail(), snapshot = JSON.stringify(source);
    buildSharedTrackCopy(source, [zone]);
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('erzeugt keine Kopie ohne Zone oder ohne Berührung', () => {
    expect(buildSharedTrackCopy(detail(), [])).toBeNull();
    expect(buildSharedTrackCopy(detail(), [{ ...zone, lat: 48 }])).toBeNull();
    expect(buildSharedTrackCopy(null, [zone])).toBeNull();
  });

  it('meldet eine Fährte ganz in der Zone: Kennzahlen bleiben, Koordinaten fehlen', () => {
    const built = buildSharedTrackCopy(detail(), [{ ...zone, radiusM: 1000 }])!;
    const copy = built.copy as ReturnType<typeof detail>;
    expect(built.allRemoved).toBe(true);
    expect(copy.points).toEqual([]);
    expect(copy.markers).toEqual([]);
    expect(copy.distance_meters).toBe(480);
  });

  it('ist stabil: gleiche Eingabe ergibt gleiches JSON', () => {
    expect(buildSharedTrackCopy(detail(), [zone])!.json).toBe(buildSharedTrackCopy(detail(), [zone])!.json);
  });

  it('verweigert zu grosse Kopien', () => {
    const big = { ...detail(), notes: 'x'.repeat(SHARED_COPY_MAX_CHARS) };
    expect(() => buildSharedTrackCopy(big, [zone])).toThrow('shared-copy-too-large');
  });
});
