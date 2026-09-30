/**
 * QA-Export Session Freshness/Selection — Service: Liste (Reihenfolge, qaId,
 * Distanz aus payload_json, leer) und Export-Konsistenz Zeile → localId →
 * buildExportForSession → export.sessionId.
 */
import { listRecentLaySessions, buildExportForSession, formatQaSessionRow } from '@/features/tracking/services/qaTrackExportService';
import { hashSessionId } from '@/features/tracking/utils/qaTrackExport';

const mockSessions = jest.fn();
const mockPoints = jest.fn();
const mockMarkers = jest.fn();
const mockCapture = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessions: (...a: unknown[]) => mockSessions(...a) }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockPoints(...a),
  getTrackMarkersBySession: (...a: unknown[]) => mockMarkers(...a),
}));
jest.mock('@/features/tracking/utils/qaSessionCapture', () => ({ loadQaSessionCapture: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('@/features/tracking/utils/qaSearchCapture', () => ({ loadQaSearchCapture: async () => null }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));

const A = 'aaaaaaaa-1111-4111-8111-111111111111';   // heute, neu
const B = 'bbbbbbbb-2222-4222-8222-222222222222';   // gestern
const pt = (id: string, i: number) => ({ local_id: `pt-${id}-${i}`, session_local_id: id, latitude: 47 + i * 1e-5, longitude: 8, accuracy: 5, altitude: null, speed: null, heading: null, timestamp: `2026-09-13T08:2${i}:00.000Z`, point_type: 'lay' });
const sessionRow = (id: string, startedAt: string, payload: string | null) => ({ local_id: id, type: 'track', started_at: startedAt, created_at: startedAt, duration_seconds: 60, payload_json: payload });

beforeEach(() => {
  mockSessions.mockReset(); mockPoints.mockReset(); mockMarkers.mockReset(); mockCapture.mockReset();
  mockMarkers.mockResolvedValue([]); mockCapture.mockResolvedValue(null);
});

describe('listRecentLaySessions', () => {
  it('4./5. neueste Session (Repository-Reihenfolge) steht oben; qaId = hashSessionId(localId); Distanz aus payload_json', async () => {
    mockSessions.mockResolvedValue([
      sessionRow(A, '2026-09-13T08:24:00.000Z', JSON.stringify({ distanceMeters: 412.6 })),
      sessionRow(B, '2026-09-12T18:30:00.000Z', JSON.stringify({ distanceMeters: 7.1 })),
    ]);
    mockPoints.mockImplementation(async (id: string) => (id === A ? [pt(A, 0), pt(A, 1), pt(A, 2)] : [pt(B, 0), pt(B, 1)]));
    const list = await listRecentLaySessions('user-1', 5);
    expect(list.map(s => s.localId)).toEqual([A, B]);
    expect(list[0]).toMatchObject({ qaId: hashSessionId(A), layPointCount: 3, distanceM: 412.6, startedAt: '2026-09-13T08:24:00.000Z' });
    expect(list[1]).toMatchObject({ qaId: hashSessionId(B), layPointCount: 2, distanceM: 7.1 });
    expect(list[0].qaId).not.toBe(list[1].qaId);
  });

  it('Sessions ohne Lay-Punkte werden ausgelassen; kaputtes/fehlendes payload_json → distanceM null (keine Neuberechnung)', async () => {
    mockSessions.mockResolvedValue([sessionRow(A, '2026-09-13T08:24:00.000Z', '{not json'), sessionRow(B, '2026-09-12T18:30:00.000Z', null)]);
    mockPoints.mockImplementation(async (id: string) => (id === A ? [pt(A, 0)] : []));
    const list = await listRecentLaySessions('user-1', 5);
    expect(list.map(s => s.localId)).toEqual([A]);
    expect(list[0].distanceM).toBeNull();
  });

  it('9. keine Sessions → leere Liste (Empty-State wie bisher)', async () => {
    mockSessions.mockResolvedValue([]);
    expect(await listRecentLaySessions('user-1', 5)).toEqual([]);
  });
});

describe('formatQaSessionRow', () => {
  it('zeigt lokales Datum + Uhrzeit, Punkte, Distanz und die QA-Kennung', () => {
    const row = formatQaSessionRow({ localId: A, qaId: hashSessionId(A), startedAt: '2026-09-13T08:24:00.000Z', durationSeconds: 60, layPointCount: 3, distanceM: 412.6 });
    const d = new Date('2026-09-13T08:24:00.000Z');
    const p2 = (n: number) => String(n).padStart(2, '0');
    expect(row).toBe(`${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())} · 3 Punkte · 413 m · ${hashSessionId(A)}`);
    expect(formatQaSessionRow({ localId: B, qaId: 'qa-deadbeef', startedAt: null, durationSeconds: null, layPointCount: 2, distanceM: null })).toBe('2 Punkte · qa-deadbeef');
  });
});

describe('6./7./10. Export-Konsistenz', () => {
  it('Session A → Export A, Session B → Export B; export.sessionId == qaId der Zeile; Loader werden mit exakt dieser localId aufgerufen', async () => {
    mockPoints.mockImplementation(async (id: string) => (id === A ? [pt(A, 0), pt(A, 1)] : [pt(B, 0), pt(B, 1), pt(B, 2)]));
    const ea = await buildExportForSession(A);
    const eb = await buildExportForSession(B);
    expect(ea.sessionId).toBe(hashSessionId(A));
    expect(eb.sessionId).toBe(hashSessionId(B));
    expect(ea.sessionId).not.toBe(eb.sessionId);
    expect(ea.pointCount).toBe(2);
    expect(eb.pointCount).toBe(3);
    expect(mockPoints).toHaveBeenCalledWith(A);
    expect(mockMarkers).toHaveBeenCalledWith(A);
    expect(mockCapture).toHaveBeenCalledWith(A);
    expect(mockPoints).toHaveBeenCalledWith(B);
  });
});

describe('8./9. Auswahl nach Refresh (reconcileQaSelection)', () => {
  const { reconcileQaSelection } = jest.requireActual('@/features/tracking/services/qaTrackExportService');
  const rowA = { localId: A, qaId: hashSessionId(A), startedAt: null, durationSeconds: null, layPointCount: 1, distanceM: null };
  const rowB = { localId: B, qaId: hashSessionId(B), startedAt: null, durationSeconds: null, layPointCount: 1, distanceM: null };
  it('9. vorhandene Auswahl bleibt erhalten, wenn die Session noch existiert', () => {
    expect(reconcileQaSelection(A, [rowB, rowA])).toBe(A);
  });
  it('8. stale Auswahl wird sauber verworfen (null), nie auf eine andere Session gesetzt', () => {
    expect(reconcileQaSelection(A, [rowB])).toBeNull();
    expect(reconcileQaSelection(A, [])).toBeNull();
    expect(reconcileQaSelection(null, [rowA])).toBeNull();
  });
});

describe('11. Dateiname', () => {
  const { qaExportFileName, fileNameStamp } = jest.requireActual('@/features/tracking/utils/qaTrackExport');
  it('enthält lokales Datum/Uhrzeit + Hash und ist filesystem-safe; ohne Datum bisheriges Format', () => {
    const e = { sessionId: 'qa-1a2b3c4d' } as never;
    const iso = '2026-09-13T08:28:00.000Z';
    const stamp = fileNameStamp(iso) as string;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(qaExportFileName(e, iso)).toBe(`anyvo-track-qa-${stamp}-qa-1a2b3c4d.json`);
    expect(qaExportFileName(e, iso)).toMatch(/^[a-z0-9.-]+$/);
    expect(qaExportFileName(e)).toBe('anyvo-track-qa-qa-1a2b3c4d.json');
    expect(qaExportFileName(e, 'kein datum')).toBe('anyvo-track-qa-qa-1a2b3c4d.json');
  });
});
