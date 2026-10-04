// „Fährte fortsetzen" als normaler Produkt-Workflow (nicht nur Crash-Recovery):
// gelegte Fährte bleibt offen → später fortsetzen; unterbrochene Absuche fortsetzen;
// „Absuche verwerfen" gibt die Fährte wieder frei; „Ohne App abgeschlossen" erfindet nichts;
// abgebrochene Fährte → „Fährte wieder öffnen" (bewusst) → wieder fortsetzbar.
// Echte Registry + Pending (AsyncStorage-Mock), lokale SQLite gemockt — keine neue Session.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import {
  applyTrackRecovery, completeTrackWithoutApp, discardSearchAttempt, evaluateTrackRecovery, reopenCancelledTrack,
} from '@/features/tracking/services/trackRecoveryService';
import { planReopenCancelled, type LocalSessionSnapshot } from '@/features/tracking/store/trackRecovery';
import { selectReferenceCandidates } from '@/features/tracking/store/trackReferenceOverlays';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockSession = jest.fn();
const mockLay = jest.fn();
const mockMarkers = jest.fn();
const mockSearch = jest.fn();
const mockCreateSession = jest.fn();
const mockClaimQuota = jest.fn();
const mockClearCancelled = jest.fn();
const mockSetLifecycle = jest.fn();
const mockDeleteSearch = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
  createLocalTrainingSession: (...a: unknown[]) => mockCreateSession(...a),
  clearLocalTrackCancelled: (...a: unknown[]) => mockClearCancelled(...a),
  setLocalTrackLifecycle: (...a: unknown[]) => mockSetLifecycle(...a),
  markLocalTrackCancelled: jest.fn(),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({ endLiegezeitNotification: async () => undefined }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockLay(...a),
  getTrackMarkersBySession: (...a: unknown[]) => mockMarkers(...a),
  getSearchPointsBySession: (...a: unknown[]) => mockSearch(...a),
  deleteSearchPointsBySession: (...a: unknown[]) => mockDeleteSearch(...a),
}));
jest.mock('@/services/quotaService', () => ({ claimNewbieQuota: (...a: unknown[]) => mockClaimQuota(...a) }));

const LAY_END_ISO = '2026-10-04T08:30:00.000Z';
const LAY_END = Date.parse(LAY_END_ISO);
const layRow = (i: number) => ({ local_id: `p${i}`, session_local_id: 'sess-A', latitude: 47 + i * 1e-4, longitude: 8, accuracy: 4,
  altitude: null, speed: null, heading: null, timestamp: new Date(LAY_END - (10 - i) * 1000).toISOString(), point_type: 'lay' });
const markerRow = { local_id: 'm1', marker_type: 'gegenstand', material: 'holz', angle_kind: null, latitude: 47.0001, longitude: 8, accuracy: 4, distance_from_start: 11, note: null, created_at: new Date(LAY_END - 5000).toISOString() };
const sessionRow = (payload: Record<string, unknown> = { distanceMeters: 50 }) => ({
  local_id: 'sess-A', user_id: 'user-1', dog_id: 'dog-A', type: 'track', status: 'completed', ended_at: LAY_END_ISO,
  duration_seconds: 300, deleted_at: null, payload_json: JSON.stringify(payload),
});
const CANCELLED = { distanceMeters: 50, trackLifecycleStatus: 'cancelled', trackLifecycleUpdatedAt: '2026-10-04T09:00:00.000Z', trackLifecycleSource: 'resting_abort' };
const pts = () => [0, 1, 2].map(i => ({ lat: 47 + i * 1e-4, lng: 8, accuracy: 4, t: LAY_END - (10 - i) * 1000 }));
const pending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: 'sess-A', dogId: 'dog-A', trackPoints: pts(),
  markers: [{ id: 'm1', type: 'gegenstand', material: 'holz', angleKind: null, lat: 47.0001, lng: 8, accuracy: 4, distance_from_start: 11, note: null, audio_url: null, found: false, t: LAY_END - 5000 }],
  runPoints: [], distanceMeters: 50, durationSeconds: 300,
  layFinishedAt: LAY_END, layStartedAt: LAY_END, startAnchor: null, savedAt: LAY_END, status: 'resting', ...over,
});
const noNewSession = () => { expect(mockCreateSession).not.toHaveBeenCalled(); expect(mockClaimQuota).not.toHaveBeenCalled(); };
const restart = async () => {   // App vollständig beendet: Speicherstand bleibt, In-Memory-Zustand weg
  useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], isRecording: false });
  useActiveFaehrten.setState({ byDog: {}, hydrated: false });
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], isRecording: false });
  [mockSession, mockLay, mockMarkers, mockSearch, mockCreateSession, mockClaimQuota, mockClearCancelled, mockSetLifecycle, mockDeleteSearch].forEach(m => m.mockReset());
  mockSession.mockResolvedValue(sessionRow());
  mockLay.mockResolvedValue([layRow(0), layRow(1), layRow(2)]);
  mockMarkers.mockResolvedValue([markerRow]);
  mockSearch.mockResolvedValue([]);
  mockClearCancelled.mockImplementation(async () => { mockSession.mockResolvedValue(sessionRow({ distanceMeters: 50 })); return true; });
  mockDeleteSearch.mockResolvedValue(undefined);
});

