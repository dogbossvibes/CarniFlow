// Recovery-Service (I/O): echte Registry + echter Pending-Slot (AsyncStorage-Mock),
// lokale SQLite gemockt. Belegt: keine neue Session, kein Quota-Claim, offline-fähig.
// jest.mock wird von babel-jest über die Imports gehoben.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import {
  applyTrackRecovery, completeTrackWithoutApp, discardSearchAttempt, evaluateTrackRecovery, healActiveFaehrtenFromPending, recordTrackCancelled,
} from '@/features/tracking/services/trackRecoveryService';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockSession = jest.fn();
const mockLay = jest.fn();
const mockMarkers = jest.fn();
const mockSearch = jest.fn();
const mockDeleteSearch = jest.fn(async (..._a: unknown[]) => undefined);
const mockCreateSession = jest.fn();
const mockClaimQuota = jest.fn();
const mockRemote = jest.fn();
const mockMarkCancelled = jest.fn();
const mockSetLifecycle = jest.fn();
const mockDeleteSession = jest.fn();
const mockEndNotification = jest.fn(async () => undefined);

jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
  createLocalTrainingSession: (...a: unknown[]) => mockCreateSession(...a),
  markLocalTrackCancelled: (...a: unknown[]) => mockMarkCancelled(...a),
  setLocalTrackLifecycle: (...a: unknown[]) => mockSetLifecycle(...a),
  markTrainingAsDeleted: (...a: unknown[]) => mockDeleteSession(...a),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({ endLiegezeitNotification: () => mockEndNotification() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockLay(...a),
  getTrackMarkersBySession: (...a: unknown[]) => mockMarkers(...a),
  getSearchPointsBySession: (...a: unknown[]) => mockSearch(...a),
  deleteSearchPointsBySession: (...a: unknown[]) => mockDeleteSearch(...a),
}));
jest.mock('@/services/quotaService', () => ({ claimNewbieQuota: (...a: unknown[]) => mockClaimQuota(...a) }));
jest.mock('@/features/tracking/services/trackService', () => ({ getTrackSessionById: (...a: unknown[]) => mockRemote(...a) }));

const LAY_END_ISO = '2026-10-04T08:30:00.000Z';
const LAY_END = Date.parse(LAY_END_ISO);
const layRow = (i: number) => ({
  local_id: `pt-${i}`, session_local_id: 'sess-A', latitude: 47 + i * 1e-4, longitude: 8 + i * 1e-4, accuracy: 4,
  altitude: null, speed: null, heading: null, timestamp: new Date(LAY_END - (10 - i) * 1000).toISOString(), point_type: 'lay',
});
const sessionRow = {
  local_id: 'sess-A', user_id: 'user-1', dog_id: 'dog-A', type: 'track', status: 'completed', ended_at: LAY_END_ISO,
  duration_seconds: 300, deleted_at: null, payload_json: JSON.stringify({ distanceMeters: 123 }),
};
const pending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: 'sess-A', dogId: 'dog-A',
  trackPoints: [0, 1, 2].map(i => ({ lat: 47 + i * 1e-4, lng: 8 + i * 1e-4, accuracy: 4, t: LAY_END - (10 - i) * 1000 })),
  markers: [], runPoints: [], distanceMeters: 123, durationSeconds: 300,
  layFinishedAt: LAY_END, layStartedAt: LAY_END, startAnchor: null, savedAt: LAY_END, status: 'resting', ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], isRecording: false });
  [mockSession, mockLay, mockMarkers, mockSearch, mockCreateSession, mockClaimQuota, mockRemote, mockMarkCancelled, mockSetLifecycle, mockDeleteSession, mockEndNotification, mockDeleteSearch].forEach(m => m.mockReset());
  mockSession.mockResolvedValue(sessionRow);
  mockLay.mockResolvedValue([layRow(0), layRow(1), layRow(2)]);
  mockMarkers.mockResolvedValue([]);
  mockSearch.mockResolvedValue([]);
  mockRemote.mockRejectedValue(new Error('offline'));
});

