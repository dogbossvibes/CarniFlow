// „Fährte fortsetzen" (TrackResumeCta-Entscheidung) mit REALISTISCHEM Puffer einer frisch gelegten
// Fährte: sessionId=null (Recorder), Registry Hund→Session. Vorher: 'other_pending' → kein CTA.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { applyTrackRecovery, evaluateTrackRecovery, reopenCancelledTrack } from '@/features/tracking/services/trackRecoveryService';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockSession = jest.fn();
const mockClearCancelled = jest.fn();
const mockCreateSession = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
  clearLocalTrackCancelled: (...a: unknown[]) => mockClearCancelled(...a),
  createLocalTrainingSession: (...a: unknown[]) => mockCreateSession(...a),
  markLocalTrackCancelled: jest.fn(), setLocalTrackLifecycle: jest.fn(),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({ endLiegezeitNotification: async () => undefined }));
const LAY_END_ISO = '2026-10-04T08:30:00.000Z';
const LAY_END = Date.parse(LAY_END_ISO);
const layRow = (i: number) => ({ local_id: `p${i}`, session_local_id: 'sess-A', latitude: 47 + i * 1e-4, longitude: 8, accuracy: 4, altitude: null, speed: null, heading: null, timestamp: new Date(LAY_END - (10 - i) * 1000).toISOString(), point_type: 'lay' });
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: async () => [0, 1, 2].map(i => layRow(i)),
  getTrackMarkersBySession: async () => [],
  getSearchPointsBySession: async () => [],
  deleteSearchPointsBySession: jest.fn(),
}));
const row = (payload: Record<string, unknown>) => ({ local_id: 'sess-A', user_id: 'u', dog_id: 'dog-A', type: 'track', status: 'completed', ended_at: LAY_END_ISO, duration_seconds: 300, deleted_at: null, payload_json: JSON.stringify(payload) });
const realPending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: null, dogId: 'dog-A',
  trackPoints: [0, 1, 2].map(i => ({ lat: 47 + i * 1e-4, lng: 8, accuracy: 4, t: LAY_END - (10 - i) * 1000 })),
  markers: [], runPoints: [], distanceMeters: 50, durationSeconds: 300,
  layFinishedAt: LAY_END, layStartedAt: LAY_END, startAnchor: null, savedAt: LAY_END, status: 'resting', ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], isRecording: false });
  [mockSession, mockClearCancelled, mockCreateSession].forEach(m => m.mockReset());
  mockSession.mockResolvedValue(row({ distanceMeters: 50 }));
});

describe('TrackResumeCta-Entscheidung, realistischer Puffer (sessionId=null)', () => {
  it('frisch gelegt + Registry → „Fährte fortsetzen" verfügbar; Ziel mit dogId + id derselben Session', async () => {
    await writePendingNow('dog-A', realPending());
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'resting', source: 'registry' });
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
  it('Registry zeigt auf eine andere Session → weiterhin other_active (kein Fortsetzen der falschen Session)', async () => {
    await writePendingNow('dog-A', realPending());
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-NEU' });
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'other_active' });
  });
  it('ohne Registry-Beleg bleibt ein Puffer ohne sessionId fremd (other_pending, fail closed wie bisher)', async () => {
    await writePendingNow('dog-A', realPending());
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'other_pending' });
  });
  it('6. abgebrochen (Puffer ohne sessionId, cancelled; Registry entfernt) → wieder öffnen → fortsetzen in dieselbe Session', async () => {
    mockSession.mockResolvedValue(row({ distanceMeters: 50, trackLifecycleStatus: 'cancelled' }));
    mockClearCancelled.mockImplementation(async () => { mockSession.mockResolvedValue(row({ distanceMeters: 50 })); return true; });
    await writePendingNow('dog-A', realPending({ status: 'cancelled' }));
    const r = await reopenCancelledTrack('sess-A', 'dog-A');
    expect(r).toMatchObject({ ok: true, decision: { ok: true, mode: 'resting' } });
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    const p = await loadPending('dog-A');
    expect(p?.sessionId).toBe('sess-A');   // aus SQLite rekonstruiert, jetzt mit sessionId
    expect(p?.status).toBe('resting');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