describe('Offene gelegte Fährte → „Fährte fortsetzen"', () => {
  it('1/3/4/5/6: sichtbar; Fortsetzen öffnet dieselbe dogId/sessionId; keine neue Session; Punkte+Marker identisch', async () => {
    await writePendingNow('dog-A', pending());
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'resting' });
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    const p = await loadPending('dog-A');
    expect(p?.sessionId).toBe('sess-A');
    expect(p?.trackPoints).toEqual(pts());
    expect(p?.markers.map(m => m.id)).toEqual(['m1']);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    noNewSession();
  });
  it('9: App vollständig beendet/neu gestartet → weiterhin fortsetzbar (auch nur aus SQLite)', async () => {
    await restart();
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, source: 'session', target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect((await loadPending('dog-A'))?.trackPoints).toHaveLength(3);
    noNewSession();
  });
  it('8: Hintergrund/Vordergrund (erneute Prüfung) → Entscheidung unverändert, nichts geschrieben', async () => {
    await writePendingNow('dog-A', pending());
    const a = await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    const b = await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(a.ok && b.ok && a.target === b.target).toBe(true);
    expect(mockSetLifecycle).not.toHaveBeenCalled();
  });
});

describe('Unterbrochene Absuche', () => {
  it('7: offener Such-Puffer → „Absuche fortsetzen" in dieselbe Session', async () => {
    await writePendingNow('dog-A', pending({ status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 60_000 }));
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'searching', target: '/track/run?dogId=dog-A&id=sess-A' });
    noNewSession();
  });
  it('10/11: „Absuche verwerfen" löscht nur Suchpunkte; gelegte Fährte bleibt offen und erneut absuchbar', async () => {
    mockSearch.mockResolvedValue([{ local_id: 's1' }]);   // Suchpunkte ohne Lauf = begonnene, nicht fortsetzbare Absuche
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'search_started' });
    const r = await discardSearchAttempt('sess-A', 'dog-A');
    expect(r).toMatchObject({ ok: true });
    expect(mockDeleteSearch).toHaveBeenCalledWith('sess-A');
    expect(mockSetLifecycle).not.toHaveBeenCalled();   // kein Abschluss, kein Abbruch
    // Gleiche Geometrie (aus SQLite rekonstruiert: zusätzlich altitude/heading/speed = null).
    expect((await loadPending('dog-A'))?.trackPoints.map(p => ({ lat: p.lat, lng: p.lng, t: p.t }))).toEqual(pts().map(p => ({ lat: p.lat, lng: p.lng, t: p.t })));
    mockSearch.mockResolvedValue([]);
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'resting' });
    noNewSession();
  });
});

