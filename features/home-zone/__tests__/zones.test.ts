import { applyHomeZones, insideHomeZone, parseHomeZones, touchesHomeZoneDeep, type HomeZone } from '../zones';
import { buildTrackUserExport, trackExportGpx } from '@/features/tracking/utils/trackUserExport';

// Zone um den Ursprung der Testfährte. 0.001° Breite ≈ 111 m.
const zone: HomeZone = { id: 'home', lat: 47, lng: 8, radiusM: 200 };
const lay = (lat: number, i: number) => ({ latitude: lat, longitude: 8, point_type: 'lay', timestamp: `2026-11-16T10:00:${String(i).padStart(2, '0')}.000Z` });
const session = {
  id: 's1', dog_id: 'd1', dog: { name: 'Testhund' }, session_date: '2026-11-16',
  // Start im Haus, dann nach Norden aus der Zone hinaus.
  points: [47.0000, 47.0005, 47.0010, 47.0015, 47.0025, 47.0035, 47.0045].map(lay),
  markers: [
    { marker_type: 'gegenstand', material: 'holz', latitude: 47.0004, longitude: 8 },
    { marker_type: 'gegenstand', material: 'leder', latitude: 47.0040, longitude: 8 },
  ],
  runs: [{ id: 'r1', started_at: '2026-11-16T11:00:00.000Z', run_points: [
    { lat: 47.0044, lng: 8, t: 0 }, { lat: 47.0030, lng: 8, t: 30 }, { lat: 47.0012, lng: 8, t: 60 }, { lat: 47.0002, lng: 8, t: 90 },
  ] }],
  track_data: {},
};
const coordinates = (gpx: string) => [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(m => ({ lat: Number(m[1]), lng: Number(m[2]) }));

describe('Heimzone', () => {
  it('GPX der geteilten Kopie enthält keine Koordinate innerhalb der Zone', () => {
    const original = buildTrackUserExport(session, '2026-11-16T12:00:00.000Z');
    const before = coordinates(trackExportGpx(original));
    expect(before.some(p => insideHomeZone(p, [zone]))).toBe(true);

    const { data, effect } = applyHomeZones(original, [zone]);
    const after = coordinates(trackExportGpx(data));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(p => !insideHomeZone(p, [zone]))).toBe(true);
    expect(JSON.stringify(data)).not.toContain('47.0005');
    expect(effect).toMatchObject({ removedPoints: 6, removedMarkers: 1, allRemoved: false });
    expect(effect.removedMeters).toBeGreaterThan(300);
    expect(data.homeZoneApplied).toBe(true);
    // Verbleibender Gegenstand behält seine ursprüngliche Nummer.
    expect(data.markers.map(m => m.label)).toEqual(['G2']);
  });

  it('lässt das Original unverändert', () => {
    const original = buildTrackUserExport(session, '2026-11-16T12:00:00.000Z');
    const snapshot = JSON.stringify(original);
    applyHomeZones(original, [zone]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('ohne Zone oder ohne Berührung bleibt der Export identisch', () => {
    const original = buildTrackUserExport(session, '2026-11-16T12:00:00.000Z');
    expect(applyHomeZones(original, []).data).toBe(original);
    const far = applyHomeZones(original, [{ ...zone, lat: 48 }]);
    expect(far.data).toBe(original);
    expect(far.data.homeZoneApplied).toBeUndefined();
  });

  it('trennt die Linie, wenn zwei Aussenpunkte durch die Zone verbunden wären', () => {
    const through = { ...session, markers: [], runs: [], points: [46.9970, 46.9975, 47.0025, 47.0030].map(lay) };
    const { data, effect } = applyHomeZones(buildTrackUserExport(through, '2026-11-16T12:00:00.000Z'), [zone]);
    expect(data.reference.map(part => part.length)).toEqual([2, 2]);
    expect(effect.removedPoints).toBe(0);
    expect(effect.removedMeters).toBeGreaterThan(500);
  });

  it('meldet eine Fährte, die ganz in der Zone liegt', () => {
    const inside = { ...session, runs: [], markers: [session.markers[0]], points: [47.0000, 47.0005, 47.0010].map(lay) };
    const { data, effect } = applyHomeZones(buildTrackUserExport(inside, '2026-11-16T12:00:00.000Z'), [zone]);
    expect(effect.allRemoved).toBe(true);
    expect(coordinates(trackExportGpx(data))).toEqual([]);
  });

  it('berücksichtigt mehrere Zonen und die GPS-Ungenauigkeit', () => {
    const second: HomeZone = { id: 'b', lat: 47.0035, lng: 8, radiusM: 200 };
    const { effect } = applyHomeZones(buildTrackUserExport(session, '2026-11-16T12:00:00.000Z'), [zone, second]);
    expect(effect.allRemoved).toBe(true);
    const edge = { lat: 47.0020, lng: 8 }; // ≈ 222 m
    expect(insideHomeZone(edge, [zone])).toBe(false);
    expect(insideHomeZone(edge, [zone], 30)).toBe(true);
  });

  it('findet Koordinaten in Paketen beider Schreibweisen', () => {
    expect(touchesHomeZoneDeep({ reference: { points: [{ lat: 47.0001, lng: 8, t: 1 }] } }, [zone])).toBe(true);
    expect(touchesHomeZoneDeep({ markers: [{ latitude: 47.0001, longitude: 8 }] }, [zone])).toBe(true);
    expect(touchesHomeZoneDeep({ points: [{ lat: 47.01, lng: 8 }] }, [zone])).toBe(false);
    expect(touchesHomeZoneDeep({ points: [{ lat: 47.0001, lng: 8 }] }, [])).toBe(false);
  });

  it('verwirft ungültige gespeicherte Zonen', () => {
    expect(parseHomeZones([zone, { id: 'x', lat: 200, lng: 8, radiusM: 300 }, { id: '', lat: 1, lng: 1, radiusM: 300 }, null, { id: 'y', lat: 1, lng: 1, radiusM: 10 }])).toEqual([zone]);
    expect(parseHomeZones('kaputt')).toEqual([]);
  });
});
