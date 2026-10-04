// „Recovery: cancelled" auf echtem Gerät: KEIN technischer Cancel-/Race-Pfad. Belegt:
// • Reihenfolge/Latenz von AsyncStorage vs. SQLite, parallele Prüfungen, späte Registry-
//   Hydration und paralleler Self-Heal ändern die Entscheidung nicht und schreiben NICHTS.
// • Der Marker 'cancelled' entsteht nur über recordTrackCancelled aus zwei Nutzer-Dialogen.
// • Ein Abbruch löscht keine Punkte/Puffer und trifft nie die Fährte eines anderen Hundes.
import { readFileSync } from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import {
  evaluateTrackRecovery, healActiveFaehrtenFromPending, recordTrackCancelled,
} from '@/features/tracking/services/trackRecoveryService';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockSession = jest.fn();
const mockLay = jest.fn();
const mockMarkers = jest.fn();
const mockSearch = jest.fn();
const mockMarkCancelled = jest.fn();
const mockSetLifecycle = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSession(...a),
  markLocalTrackCancelled: (...a: unknown[]) => mockMarkCancelled(...a),
  setLocalTrackLifecycle: (...a: unknown[]) => mockSetLifecycle(...a),
  markTrainingAsDeleted: jest.fn(),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({ endLiegezeitNotification: async () => undefined }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: (...a: unknown[]) => mockLay(...a),
  getTrackMarkersBySession: (...a: unknown[]) => mockMarkers(...a),
  getSearchPointsBySession: (...a: unknown[]) => mockSearch(...a),
  deleteSearchPointsBySession: jest.fn(),
}));

const LAY_END_ISO = '2026-10-04T08:30:00.000Z';
const LAY_END = Date.parse(LAY_END_ISO);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const delayed = <T,>(ms: number, v: T) => async () => { await sleep(ms); return v; };
const layRow = (i: number) => ({ local_id: `p${i}`, session_local_id: 'sess-A', latitude: 47 + i * 1e-4, longitude: 8, accuracy: 4,
  altitude: null, speed: null, heading: null, timestamp: new Date(LAY_END - (10 - i) * 1000).toISOString(), point_type: 'lay' });
const sessionRow = (payload: Record<string, unknown> = { distanceMeters: 50 }) => ({
  local_id: 'sess-A', user_id: 'user-1', dog_id: 'dog-A', type: 'track', status: 'completed', ended_at: LAY_END_ISO,
  duration_seconds: 300, deleted_at: null, payload_json: JSON.stringify(payload),
});
const pending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: 'sess-A', dogId: 'dog-A',
  trackPoints: [0, 1, 2].map(i => ({ lat: 47 + i * 1e-4, lng: 8, accuracy: 4, t: LAY_END - (10 - i) * 1000 })),
  markers: [], runPoints: [], distanceMeters: 50, durationSeconds: 300,
  layFinishedAt: LAY_END, layStartedAt: LAY_END, startAnchor: null, savedAt: LAY_END, status: 'resting', ...over,
});
const noWrites = () => {
  expect(mockMarkCancelled).not.toHaveBeenCalled();
  expect(mockSetLifecycle).not.toHaveBeenCalled();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], isRecording: false });
  [mockSession, mockLay, mockMarkers, mockSearch, mockMarkCancelled, mockSetLifecycle].forEach(m => m.mockReset());
  mockSession.mockResolvedValue(sessionRow());
  mockLay.mockResolvedValue([layRow(0), layRow(1), layRow(2)]);
  mockMarkers.mockResolvedValue([]);
  mockSearch.mockResolvedValue([]);
});

describe('Kein technischer Cancel: Reihenfolge, Parallelität, Hydration', () => {
  it('6. langsames AsyncStorage + schnelles SQLite → gleiche, gültige Entscheidung, nichts geschrieben', async () => {
    await writePendingNow('dog-A', pending());
    const getItem = AsyncStorage.getItem as jest.Mock;
    const real = getItem.getMockImplementation()!;
    getItem.mockImplementation(async (k: string) => { await sleep(60); return real(k); });
    mockSession.mockImplementation(delayed(1, sessionRow()));
    let d;
    try { d = await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' }); }
    finally { getItem.mockImplementation(real); }   // Original-Mock wiederherstellen (kein mockRestore auf jest.fn)
    expect(d).toMatchObject({ ok: true, mode: 'resting' });
    noWrites();
  });
  it('7. langsames SQLite + schnelles AsyncStorage → gleiche Entscheidung', async () => {
    await writePendingNow('dog-A', pending());
    mockSession.mockImplementation(delayed(60, sessionRow()));
    mockLay.mockImplementation(delayed(80, [layRow(0), layRow(1), layRow(2)]));
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true, mode: 'resting' });
    noWrites();
  });
  it('5. zweite Prüfung während die erste noch lädt → beide gültig, keine Stornierung, keine Writes', async () => {
    mockSession.mockImplementation(delayed(40, sessionRow()));
    const [a, b] = await Promise.all([
      evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' }),
      evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' }),
    ]);
    expect(a).toMatchObject({ ok: true, source: 'session' });
    // Gleiche Entscheidung (savedAt = Date.now() je Prüfung ist bewusst ausgenommen).
    const core = (d: typeof a) => (d.ok ? { ok: d.ok, source: d.source, mode: d.mode, target: d.target, session: d.pendingToWrite?.sessionId } : d);
    expect(core(b)).toEqual(core(a));
    noWrites();
  });
  it('8. Registry erst nach Prüfungsbeginn hydratisiert → Entscheidung wartet und bleibt gültig', async () => {
    await AsyncStorage.setItem('anyvo_active_faehrten_v1', JSON.stringify({}));
    useActiveFaehrten.setState({ byDog: {}, hydrated: false });
    await writePendingNow('dog-A', pending());
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toMatchObject({ ok: true });
    expect(useActiveFaehrten.getState().hydrated).toBe(true);
    noWrites();
  });
  it('9. Self-Heal parallel zur Prüfung → kein cancelled, Registry danach korrekt resting', async () => {
    await writePendingNow('dog-A', pending());
    const [d] = await Promise.all([
      evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' }),
      healActiveFaehrtenFromPending(['dog-A']),
    ]);
    expect(d.ok).toBe(true);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    noWrites();
  });
  it('15. bereits final abgesuchte Fährte (payload.run) wird nicht wiederhergestellt — Reason search_completed, nie cancelled', async () => {
    mockSession.mockResolvedValue(sessionRow({ distanceMeters: 50, run: { score: 90 } }));
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' })).toEqual({ ok: false, reason: 'search_completed' });
  });
});