describe('Abschluss und abgebrochene Fährten', () => {
  it('14/15: „Ohne App abgeschlossen" → nur Marker, keine Suchdaten; danach kein Fortsetzen', async () => {
    mockSetLifecycle.mockResolvedValue(true);
    await writePendingNow('dog-A', pending());
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect(mockSetLifecycle).toHaveBeenCalledWith('sess-A', 'dog-A', 'completed_without_app');
    expect(mockDeleteSearch).not.toHaveBeenCalled();
    mockSession.mockResolvedValue(sessionRow({ distanceMeters: 50, trackLifecycleStatus: 'completed_without_app' }));
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: false, reason: 'completed_without_app' });
    expect(await reopenCancelledTrack('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'not_cancelled' });
  });
  it('12/13: abgebrochene Fährte (Liegezeit-Abbruch, Puffer cancelled) → „Fährte wieder öffnen" → regulär fortsetzbar, dieselbe Session', async () => {
    mockSession.mockResolvedValue(sessionRow(CANCELLED));
    await writePendingNow('dog-A', pending({ status: 'cancelled' }));
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: false, reason: 'cancelled' });
    const r = await reopenCancelledTrack('sess-A', 'dog-A');
    expect(r).toMatchObject({ ok: true, decision: { ok: true, mode: 'resting' } });
    expect(mockClearCancelled).toHaveBeenCalledWith('sess-A', 'dog-A');
    const p = await loadPending('dog-A');
    expect(p?.status).toBe('resting');
    expect(p?.trackPoints).toEqual(pts());
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    noNewSession();
  });
  it('abgebrochen beim Legen (Puffer gelöscht) → Wiederöffnen rekonstruiert aus SQLite', async () => {
    mockSession.mockResolvedValue(sessionRow(CANCELLED));
    const r = await reopenCancelledTrack('sess-A', 'dog-A');
    expect(r).toMatchObject({ ok: true, decision: { ok: true, source: 'session' } });
    noNewSession();
  });
  it('Wiederöffnen verweigert (ohne jeden Write), wenn die Fährte danach nicht fortsetzbar wäre: finaler Suchlauf, andere offene Fährte des Hundes', async () => {
    mockSession.mockResolvedValue(sessionRow({ ...CANCELLED, run: { score: 80 } }));
    expect(await reopenCancelledTrack('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'search_completed' });
    mockSession.mockResolvedValue(sessionRow(CANCELLED));
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-OTHER' });
    expect(await reopenCancelledTrack('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'other_active' });
    expect(mockClearCancelled).not.toHaveBeenCalled();
  });
  it('fehlgeschlagener Versuch löscht nichts (Persistenzfehler beim Marker)', async () => {
    mockSession.mockResolvedValue(sessionRow(CANCELLED));
    await writePendingNow('dog-A', pending({ status: 'cancelled' }));
    mockClearCancelled.mockResolvedValue(false);
    expect(await reopenCancelledTrack('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'not_cancelled' });
    expect((await loadPending('dog-A'))?.status).toBe('cancelled');   // unverändert
    expect((await loadPending('dog-A'))?.trackPoints).toEqual(pts());
  });
});

describe('Rein: planReopenCancelled', () => {
  const local = (payload: Record<string, unknown>): LocalSessionSnapshot => ({
    session: sessionRow(payload) as never, layPoints: [layRow(0), layRow(1), layRow(2)] as never, markers: [], searchPointCount: 0,
  });
  it('nur „cancelled" ist wiederöffenbar; Puffer derselben Session wird resting, fremder Puffer nie', () => {
    const base = { registry: {}, dogId: 'dog-A', sessionId: 'sess-A', now: LAY_END + 1 };
    expect(planReopenCancelled({ ...base, pending: null, local: local({ distanceMeters: 1 }) })).toEqual({ ok: false, reason: 'not_cancelled' });
    const ok = planReopenCancelled({ ...base, pending: pending({ status: 'cancelled' }), local: local(CANCELLED) });
    expect(ok.ok && ok.pendingToWrite?.status).toBe('resting');
    const other = planReopenCancelled({ ...base, pending: pending({ sessionId: 'sess-X', status: 'cancelled' }), local: local(CANCELLED) });
    expect(other.ok && other.pendingToWrite).toBeNull();
  });
});

describe('16: Multi-Dog Overlay', () => {
  it('wieder geöffnete, fortgesetzte Fährte ist für einen anderen eigenen Hund wieder als Referenz sichtbar', async () => {
    mockSession.mockResolvedValue(sessionRow(CANCELLED));
    await writePendingNow('dog-A', pending({ status: 'cancelled' }));
    await reopenCancelledTrack('sess-A', 'dog-A');
    await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    const c = selectReferenceCandidates(useActiveFaehrten.getState().byDog, {
      currentUserDogs: [{ id: 'dog-A', name: 'Amoun', owner_id: 'user-1' }, { id: 'dog-B', name: 'Baily', owner_id: 'user-1' }],
      ownerUserId: 'user-1', currentDogId: 'dog-B',
    });
    expect(c.map(x => x.dogId)).toEqual(['dog-A']);
  });
});