const noSideEffects = () => {
  expect(mockCreateSession).not.toHaveBeenCalled();
  expect(mockClaimQuota).not.toHaveBeenCalled();
  expect(mockRemote).not.toHaveBeenCalled();
};

describe('applyTrackRecovery', () => {
  it('2/3: Pending vorhanden, Registry fehlt → Registry resting, Ziel Liegezeit', async () => {
    await writePendingNow('dog-A', pending());
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, source: 'pending', target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A', layStartedAt: LAY_END });
    noSideEffects();
  });

  it('6/13/14: Pending fehlt, offline → Pending aus SQLite rekonstruiert + Registry resting, gleiche Session', async () => {
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, source: 'session' });
    const p = await loadPending('dog-A');
    expect(p).toMatchObject({ sessionId: 'sess-A', dogId: 'dog-A', status: 'resting', layStartedAt: LAY_END, distanceMeters: 123 });
    expect(p!.trackPoints).toHaveLength(3);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    noSideEffects();
  });

  it('11/12: zweimal aufgerufen → idempotent, kein Duplikat, keine Session, kein Quota-Claim', async () => {
    await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    const snapshot = await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A');
    const second = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(second).toMatchObject({ ok: true, source: 'registry', registryPatch: null, pendingToWrite: null });
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A')).toBe(snapshot);
    expect(Object.keys(useActiveFaehrten.getState().byDog)).toEqual(['dog-A']);
    noSideEffects();
  });

  it('4/5: andere offene Fährte desselben Hundes bleibt unangetastet', async () => {
    await writePendingNow('dog-A', pending({ sessionId: 'sess-OTHER' }));
    const before = await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A');
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toEqual({ ok: false, reason: 'other_pending' });
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A')).toBe(before);
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
  });

  it('8: lokal abgeschlossener Suchlauf → kein Recovery, nichts geschrieben', async () => {
    mockSession.mockResolvedValue({ ...sessionRow, payload_json: JSON.stringify({ run: { distance_meters: 90 } }) });
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'search_completed' });
    expect(await loadPending('dog-A')).toBeNull();
  });

  it('Store hält für denselben Hund eine fremde, geschlossene Session → wird mit der wiederhergestellten ersetzt', async () => {
    useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: 'sess-OLD', trackPoints: [{ lat: 1, lng: 1, t: 1 }], isRecording: false, sessionStatus: 'cancelled' });
    await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(useTrackingStore.getState().currentSessionId).toBe('sess-A');
    expect(useTrackingStore.getState().trackPoints).toHaveLength(3);
  });

  it('evaluate schreibt nichts', async () => {
    const d = await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d.ok).toBe(true);
    expect(await loadPending('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
  });

  it('SQLite-Fehler → kein Recovery, kein Crash', async () => {
    mockSession.mockRejectedValue(new Error('db'));
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'unknown_session' });
  });
});

describe('10: healActiveFaehrtenFromPending (App-Neustart)', () => {
  it('Registry leer + liegender Puffer → Registry repariert; zweiter Lauf ändert nichts', async () => {
    await writePendingNow('dog-A', pending());
    await writePendingNow('dog-B', pending({ dogId: 'dog-B', sessionId: 'sess-B', status: 'cancelled' }));
    expect(await healActiveFaehrtenFromPending(['dog-A', 'dog-B'])).toBe(1);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    expect(useActiveFaehrten.getState().get('dog-B')).toBeNull();
    expect(await healActiveFaehrtenFromPending(['dog-A', 'dog-B'])).toBe(0);
    noSideEffects();
  });
});

