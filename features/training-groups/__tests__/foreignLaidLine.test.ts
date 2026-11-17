import { FOREIGN_LAID_KEY, isForeignLaidGroupTrack, isForeignLaidPayload, searchOnlyDetail, withoutForeignLaidLine } from '../foreignLaidLine';
import { GROUP_TRACK_KEY } from '../blindSearch';
import { buildTrackUserExport, trackExportGpx } from '@/features/tracking/utils/trackUserExport';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { buildReviewSections } from '@/features/track-sharing/reviewData';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';

jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => { throw new Error('no db in test'); } }));

// Gelegte Linie der Leger:in bei 46.9xxx / 7.4xxx, Absuche der Hundeführer:in bei 47.5xxx / 8.5xxx:
// so lässt sich im Ergebnis eindeutig prüfen, dass keine gelegte Koordinate übrig bleibt.
const LAID = /46\.9\d|7\.4\d/;
const marker = { version: 1, trackId: '50000000-0000-4000-8000-000000000001', blind: false };
const run = { run_id: 'run-1', started_at: '2026-11-16T10:30:00.000Z', duration_seconds: 600, distance_meters: 180,
  articles_found: 2, total_objects: 3, average_deviation_meters: 4.5, breaks: 1,
  run_points: [{ lat: 47.5001, lng: 8.5001, t: 0 }, { lat: 47.5009, lng: 8.5014, t: 5, breakBefore: true }],
  replay_points: [{ lat: 46.9001, lng: 7.4001, t: 0 }, { lat: 46.9002, lng: 7.4002, t: 5 }],
  analytics: { trackScore: 88, deviation: { meanM: 4.5 }, corners: [{ atM: 60, overshootM: 2, lat: 46.9005, lng: 7.4005 }],
    objects: [{ id: 'o1', material: 'holz', latitude: 46.9007, longitude: 7.4007, state: 'likely_contact' }],
    referencePoints: [{ lat: 46.9001, lng: 7.4001 }] },
  object_snapshot: { version: 1, objects: [{ id: 'o1', index: 0, material: 'holz', recordedStatus: 'manual_found', lat: 46.9007, lng: 7.4007 }] } };
const detail = {
  id: 'local-1', owner_id: 'handler', dog_id: 'dog', dog: { name: 'Luna' }, type: 'track', status: 'completed',
  session_date: '2026-11-16', started_at: '2026-11-16T10:00:00.000Z', distance_meters: 175, articles_found: 2, articles_total: 3,
  notes: 'eigene Notiz', latitude: 46.9001, longitude: 7.4001, location_name: 'Waldrand 46.9', laying_duration_seconds: 300,
  points: [{ latitude: 46.9001, longitude: 7.4001, point_type: 'lay', timestamp: '2026-11-16T10:00:00.000Z' },
    { latitude: 46.9012, longitude: 7.4015, point_type: 'lay', timestamp: '2026-11-16T10:05:00.000Z' }],
  markers: [{ id: 'm1', marker_type: 'gegenstand', material: 'holz', latitude: 46.9007, longitude: 7.4007 }],
  runs: [{ id: 'run-1', ...run }],
  track_data: { [GROUP_TRACK_KEY]: marker, run, segments: [{ startLat: 46.9001, startLng: 7.4001 }],
    manualAngleGeometry: [{ apexLat: 46.9005, apexLng: 7.4005 }], layContinuity: { version: 1, breakBeforeTimestamps: [] } },
};
const own = { ...detail, track_data: { run } };

describe('Erkennen einer fremd gelegten Gruppenfährte', () => {
  it('gleicher Schlüssel wie die Markierung beim Übernehmen', () => { expect(FOREIGN_LAID_KEY).toBe(GROUP_TRACK_KEY); });
  it('übernommene Gruppenfährte: ja; eigene Fährte, eigene Gruppenfährte und kaputte Markierung: nein', () => {
    expect(isForeignLaidGroupTrack(detail)).toBe(true);
    expect(isForeignLaidGroupTrack({ [GROUP_TRACK_KEY]: marker })).toBe(true);
    expect(isForeignLaidGroupTrack(own)).toBe(false);
    expect(isForeignLaidGroupTrack({ track_data: { [GROUP_TRACK_KEY]: { version: 2, trackId: 'x' } } })).toBe(false);
    expect(isForeignLaidGroupTrack(null)).toBe(false);
    expect(isForeignLaidPayload(JSON.stringify({ [GROUP_TRACK_KEY]: marker }))).toBe(true);
    expect(isForeignLaidPayload('{kaputt')).toBe(false);
    expect(isForeignLaidPayload(null)).toBe(false);
  });
  it('das lokale Fährtendetail trägt die Markierung, ohne die gespeicherte Fährte zu ändern', () => {
    const local = { local_id: 'local-1', user_id: 'handler', dog_id: 'dog', started_at: '2026-11-16T10:00:00.000Z', created_at: '2026-11-16T10:00:00.000Z',
      payload_json: JSON.stringify({ [GROUP_TRACK_KEY]: marker, run }) };
    const before = local.payload_json;
    expect(isForeignLaidGroupTrack(buildLocalTrackDetail(local as never, [], []))).toBe(true);
    expect(isForeignLaidGroupTrack(buildLocalTrackDetail({ ...local, payload_json: JSON.stringify({ run }) } as never, [], []))).toBe(false);
    expect(local.payload_json).toBe(before);
  });
});

