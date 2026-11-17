import { Alert } from 'react-native';
import { readFileSync } from 'fs';
import { carryForeignLaidMarker, isForeignLaidGroupTrack, readForeignLaidMarker, withoutForeignLaidLine } from '../foreignLaidLine';
import { backfillForeignLaidMarker } from '../foreignLaidSync';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { buildTrackUserExport, trackExportGpx } from '@/features/tracking/utils/trackUserExport';
import { refreshTrainerShareCopies, shareTrackWithHomeZone } from '@/features/home-zone/trainerShare';

// Regression (Review zur OTA mit PR #164): Die Fährtenansicht lädt zuerst die SERVER-Zeile.
// Deren track_data trug die Markierung nicht; der Schutz der gelegten Linie griff deshalb nach dem Sync nicht.
const mockShare = jest.fn(), mockUpdateCopy = jest.fn();
jest.mock('@/services/trackShareService', () => ({
  shareTrack: (...args: unknown[]) => mockShare(...args),
  updateTrackShareCopy: (...args: unknown[]) => mockUpdateCopy(...args),
  isShareCopyUnsupported: (error: { code?: string } | null) => error?.code === 'PGRST204',
}));
jest.mock('@/features/home-zone/store', () => ({ loadHomeZones: async () => [], localTrackTouchesHomeZone: jest.fn() }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) => `digest:${value.length}:${value.includes('laidLineWithheld')}` }));
const mockRow: { value: unknown; error: unknown } = { value: null, error: null };
const mockRowUpdate = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockRow.value, error: mockRow.error }) }) }) }),
  update: (patch: unknown) => { mockRowUpdate(patch); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
}) } }));

const LAID = /46\.9\d|7\.4\d/;
const marker = { version: 1, trackId: '50000000-0000-4000-8000-000000000001', blind: false };
const runPoints = [{ lat: 47.5001, lng: 8.5001, t: 0 }, { lat: 47.5009, lng: 8.5014, t: 5 }];
const run = { run_id: 'run-1', duration_seconds: 600, articles_found: 2, total_objects: 3, run_points: runPoints };
/** So kommt die Fährte vom Server: ohne Markierung in track_data. */
const serverDetail = {
  id: 'sess-1', owner_id: 'handler', dog_id: 'dog', type: 'track', status: 'completed', session_date: '2026-11-16',
  distance_meters: 175, latitude: 46.9001, longitude: 7.4001,
  points: [{ latitude: 46.9001, longitude: 7.4001, point_type: 'lay' }, { latitude: 46.9012, longitude: 7.4015, point_type: 'lay' }],
  markers: [{ id: 'm1', marker_type: 'gegenstand', latitude: 46.9007, longitude: 7.4007 }],
  runs: [{ id: 'run-1', ...run }], track_data: { segments: [{ startLat: 46.9001, startLng: 7.4001 }], run: { run_id: 'run-1' } },
};
const local = { local_id: 'sess-1', user_id: 'handler', dog_id: 'dog', started_at: '2026-11-16T10:00:00.000Z', created_at: '2026-11-16T10:00:00.000Z',
  payload_json: JSON.stringify({ groupTrack: marker, run }) };
const localDetail = () => buildLocalTrackDetail(local as never, [], []);
const share = (extra: object) => ({ id: 's1', track_id: 'sess-1', owner_user_id: 'handler', trainer_user_id: 'tr', shared_at: '', revoked_at: null, ...extra });