describe('Account-Wechsel: Selbstheilung nur für Hunde des angemeldeten Nutzers', () => {
  it('Account A hinterlässt Pending dog-A; Account B (nur dog-B) → dog-A wird NICHT registriert, dog-B schon', async () => {
    await writePendingNow('dog-A', pending({ dogId: 'dog-A', sessionId: 'sess-A' }));
    await writePendingNow('dog-B', pending({ dogId: 'dog-B', sessionId: 'sess-B' }));
    expect(await healActiveFaehrtenFromPending(['dog-B'])).toBe(1);
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-B')).toMatchObject({ status: 'resting', sessionId: 'sess-B' });
    // Der fremde Puffer bleibt unangetastet liegen (wird weder gelöscht noch gelesen).
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A')).not.toBeNull();
  });

  it('ohne Hunde (nicht angemeldet / nichts geladen) → keine Heilung', async () => {
    await writePendingNow('dog-A', pending());
    expect(await healActiveFaehrtenFromPending([])).toBe(0);
    expect(useActiveFaehrten.getState().byDog).toEqual({});
  });
});

describe('Dauerhafter Abbruch', () => {
  it('1: recordTrackCancelled schreibt den Marker für genau diese Session und diesen Hund', async () => {
    mockMarkCancelled.mockResolvedValue(true);
    expect(await recordTrackCancelled('sess-A', 'dog-A', 'resting_abort')).toBe(true);
    expect(mockMarkCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    noSideEffects();
  });

  it('ohne Session wird nichts geschrieben; ohne Hund und ohne lokale Session ebenfalls nicht', async () => {
    expect(await recordTrackCancelled(null, 'dog-A', 'resting_abort')).toBe(false);
    mockSession.mockResolvedValue(null);
    expect(await recordTrackCancelled('sess-A', undefined, 'resting_abort')).toBe(false);
    expect(mockMarkCancelled).not.toHaveBeenCalled();
  });

  it('ohne Hund (Deep-Link): Hund aus der lokalen Session; Registry-Eintrag nur dieser Session entfernt', async () => {
    mockMarkCancelled.mockResolvedValue(true);
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
    useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B' });
    expect(await recordTrackCancelled('sess-A', undefined, 'resting_abort')).toBe(true);
    expect(mockMarkCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-B')?.sessionId).toBe('sess-B');   // fremder Hund unberührt
    noSideEffects();
  });

  it('5: Persistenzfehler → kein Crash, liefert false', async () => {
    mockMarkCancelled.mockRejectedValue(new Error('db locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordTrackCancelled('sess-A', 'dog-A', 'lay_conflict')).resolves.toBe(false);
    warn.mockRestore();
  });

  it('2: Pending derselben Session mit cancelled → kein Recovery', async () => {
    await writePendingNow('dog-A', pending({ status: 'cancelled' }));
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'pending_closed' });
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
  });

  it('3: Pending gelöscht, SQLite-Session mit Abbruch-Marker → KEIN Recovery B, nichts geschrieben', async () => {
    mockSession.mockResolvedValue({ ...sessionRow, payload_json: JSON.stringify({ distanceMeters: 123, trackLifecycleStatus: 'cancelled' }) });
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'cancelled' });
    expect(await loadPending('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
  });

  it('4: normale liegende Fährte ohne Abbruch → Recovery B weiterhin möglich', async () => {
    expect(await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, source: 'session' });
  });
});

describe('„Ohne App abgeschlossen"', () => {
  beforeEach(() => { mockSetLifecycle.mockResolvedValue(true); });

  it('G/H/I: Marker gesetzt, Puffer + Registry DIESER Session entfernt, Journal-Session bleibt, nichts erfunden', async () => {
    await writePendingNow('dog-A', pending());
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect(mockSetLifecycle).toHaveBeenCalledWith('sess-A', 'dog-A', 'completed_without_app');
    expect(await loadPending('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(mockDeleteSession).not.toHaveBeenCalled();   // Journal-Eintrag bleibt
    noSideEffects();                                     // keine Session, kein Quota-Claim, kein Remote
  });

  it('danach bietet die Recovery die Fährte nicht mehr an (Marker in der SQLite-Zeile)', async () => {
    await completeTrackWithoutApp('sess-A', 'dog-A');
    mockSession.mockResolvedValue({ ...sessionRow, payload_json: JSON.stringify({ distanceMeters: 123, trackLifecycleStatus: 'completed_without_app' }) });
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'completed_without_app' });
  });

  it('räumt NIE eine andere offene Fährte desselben Hundes ab', async () => {
    await writePendingNow('dog-A', pending({ sessionId: 'sess-OTHER' }));
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-OTHER' });
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect((await loadPending('dog-A'))?.sessionId).toBe('sess-OTHER');
    expect(useActiveFaehrten.getState().get('dog-A')?.sessionId).toBe('sess-OTHER');
  });

  it('J: zweimal ausgeführt → idempotent, kein Fehler', async () => {
    await writePendingNow('dog-A', pending());
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect(await loadPending('dog-A')).toBeNull();
  });

  it('Marker nicht schreibbar → nichts wird aufgeräumt (sonst später erneut angeboten)', async () => {
    await writePendingNow('dog-A', pending());
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
    mockSetLifecycle.mockResolvedValue(false);
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'not_found' });
    mockSetLifecycle.mockRejectedValue(new Error('db'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'failed' });
    warn.mockRestore();
    expect(await loadPending('dog-A')).not.toBeNull();
    expect(useActiveFaehrten.getState().get('dog-A')).not.toBeNull();
  });

  it('hält der Aufnahme-Store genau diese Session → Store geleert + Liegezeit-Anzeige beendet', async () => {
    useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: 'sess-A', trackPoints: [{ lat: 1, lng: 1, t: 1 }], isRecording: false, sessionStatus: 'resting' });
    await completeTrackWithoutApp('sess-A', 'dog-A');
    expect(useTrackingStore.getState().currentSessionId).toBeNull();
    expect(mockEndNotification).toHaveBeenCalledTimes(1);
  });

  it('ohne Session/Hund → kein Write', async () => {
    expect(await completeTrackWithoutApp(null, 'dog-A')).toEqual({ ok: false, reason: 'no_session' });
    expect(mockSetLifecycle).not.toHaveBeenCalled();
  });
});

