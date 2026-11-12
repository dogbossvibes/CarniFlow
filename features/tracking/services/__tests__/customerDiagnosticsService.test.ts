// Kunden-Diagnose teilen (I/O): Capture bevorzugt, sonst aus SQLite, sonst aus dem
// geladenen Detail; nichts → verständlich „none"/„missing"; Share-Abbruch/-Fehler sauber.
import {
  customerDiagnosticsAvailability, customerDiagnosticsOverview, shareCustomerDiagnostics,
} from '@/features/tracking/services/supportDiagnosticsService';
import { buildSearchDiagnostics } from '@/features/tracking/utils/qaSearchCapture';
import { setDiagnosticsSession } from '@/lib/diagnosticsAccessState';
import { observedRecordingProvenance } from '@/features/tracking/utils/diagnosticProvenance';
import { captureDiagnosticEnvironment, recordSupportProvenance } from '@/features/tracking/utils/supportProvenanceStore';
import { toSupportCapture } from '@/features/tracking/utils/supportDiagnostics';

jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getFirstAsync: async (_sql: string, id: string, _remote: string, owner: string) => ({ local_id: id, user_id: owner, deleted_at: null }) }) }));

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const T0 = Date.parse('2026-10-04T08:00:00.000Z');
const mockHas = jest.fn();
const mockLoad = jest.fn();
const mockLay = jest.fn();
const mockMarkers = jest.fn();
const mockSession = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/features/tracking/utils/qaSearchCapture', () => ({
  ...jest.requireActual('@/features/tracking/utils/qaSearchCapture'),
  hasQaSearchCapture: (...a: unknown[]) => mockHas(...a),
  loadQaSearchCapture: (...a: unknown[]) => mockLoad(...a),
}));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockLay(...a),
  getTrackMarkersBySession: (...a: unknown[]) => mockMarkers(...a),
}));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
}));
jest.mock('@/features/tracking/services/qaTrackExportService', () => ({
  shareJsonFile: (...a: unknown[]) => mockShareFile(...a),
}));

const sqlLay = (n: number) => Array.from({ length: n }, (_, i) => ({
  local_id: `p${i}`, latitude: 47.3 + i * 1e-4, longitude: 8.5, accuracy: 3, point_type: 'lay', timestamp: new Date(T0 + i * 1000).toISOString(),
}));
const localRow = (payload: Record<string, unknown> = { distanceMeters: 40 }) => ({
  local_id: 'sess-1', user_id: 'u', dog_id: 'd', type: 'track', status: 'completed', started_at: null, created_at: null,
  surface_types: null, terrain_conditions: null, payload_json: JSON.stringify(payload),
});
// Echtes Capture-Format (wie run.tsx es ablegt): buildSearchDiagnostics → toSupportCapture.
const ll = (y: number) => ({ latitude: 47.3 + y / 111320, longitude: 8.5 });
const capture = toSupportCapture(buildSearchDiagnostics({
  origin: ll(0), resumed: false, analyticsSampleCount: 0, laid: { total: 30, end: null }, objects: [], cornerAtM: [],
  end: { fired: null, hapticFired: null, voiceFired: null }, manualStopTSec: 20,
  telemetry: { captureLevel: 'support', startedAtMs: T0, resumed: false,
    raw: [0, 1, 2].map(i => ({ lat: ll(i * 5).latitude, lng: 8.5, accuracy: 4, t: T0 + i * 1000, accepted: true, reason: null })),
    filtered: [0, 1, 2].map(i => ({ lat: ll(i * 5).latitude, lng: 8.5, tSec: i })),
    display: [], cursorSamples: [], objectApproach: [], minDistToEndM: null, progressAtMinEndM: null, truncated: { raw: false, cursor: false } },
  run: { points: [ll(0), ll(5), ll(10)], pointsTimeSec: [0, 1, 2] },
  replay: { points: [ll(0), ll(5), ll(10)], timeSec: [0, 1, 2] },
} as never));
const sharedPayload = () => JSON.parse(mockShareFile.mock.calls[0][0]);