describe('Kopie nur mit Absuche und Kennzahlen', () => {
  it('enthält keine Koordinate der gelegten Linie, auch nicht in Kennzahlen, Markern oder Abschnitten', () => {
    const copy = searchOnlyDetail(detail);
    expect(JSON.stringify(copy)).not.toMatch(LAID);
    expect(copy.points).toEqual([]);
    expect(copy.markers).toEqual([]);
    expect(copy).not.toHaveProperty('latitude');
    expect(copy).not.toHaveProperty('location_name');
    expect(copy).not.toHaveProperty('laying_duration_seconds');
    expect(copy.track_data).not.toHaveProperty('segments');
    expect(copy.track_data).not.toHaveProperty('manualAngleGeometry');
    expect(copy.track_data).not.toHaveProperty(GROUP_TRACK_KEY);
    expect(copy.laidLineWithheld).toBe(true);
  });
  it('behält Absuchelinie, Kennzahlen und eigene Notiz', () => {
    const copy = searchOnlyDetail(detail) as { runs: { run_points: unknown[] }[]; track_data: { run: Record<string, any> } } & Record<string, unknown>;
    expect(copy.runs[0].run_points).toEqual(run.run_points);
    expect(copy.track_data.run.run_points).toEqual(run.run_points);
    expect(copy.track_data.run.analytics.trackScore).toBe(88);
    expect(copy.track_data.run.analytics.corners[0]).toEqual({ atM: 60, overshootM: 2 });
    expect(copy.track_data.run.analytics.objects[0]).toEqual({ id: 'o1', material: 'holz', state: 'likely_contact' });
    expect(copy.track_data.run.object_snapshot.objects[0].recordedStatus).toBe('manual_found');
    expect(copy).toMatchObject({ distance_meters: 175, articles_found: 2, articles_total: 3, notes: 'eigene Notiz', dog: { name: 'Luna' } });
  });
  it('verändert die Eingabe nicht', () => {
    const before = JSON.stringify(detail);
    searchOnlyDetail(detail);
    expect(JSON.stringify(detail)).toBe(before);
  });
  it('eigene Fährten bleiben unverändert (gleiche Referenz)', () => {
    expect(withoutForeignLaidLine(own)).toBe(own);
    expect(withoutForeignLaidLine(detail)).not.toBe(detail);
  });
});

describe('Wege, die die Kopie verwenden', () => {
  it('Export (JSON, GPX): nur die Absuche, keine gelegte Linie, keine Marker', () => {
    const exported = buildTrackUserExport(searchOnlyDetail(detail), '2026-11-17T08:00:00.000Z', true);
    expect(exported.reference).toEqual([]);
    expect(exported.markers).toEqual([]);
    expect(exported.search.flat()).toHaveLength(2);
    expect(exported.summary).toMatchObject({ found: 2, total: 3 });
    expect(JSON.stringify(exported)).not.toMatch(LAID);
    expect(trackExportGpx(exported)).not.toMatch(LAID);
    expect(trackExportGpx(exported)).toContain('47.5001');
    // Gegenprobe: ohne die Kopie stünde die gelegte Linie im Export.
    expect(JSON.stringify(buildTrackUserExport(detail, '2026-11-17T08:00:00.000Z'))).toMatch(LAID);
  });
  it('Trainer-Ansicht: Karte nur mit Absuche, Kennzahlen bleiben lesbar', () => {
    const map = buildTrackDetailMap(searchOnlyDetail(detail));
    expect(map.hasLay).toBe(false);
    expect(map.hasRun).toBe(true);
    expect(map.markers).toEqual([]);
    expect(map.start).toBeNull();
    expect(JSON.stringify(map)).not.toMatch(LAID);
    const rows = buildReviewSections(searchOnlyDetail(detail)).flatMap(section => section.rows);
    expect(rows.find(row => row.label === 'Distanz')?.value).toBe('175.0 m');
    expect(JSON.stringify(rows)).not.toMatch(LAID);
  });
});