describe('Selbstheilung respektiert dauerhafte Lifecycle-Abschlüsse', () => {
  it('Puffer offen, aber SQLite-Zeile „Ohne App abgeschlossen" → nicht registriert', async () => {
    await writePendingNow('dog-A', pending());
    mockSession.mockResolvedValue({ ...sessionRow, payload_json: JSON.stringify({ trackLifecycleStatus: 'completed_without_app' }) });
    expect(await healActiveFaehrtenFromPending(['dog-A'])).toBe(0);
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
  });
});

describe('Searching über die zentrale Entscheidung', () => {
  it('laufende Absuche im Puffer, Registry verloren → Registry searching, Ziel run (bestehende Search-Recovery)', async () => {
    await writePendingNow('dog-A', pending({ status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 1000 }));
    mockSearch.mockResolvedValue([{}, {}, {}]);
    const d = await applyTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d).toMatchObject({ ok: true, mode: 'searching', target: '/track/run?dogId=dog-A&id=sess-A' });
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'searching', runId: 'run-1' });
    noSideEffects();
  });
});

describe('Feldfall: OFFEN + Lay-Geometrie + ended_at + keine verwertbare Suchspur', () => {
  it('Puffer + Registry verloren, kein Run, keine Suchpunkte → Resume aus SQLite sichtbar', async () => {
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A', hasRemoteSearchRun: false }))
      .toMatchObject({ ok: true, source: 'session', mode: 'resting', target: '/track/liegen?dogId=dog-A&id=sess-A' });
    noSideEffects();
  });

  it('Suchpunkte ohne beendeten Lauf → Reason search_started (kein Resume, aber schliessbar)', async () => {
    mockSearch.mockResolvedValue([{}, {}]);
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'search_started' });
  });

  it('„Ohne App abgeschlossen" funktioniert auch bei search_started (Marker + Aufräumen, nichts erfunden)', async () => {
    mockSearch.mockResolvedValue([{}, {}]);
    mockSetLifecycle.mockResolvedValue(true);
    expect(await completeTrackWithoutApp('sess-A', 'dog-A')).toEqual({ ok: true });
    expect(mockSetLifecycle).toHaveBeenCalledWith('sess-A', 'dog-A', 'completed_without_app');
    noSideEffects();
  });
});