beforeEach(() => {
  jest.clearAllMocks(); mockRow.value = null; mockRow.error = null;
  mockShare.mockResolvedValue({ data: { id: 's1' }, error: null });
  mockUpdateCopy.mockResolvedValue({ error: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Server-Zeile ohne Markierung + lokale Kopie mit Markierung', () => {
  it('die Server-Zeile allein wird nicht erkannt (das war der Fehler)', () => {
    expect(isForeignLaidGroupTrack(serverDetail)).toBe(false);
  });
  it('die Markierung der lokalen Kopie wird auf das geladene Detail übertragen, ohne die Eingabe zu ändern', () => {
    const before = JSON.stringify(serverDetail);
    const marked = carryForeignLaidMarker(serverDetail, localDetail());
    expect(isForeignLaidGroupTrack(marked)).toBe(true);
    expect(readForeignLaidMarker(marked)).toEqual(marker);
    expect(marked.track_data).toMatchObject({ segments: serverDetail.track_data.segments, run: { run_id: 'run-1' } });
    expect(JSON.stringify(serverDetail)).toBe(before);
  });
  it('ohne lokale Kopie, bei eigener Fährte und bei bereits markiertem Detail bleibt alles gleich (gleiche Referenz)', () => {
    expect(carryForeignLaidMarker(serverDetail, null)).toBe(serverDetail);
    expect(carryForeignLaidMarker(serverDetail, buildLocalTrackDetail({ ...local, payload_json: JSON.stringify({ run }) } as never, [], []))).toBe(serverDetail);
    const marked = carryForeignLaidMarker(serverDetail, localDetail());
    expect(carryForeignLaidMarker(marked, localDetail())).toBe(marked);
  });
  it('Export aus der Server-Zeile: ohne gelegte Linie', () => {
    const marked = carryForeignLaidMarker(serverDetail, localDetail());
    const exported = buildTrackUserExport(withoutForeignLaidLine(marked), '2026-11-17T08:00:00.000Z');
    expect(exported.reference).toEqual([]);
    expect(exported.markers).toEqual([]);
    expect(exported.search.flat()).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toMatch(LAID);
    expect(trackExportGpx(exported)).not.toMatch(LAID);
    // Gegenprobe: genau das ging vorher hinaus.
    expect(JSON.stringify(buildTrackUserExport(withoutForeignLaidLine(serverDetail), '2026-11-17T08:00:00.000Z'))).toMatch(LAID);
  });
  it('Trainer-Freigabe aus der Server-Zeile (ohne Heimzone): Kopie ohne gelegte Linie', async () => {
    await shareTrackWithHomeZone('sess-1', 'tr', carryForeignLaidMarker(serverDetail, localDetail()));
    const copy = mockShare.mock.calls[0][2];
    expect(copy.copy.laidLineWithheld).toBe(true);
    expect(copy.copy.points).toEqual([]);
    expect(JSON.stringify(copy.copy)).not.toMatch(LAID);
  });
});

describe('Abgleich bestehender Freigaben', () => {
  it('eine Kopie ohne gelegte Linie wird nie auf das Original zurückgesetzt, auch wenn das Detail keine Markierung trägt', async () => {
    await refreshTrainerShareCopies(serverDetail, [share({ shared_copy: { laidLineWithheld: true, points: [] }, shared_copy_digest: 'digest:alt' })] as never);
    expect(mockUpdateCopy).not.toHaveBeenCalled();
  });
  it('mit Markierung bleibt die Kopie beim wiederholten Öffnen stabil', async () => {
    const marked = carryForeignLaidMarker(serverDetail, localDetail());
    await refreshTrainerShareCopies(marked, [share({ shared_copy: null, shared_copy_digest: null })] as never);
    expect(mockUpdateCopy).toHaveBeenCalledTimes(1);
    const copy = mockUpdateCopy.mock.calls[0][1];
    expect(copy.copy.laidLineWithheld).toBe(true);
    mockUpdateCopy.mockClear();
    await refreshTrainerShareCopies(marked, [share({ shared_copy: copy.copy, shared_copy_digest: copy.digest })] as never);
    expect(mockUpdateCopy).not.toHaveBeenCalled();
  });
  it('gewöhnliche Heimzonen-Kopie einer eigenen Fährte wird wie bisher entfernt, wenn sie nicht mehr nötig ist', async () => {
    await refreshTrainerShareCopies({ ...serverDetail }, [share({ shared_copy: { homeZoneApplied: true }, shared_copy_digest: 'digest:zone' })] as never);
    expect(mockUpdateCopy).toHaveBeenCalledWith('s1', null);
  });
});

describe('Markierung auf dem Server nachtragen (Fährten von vor dem Sync-Nachtrag)', () => {
  it('ergänzt nur den Schlüssel, alle vorhandenen Felder bleiben', async () => {
    mockRow.value = { track_data: { segments: [1], run: { run_id: 'run-1' }, legs: [2], score: 90 } };
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('written');
    expect(mockRowUpdate).toHaveBeenCalledWith({ track_data: { segments: [1], run: { run_id: 'run-1' }, legs: [2], score: 90, groupTrack: marker } });
  });
  it('schreibt nichts, wenn die Markierung schon da ist, die Zeile fehlt, das Lesen scheitert oder die Form unerwartet ist', async () => {
    mockRow.value = { track_data: { groupTrack: marker } };
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('present');
    mockRow.value = null;
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('skipped');
    mockRow.value = { track_data: {} }; mockRow.error = { message: 'offline' };
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('skipped');
    mockRow.error = null; mockRow.value = { track_data: [1, 2] };
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('skipped');
    expect(mockRowUpdate).not.toHaveBeenCalled();
  });
  it('Zeile ohne track_data: Markierung wird angelegt', async () => {
    mockRow.value = { track_data: null };
    expect(await backfillForeignLaidMarker('sess-1', 'handler', marker)).toBe('written');
    expect(mockRowUpdate).toHaveBeenCalledWith({ track_data: { groupTrack: marker } });
  });
});

describe('Fährtenansicht (Quelltext-Vertrag)', () => {
  const source = readFileSync('app/track/[id].tsx', 'utf8');
  it('überträgt die Markierung der lokalen Kopie, bevor das Detail gesetzt wird', () => {
    const carry = source.indexOf('carryForeignLaidMarker(d, localDisplay)');
    expect(carry).toBeGreaterThan(-1);
    expect(carry).toBeLessThan(source.indexOf('setData(d);'));
    expect(carry).toBeGreaterThan(source.indexOf("getLocalTrackDetail(id, userId, { ownedOnly: true })"));
  });
  it('Export, Freigabe, Abgleich und «Fährten gemeinsam» hängen am selben, markierten Detail', () => {
    expect(source).toContain('const foreignLaid = isOwnTrack && isForeignLaidGroupTrack(data);');
    expect(source).toContain('shareTrackWithHomeZone(String(id), trainerId, data)');
    expect(source).toContain('refreshTrainerShareCopies(data, own)');
    expect(source).toContain('!foreignLaid && <ExchangeEntry');
  });
});