describe('Bewusster Nutzer-Abbruch: bleibt möglich, zerstört keine Daten, trifft nie fremde Fährten', () => {
  it('12. echter Abbruch → Marker mit Quelle; danach Reason cancelled', async () => {
    mockMarkCancelled.mockResolvedValue(true);
    expect(await recordTrackCancelled('sess-A', 'dog-A', 'resting_abort')).toBe(true);
    expect(mockMarkCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    mockSession.mockResolvedValue(sessionRow({ distanceMeters: 50, trackLifecycleStatus: 'cancelled', trackLifecycleSource: 'resting_abort', trackLifecycleUpdatedAt: '2026-10-04T09:00:00.000Z' }));
    expect(await evaluateTrackRecovery({ sessionId: 'sess-A', dogId: 'dog-A' }))
      .toEqual({ ok: false, reason: 'cancelled', detail: { lifecycleSource: 'resting_abort', lifecycleAt: '2026-10-04T09:00:00.000Z' } });
  });
  it('14. Abbruch löscht weder Pending-Puffer noch SQLite-Punkte/Session', async () => {
    mockMarkCancelled.mockResolvedValue(true);
    await writePendingNow('dog-A', pending());
    await recordTrackCancelled('sess-A', 'dog-A', 'resting_abort');
    expect((await loadPending('dog-A'))?.trackPoints).toHaveLength(3);
    expect(mockSetLifecycle).not.toHaveBeenCalled();   // nur der Marker (über markLocalTrackCancelled), keine weiteren Writes
  });
  it('Abbruch einer Fährte lässt Registry/Puffer eines ANDEREN Hundes unberührt', async () => {
    mockMarkCancelled.mockResolvedValue(true);
    await writePendingNow('dog-B', pending({ sessionId: 'sess-B', dogId: 'dog-B' }));
    useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B' });
    await recordTrackCancelled('sess-A', 'dog-A', 'resting_abort');
    expect(useActiveFaehrten.getState().get('dog-B')?.sessionId).toBe('sess-B');
    expect((await loadPending('dog-B'))?.status).toBe('resting');
  });
  it('Marker wird nicht gesetzt, wenn die Session einem anderen Hund gehört (Repository-Hund-Bindung)', async () => {
    mockMarkCancelled.mockResolvedValue(false);
    expect(await recordTrackCancelled('sess-A', 'dog-B', 'resting_abort')).toBe(false);
  });
});

describe('Quellen des Markers (Source-Vertrag)', () => {
  const read = (f: string) => readFileSync(f, 'utf8');
  it('recordTrackCancelled wird nur aus den zwei Nutzer-Dialogen aufgerufen — nie aus Recovery-, Resume- oder Self-Heal-Code', () => {
    const liegen = read('app/track/liegen.tsx');
    const legen = read('app/track/legen.tsx');
    expect(liegen.match(/recordTrackCancelled\(/g)).toHaveLength(1);
    expect(legen.match(/recordTrackCancelled\(/g)).toHaveLength(1);
    for (const f of ['app/track/run.tsx', 'app/track/[id].tsx', 'features/tracking/components/TrackResumeCta.tsx',
      'features/tracking/components/ActiveFaehrtenSelfHeal.tsx', 'app/_layout.tsx', 'features/tracking/store/trackingStore.ts']) {
      expect(read(f)).not.toMatch(/recordTrackCancelled|markLocalTrackCancelled|setLocalTrackLifecycle\([^)]*'cancelled'/);
    }
    const svc = read('features/tracking/services/trackRecoveryService.ts');
    expect(svc.match(/markLocalTrackCancelled\(/g)).toHaveLength(1);
  });
  it('beide Dialoge setzen den Marker erst nach ausdrücklicher Bestätigung mit ehrlicher Folge', () => {
    const liegen = read('app/track/liegen.tsx');
    expect(liegen.indexOf("'Endgültig abbrechen'")).toBeLessThan(liegen.indexOf('recordTrackCancelled('));
    expect(liegen).toContain('kann danach aber nicht mehr fortgesetzt oder abgesucht werden.');
    const legen = read('app/track/legen.tsx');
    expect(legen.indexOf("'Endgültig abbrechen'")).toBeLessThan(legen.indexOf('recordTrackCancelled('));
    expect(legen).toContain('kann danach aber nicht mehr fortgesetzt oder abgesucht werden.');
  });
});
