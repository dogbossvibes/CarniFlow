// Referenz-Fährten-Loader (I/O): echter Pending-Slot (AsyncStorage-Mock), SQLite
// gemockt. Belegt: nur lesen (keine Writes/Migration/Registry/Session/Quota),
// Pending vor SQLite, Fehler einer Fährte blendet nur diese aus.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { loadActiveTrackOverlays } from '@/features/tracking/services/trackReferenceOverlayService';
import type { TrackReferenceCandidate } from '@/features/tracking/store/trackReferenceOverlays';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockSession = jest.fn();
const mockLay = jest.fn();
const mockClaimQuota = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
}));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockLay(...a),
}));
jest.mock('@/services/quotaService', () => ({ claimNewbieQuota: (...a: unknown[]) => mockClaimQuota(...a) }));

const pts = (n = 3, base = 47) => Array.from({ length: n }, (_, i) => ({ lat: base + i * 1e-4, lng: 8 + i * 1e-4, accuracy: 4, t: 1000 + i }));
const pending = (dogId: string, over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: `sess-${dogId}`, dogId, trackPoints: pts(), markers: [], runPoints: [], distanceMeters: 50,
  durationSeconds: 60, layFinishedAt: 5000, startAnchor: null, savedAt: 5000, status: 'resting', ...over,
});
const row = (dogId: string, over: Record<string, unknown> = {}) => ({
  local_id: `sess-${dogId}`, user_id: 'user-1', dog_id: dogId, type: 'track', deleted_at: null, status: 'completed',
  payload_json: JSON.stringify({ distanceMeters: 50 }), ...over,
});
const cand = (dogId: string, order: number): TrackReferenceCandidate =>
  ({ dogId, sessionId: `sess-${dogId}`, dogName: dogId, status: 'resting', order });

beforeEach(async () => {
  await AsyncStorage.clear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  [mockSession, mockLay, mockClaimQuota].forEach(m => m.mockReset());
  mockSession.mockImplementation(async (id: string) => row(id.replace('sess-', '')));
  mockLay.mockResolvedValue([]);
});

describe('loadActiveTrackOverlays', () => {
  it('Pending vorhanden → Geometrie aus Pending, SQLite-Punkte werden NICHT abgefragt', async () => {
    await writePendingNow('amoun', pending('amoun'));
    const r = await loadActiveTrackOverlays([cand('amoun', 1)], 'user-1');
    expect(r.map(o => o.dogId)).toEqual(['amoun']);
    expect(r[0].points).toHaveLength(3);
    expect(mockLay).not.toHaveBeenCalled();
  });

  it('Pending fehlt + SQLite vorhanden (offline) → Geometrie aus SQLite', async () => {
    mockLay.mockResolvedValue([0, 1, 2].map(i => ({ latitude: 47.2 + i * 1e-4, longitude: 8 })));
    const r = await loadActiveTrackOverlays([cand('doran', 1)], 'user-1');
    expect(r[0].points[0]).toEqual({ lat: 47.2, lng: 8 });
    expect(mockLay).toHaveBeenCalledWith('sess-doran');
  });

  it('nur lesend: keine AsyncStorage-Writes/Removes (auch kein Legacy-Migrieren), keine Registry, kein Quota', async () => {
    await writePendingNow('amoun', pending('amoun'));
    // Legacy-Einzelslot: loadPending() würde ihn migrieren — der Overlay-Loader darf das nicht.
    await AsyncStorage.setItem('anyvo_track_pending_v1', JSON.stringify(pending('doran', { dogId: null })));
    const setSpy = AsyncStorage.setItem as jest.Mock;
    const removeSpy = AsyncStorage.removeItem as jest.Mock;
    setSpy.mockClear(); removeSpy.mockClear();
    const registryBefore = useActiveFaehrten.getState().byDog;
    await loadActiveTrackOverlays([cand('amoun', 1), cand('doran', 2)], 'user-1');
    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1')).not.toBeNull();
    expect(useActiveFaehrten.getState().byDog).toBe(registryBefore);
    expect(mockClaimQuota).not.toHaveBeenCalled();
  });

  it('Fehler einer Fährte blendet nur diese aus; Reihenfolge der übrigen bleibt', async () => {
    await writePendingNow('amoun', pending('amoun'));
    await writePendingNow('clay', pending('clay', { trackPoints: pts(3, 46) }));
    mockSession.mockImplementation(async (id: string) => {
      if (id === 'sess-doran') throw new Error('sqlite busy');
      return row(id.replace('sess-', ''));
    });
    mockLay.mockRejectedValue(new Error('sqlite busy'));
    const r = await loadActiveTrackOverlays([cand('amoun', 1), cand('doran', 2), cand('clay', 3)], 'user-1');
    expect(r.map(o => o.dogId)).toEqual(['amoun', 'clay']);
  });

  it('fremder Nutzer in der lokalen Session-Zeile → nicht angezeigt', async () => {
    await writePendingNow('amoun', pending('amoun'));
    mockSession.mockResolvedValue(row('amoun', { user_id: 'user-2' }));
    expect(await loadActiveTrackOverlays([cand('amoun', 1)], 'user-1')).toEqual([]);
  });

  it('keine Kandidaten → leeres Array ohne I/O', async () => {
    expect(await loadActiveTrackOverlays([], 'user-1')).toEqual([]);
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockLay).not.toHaveBeenCalled();
  });

  it('Pending mit FALSCHER sessionId → nie verwendet; SQLite für exakt die Registry-Session', async () => {
    await writePendingNow('amoun', pending('amoun', { sessionId: 'sess-alt', trackPoints: pts(6, 40) }));
    mockLay.mockResolvedValue([0, 1, 2].map(i => ({ latitude: 47.3 + i * 1e-4, longitude: 8 })));
    const r = await loadActiveTrackOverlays([cand('amoun', 1)], 'user-1');
    expect(mockLay).toHaveBeenCalledWith('sess-amoun');
    expect(r[0].points).toHaveLength(3);
    expect(r[0].points[0]).toEqual({ lat: 47.3, lng: 8 });
  });

  it('Pending kaputt (ungültiges JSON) → SQLite-Fallback', async () => {
    await AsyncStorage.setItem('anyvo_track_pending_v1::amoun', '{kaputt');
    mockLay.mockResolvedValue([0, 1].map(i => ({ latitude: 47.4 + i * 1e-4, longitude: 8 })));
    const r = await loadActiveTrackOverlays([cand('amoun', 1)], 'user-1');
    expect(r[0].points[0]).toEqual({ lat: 47.4, lng: 8 });
  });

  it('Pending + SQLite kaputt → nur dieses Overlay fehlt, andere bleiben', async () => {
    await AsyncStorage.setItem('anyvo_track_pending_v1::amoun', JSON.stringify({ sessionId: 'sess-amoun', trackPoints: 'x' }));
    await writePendingNow('doran', pending('doran'));
    mockLay.mockResolvedValue([{ latitude: Number.NaN, longitude: 8 }]);
    const r = await loadActiveTrackOverlays([cand('amoun', 1), cand('doran', 2)], 'user-1');
    expect(r.map(o => o.dogId)).toEqual(['doran']);
  });
});