beforeEach(() => {
  setDiagnosticsSession('fixture-owner');
  [mockHas, mockLoad, mockLay, mockMarkers, mockSession, mockShareFile].forEach(m => m.mockReset());
  mockHas.mockResolvedValue(false);
  mockLoad.mockResolvedValue(null);
  mockLay.mockResolvedValue([]);
  mockMarkers.mockResolvedValue([]);
  mockSession.mockResolvedValue(null);
  mockShareFile.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Kunden-Diagnose teilen', () => {
  it('sperrt parallele Teilen-Aufrufe vor dem ersten await und gibt die Sperre danach frei', async () => {
    let done!: () => void;
    mockShareFile.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve; }));
    const first = shareCustomerDiagnostics('sess-1', { points: sqlLay(3) });
    expect(await shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).toEqual({ ok: false, reason: 'busy' });
    for (let i = 0; i < 50 && !done; i++) await Promise.resolve();
    expect(mockShareFile).toHaveBeenCalledTimes(1);
    done();
    expect(await first).toMatchObject({ ok: true });
    expect(await shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).toMatchObject({ ok: true });
  });

  it('meldet Teilaufnahme und ausgedünnte Suchdaten ohne Werte zu erfinden', async () => {
    mockLoad.mockResolvedValue({ ...capture, partial: true, truncated: { raw: true, cursor: false } });
    mockLay.mockResolvedValue(sqlLay(4));
    expect(await customerDiagnosticsOverview('sess-1')).toMatchObject({ availability: 'capture', partial: true, reduced: true,
      recording: { lay: { availability: 'unknown' }, search: { availability: 'unknown' } } });
  });
  it('Capture vorhanden → Capture wird geteilt (bestehender Pfad)', async () => {
    mockHas.mockResolvedValue(true);
    mockLoad.mockResolvedValue(capture);
    mockLay.mockResolvedValue(sqlLay(4));
    expect(await customerDiagnosticsAvailability('sess-1', null)).toBe('capture');
    const r = await shareCustomerDiagnostics('sess-1', null);
    expect(r).toMatchObject({ ok: true, source: 'capture' });
    expect(sharedPayload().searchDiagnostics).toBeDefined();
    expect(sharedPayload().diagnosticsSource).toBeUndefined();
  });

  it('keine Capture, aber SQLite-Daten → on-demand aus gespeicherten Daten (inkl. gespeichertem Suchlauf)', async () => {
    mockSession.mockResolvedValue(localRow({ distanceMeters: 40, run: { duration_seconds: 90, run_points: [{ lat: 47.3, lng: 8.5, t: T0 }, { lat: 47.3001, lng: 8.5, t: T0 + 500 }] } }));
    mockLay.mockResolvedValue(sqlLay(4));
    expect(await customerDiagnosticsAvailability('sess-1', null)).toBe('persisted');
    const r = await shareCustomerDiagnostics('sess-1', null);
    expect(r).toMatchObject({ ok: true, source: 'persisted' });
    const p = sharedPayload();
    expect(p.diagnosticsSource).toBe('persisted');
    expect(p.pointCount).toBe(4);
    expect(p.persistedSearch.pointCount).toBe(2);
    expect(mockShareFile.mock.calls[0][1]).toMatch(/^ANYVO-Track-Diagnostics-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('Capture-Index zeigt auf kaputtes Payload → fällt auf gespeicherte Daten zurück', async () => {
    mockHas.mockResolvedValue(true);
    mockLoad.mockResolvedValue({ broken: true });
    mockSession.mockResolvedValue(localRow());
    mockLay.mockResolvedValue(sqlLay(3));
    expect(await customerDiagnosticsAvailability('sess-1', null)).toBe('persisted');
    expect(await shareCustomerDiagnostics('sess-1', null)).toMatchObject({ ok: true, source: 'persisted' });
  });

  it('keine lokale Session (z. B. anderes Gerät) → Detail-Datensatz als Quelle', async () => {
    const detail = { points: sqlLay(3), markers: [], runs: [] };
    expect(await customerDiagnosticsAvailability('sess-1', detail)).toBe('persisted');
    expect(await shareCustomerDiagnostics('sess-1', detail)).toMatchObject({ ok: true, source: 'persisted' });
  });

  it('alte Fährte ohne verwertbare Daten → none / missing, kein Share-Sheet, kein Crash', async () => {
    mockSession.mockResolvedValue(localRow());
    mockLay.mockResolvedValue(sqlLay(1));
    expect(await customerDiagnosticsAvailability('sess-1', { points: [] })).toBe('none');
    expect(await shareCustomerDiagnostics('sess-1', { points: [] })).toEqual({ ok: false, reason: 'missing' });
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('Share-Sheet abgebrochen (shareAsync löst normal auf) → ok, kein Fehler', async () => {
    mockShareFile.mockResolvedValue(undefined);
    expect(await shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).toMatchObject({ ok: true });
  });

  it('Share-Fehler → failed, keine Exception an die UI', async () => {
    mockShareFile.mockRejectedValue(new Error('Teilen ist auf diesem Gerät nicht verfügbar.'));
    await expect(shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('Speicher-/SQLite-Fehler → none/missing statt Crash', async () => {
    mockHas.mockRejectedValue(new Error('storage'));
    mockSession.mockRejectedValue(new Error('sqlite'));
    expect(await customerDiagnosticsAvailability('sess-1', null)).toBe('none');
    expect(await shareCustomerDiagnostics('sess-1', null)).toEqual({ ok: false, reason: 'missing' });
  });
});


it('never attributes an older capture to a newer search attempt or the exporting installation', async () => {
  await recordSupportProvenance('sess-1', 'search', false, 'newer-attempt');
  mockLoad.mockResolvedValue(capture); // legacy capture has no recording-time context
  mockLay.mockResolvedValue(sqlLay(4));
  expect(await shareCustomerDiagnostics('sess-1', null)).toMatchObject({ ok: true });
  expect(sharedPayload().provenance.recording.search.availability).toBe('unknown');
});

it('projects capture-time context into the narrow support block without a second UUID-bearing subtree', async () => {
  const context = observedRecordingProvenance(captureDiagnosticEnvironment(), false);
  mockLoad.mockResolvedValue({ ...capture, recordingContext: context });
  mockLay.mockResolvedValue(sqlLay(4));
  expect(await shareCustomerDiagnostics('sess-1', null)).toMatchObject({ ok: true });
  expect(sharedPayload().provenance.recording.search).toEqual(context);
  expect(sharedPayload().searchDiagnostics.recordingContext).toBeUndefined();
});

it('uses the persisted run identity only for local metadata lookup and never exports it', async () => {
  await recordSupportProvenance('sess-1', 'search', false, 'exact-synthetic-run');
  mockSession.mockResolvedValue(localRow({ run: { run_id: 'exact-synthetic-run', run_points: [] } }));
  mockLay.mockResolvedValue(sqlLay(4));
  expect(await shareCustomerDiagnostics('sess-1', null)).toMatchObject({ ok: true, source: 'persisted' });
  expect(sharedPayload().provenance.recording.search.availability).toBe('available');
  expect(mockShareFile.mock.calls[0][0]).not.toContain('exact-synthetic-run');
});

it('does not open a share sheet if the account changed while preparing an export', async () => {
  mockLoad.mockImplementationOnce(async () => {
    setDiagnosticsSession('another-owner');
    return capture;
  });
  mockLay.mockResolvedValue(sqlLay(4));
  expect(await shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).toEqual({ ok: false, reason: 'failed' });
  expect(mockShareFile).not.toHaveBeenCalled();
});

it('passes an account fence through the existing file-write and native-share boundary', async () => {
  let opened = false;
  mockShareFile.mockImplementationOnce(async (_json: string, _file: string, _title: string, validate: () => void) => {
    setDiagnosticsSession('another-owner');
    validate();
    opened = true;
  });
  expect(await shareCustomerDiagnostics('sess-1', { points: sqlLay(3) })).toEqual({ ok: false, reason: 'failed' });
  expect(opened).toBe(false);
});