describe('discardSearchAttempt („Absuche verwerfen")', () => {
  it('Puffer searching → Suchpunkte gelöscht, Puffer + Registry resting, Store zurückgesetzt; kein cancelled/Marker/Quota/Session', async () => {
    await writePendingNow('dog-A', pending({ status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 1000, searchPoints: [{ lat: 1, lng: 1, t: 1 }] }));
    useActiveFaehrten.getState().upsert('dog-A', { status: 'searching', sessionId: 'sess-A', runId: 'run-1', searchStartedAt: LAY_END + 1000 });
    useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: 'sess-A', trackPoints: [{ lat: 1, lng: 1, t: 1 }], isRecording: false, sessionStatus: 'searching', searchRunId: 'run-1', searchStartedAt: LAY_END + 1000 });
    const r = await discardSearchAttempt('sess-A', 'dog-A');
    expect(r).toEqual({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(mockDeleteSearch).toHaveBeenCalledWith('sess-A');
    const p = await loadPending('dog-A');
    expect(p).toMatchObject({ sessionId: 'sess-A', status: 'resting', runId: null, searchStartedAt: null });
    expect(p!.trackPoints).toHaveLength(3);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A', runId: null, searchStartedAt: null, layStartedAt: LAY_END });
    expect(useTrackingStore.getState()).toMatchObject({ sessionStatus: 'resting', searchRunId: null, searchStartedAt: null, currentSessionId: 'sess-A' });
    expect(mockMarkCancelled).not.toHaveBeenCalled();
    expect(mockSetLifecycle).not.toHaveBeenCalled();
    noSideEffects();
  });

  it('Puffer verloren + Suchpunkte (unvollständige Absuche) → aus SQLite freigegeben, danach fortsetzbar', async () => {
    mockSearch.mockResolvedValue([{}, {}, {}]);
    expect(await discardSearchAttempt('sess-A', 'dog-A')).toEqual({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(mockDeleteSearch).toHaveBeenCalledWith('sess-A');
    expect(await loadPending('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    mockSearch.mockResolvedValue([]);   // nach dem Löschen
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'resting' });
  });

  it('fremde offene Fährte desselben Hundes → nichts gelöscht, nichts überschrieben', async () => {
    await writePendingNow('dog-A', pending({ sessionId: 'sess-OTHER', status: 'searching' }));
    const before = await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A');
    expect(await discardSearchAttempt('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'other_pending' });
    expect(mockDeleteSearch).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1::dog-A')).toBe(before);
  });

  it('finaler Suchlauf → nicht verwerfbar, nichts gelöscht', async () => {
    mockSession.mockResolvedValue({ ...sessionRow, payload_json: JSON.stringify({ run: { ended_at: LAY_END_ISO } }) });
    expect(await discardSearchAttempt('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'search_completed' });
    expect(mockDeleteSearch).not.toHaveBeenCalled();
  });

  it('Löschfehler → failed, kein Crash, Puffer/Registry unverändert', async () => {
    await writePendingNow('dog-A', pending({ status: 'searching' }));
    mockDeleteSearch.mockRejectedValueOnce(new Error('db'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await discardSearchAttempt('sess-A', 'dog-A')).toEqual({ ok: false, reason: 'failed' });
    warn.mockRestore();
    expect((await loadPending('dog-A'))?.status).toBe('searching');
  });
});
