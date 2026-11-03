import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseSync } from 'node:sqlite';
import { setDiagnosticsSession, getDiagnosticsAccessSnapshot, resolveDiagnosticsAccess, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import { markTrainingAsDeleted } from '@/features/training/repositories/localTrainingRepository';
import { beginSupportProvenanceDeletion, beginSupportProvenanceWipe, canReadSupportProvenance, loadSupportRecordingProvenance, recordSupportProvenance, SUPPORT_PROVENANCE_ATTEMPT_LIMIT } from '../supportProvenanceStore';
import { saveQaSessionCapture, clearQaSessionCaptures, type QaSessionCapture } from '../qaSessionCapture';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.6', nativeBuildVersion: '57' }));
jest.mock('expo-device', () => ({ modelName: 'Synthetic Phone', osVersion: '26.0' }));
jest.mock('expo-updates', () => ({ isEnabled: true, isEmbeddedLaunch: false, isEmergencyLaunch: false,
  updateId: 'aaaaaaaa-1111-4111-8111-111111111111', runtimeVersion: 'synthetic-runtime' }));
let mockDb: DatabaseSync;
let mockDeleteFails = false;
let mockParentReadGate: { promise: Promise<void>; entered: boolean } | null = null;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => {
    const row = mockDb.prepare(sql).get(...args);
    if (mockParentReadGate && sql.startsWith('select local_id,user_id,deleted_at')) {
      const gate = mockParentReadGate; mockParentReadGate = null; gate.entered = true; await gate.promise;
    }
    return row;
  },
  runAsync: async (sql: string, ...args: any[]) => { if (mockDeleteFails && sql.startsWith('update local_training_sessions set deleted_at')) throw new Error('synthetic parent deletion failed'); return mockDb.prepare(sql).run(...args); },
}) }));

const key = (owner = 'owner-A', id = 'session-A') => 'anyvo.support.provenance.v2::' + JSON.stringify([owner, id]);
function switchAccount(owner: string | null) { setDiagnosticsSession(owner); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function entered(read: () => boolean) {
  for (let i = 0; i < 60 && !read(); i++) await Promise.resolve();
  expect(read()).toBe(true);
}
beforeEach(async () => {
  mockParentReadGate = null;
  switchAccount('owner-A');
  await loadSupportRecordingProvenance('flush');
  await AsyncStorage.clear();
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(`create table local_training_sessions(local_id text primary key,user_id text,remote_id text,deleted_at text,sync_status text,updated_at text);
    insert into local_training_sessions values('session-A','owner-A','remote-A',null,'pending',null);
    insert into local_training_sessions values('session-B','owner-B',null,null,'pending',null);
    insert into local_training_sessions values('unrelated','owner-A',null,null,'pending',null);`);
  mockDeleteFails = false;
});
afterEach(() => { jest.restoreAllMocks(); switchAccount(null); mockDb.close(); });

it('scopes reads to the real parent and account while preserving A history across logout/B/A', async () => {
  await recordSupportProvenance('remote-A', 'lay', false);
  expect(await AsyncStorage.getItem(key())).not.toBeNull(); // canonical local parent key
  expect(await AsyncStorage.getItem(key('owner-A', 'remote-A'))).toBeNull();
  switchAccount(null);
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('unknown');
  switchAccount('owner-B');
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('unknown');
  await recordSupportProvenance('session-A', 'lay', true);
  expect(await AsyncStorage.getItem(key('owner-B'))).toBeNull();
  switchAccount('owner-A');
  expect((await loadSupportRecordingProvenance('remote-A')).lay.segments).toHaveLength(1);
  await recordSupportProvenance('missing', 'lay', false);
  expect(await AsyncStorage.getItem(key('owner-A', 'missing'))).toBeNull();
});

it('fences queued writes across A/B/A and respects parent creation without blocking recording', async () => {
  const ready = deferred<void>();
  const write = recordSupportProvenance('session-A', 'lay', false, undefined, undefined, { parentReady: ready.promise, expectedOwner: 'owner-A' });
  switchAccount('owner-B'); switchAccount('owner-A'); ready.resolve(); await write;
  expect(await AsyncStorage.getItem(key())).toBeNull();
  await recordSupportProvenance('session-A', 'lay', false, undefined, undefined, { expectedOwner: 'owner-B' });
  expect(await AsyncStorage.getItem(key())).toBeNull();
  const failedParent = Promise.reject(new Error('synthetic parent creation failed'));
  await recordSupportProvenance('session-A', 'lay', false, undefined, undefined, { parentReady: failedParent });
  expect(await AsyncStorage.getItem(key())).toBeNull();
});

it('does not treat QA expiry or missing internal QA permission as an account switch', async () => {
  expect(getDiagnosticsAccessSnapshot().allowed).toBe(false);
  await recordSupportProvenance('session-A', 'lay', false);
  resolveDiagnosticsAccess('owner-A', getDiagnosticsAccessSnapshot().generation, true);
  revokeDiagnosticsAccess();
  await recordSupportProvenance('session-A', 'search', false, 'run-A');
  expect((await loadSupportRecordingProvenance('session-A', 'run-A')).search.availability).toBe('available');
});

it('discards a read or queued write finishing after the account changes', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  const originalGet = AsyncStorage.getItem.bind(AsyncStorage);
  const original = await originalGet(key());
  const readGate = deferred<string | null>(); let readEntered = false;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => { readEntered = true; return readGate.promise; });
  const read = loadSupportRecordingProvenance('session-A'); await entered(() => readEntered);
  switchAccount('owner-B'); readGate.resolve(original);
  expect((await read).lay.availability).toBe('unknown');
  switchAccount('owner-A');
  const writeGate = deferred<string | null>(); let writeEntered = false;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => { writeEntered = true; return writeGate.promise; });
  const write = recordSupportProvenance('session-A', 'lay', true); await entered(() => writeEntered);
  switchAccount('owner-B'); writeGate.resolve(original); await write;
  expect(await originalGet(key())).toBe(original);
});

it.each([false, true])('compensates an already admitted native write after account switch, prior history=%s', async previous => {
  if (previous) await recordSupportProvenance('session-A', 'lay', false);
  const prior = await AsyncStorage.getItem(key());
  const set = AsyncStorage.setItem.bind(AsyncStorage), gate = deferred<void>(); let writing = false;
  jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (k, value) => { writing = true; await gate.promise; await set(k, value); });
  const work = recordSupportProvenance('session-A', 'lay', previous); await entered(() => writing);
  switchAccount('owner-B'); gate.resolve(); await work;
  expect(await AsyncStorage.getItem(key())).toBe(prior);
});

it('removes only the new parent sidecar after successful real repository deletion and prevents late resurrection', async () => {
  await recordSupportProvenance('remote-A', 'lay', false);
  await recordSupportProvenance('session-A', 'search', false, 'run-A');
  await recordSupportProvenance('unrelated', 'lay', false);
  await AsyncStorage.setItem('unrelated-existing-customer-data', 'unchanged');
  const get = AsyncStorage.getItem.bind(AsyncStorage), gate = deferred<string | null>(); let reading = false;
  const previous = await get(key());
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => { reading = true; return gate.promise; });
  const late = recordSupportProvenance('remote-A', 'lay', true); await entered(() => reading);
  const deletion = markTrainingAsDeleted('session-A'); gate.resolve(previous); await Promise.all([late, deletion]);
  const parent = mockDb.prepare('select deleted_at,sync_status from local_training_sessions where local_id=?').get('session-A');
  expect(parent).toMatchObject({ sync_status: 'deleted_pending' }); expect(parent?.deleted_at).not.toBeNull();
  expect(await get(key())).toBeNull();
  await recordSupportProvenance('remote-A', 'search', false, 'late-run');
  expect(await get(key())).toBeNull();
  expect((await loadSupportRecordingProvenance('session-A', 'run-A')).lay.availability).toBe('unknown');
  expect(await get(key('owner-A', 'unrelated'))).not.toBeNull();
  expect(await get('unrelated-existing-customer-data')).toBe('unchanged');
});

it('keeps parent and metadata unchanged if existing parent deletion fails, then permits a retry', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  const before = await AsyncStorage.getItem(key());
  mockDeleteFails = true;
  await expect(markTrainingAsDeleted('session-A')).rejects.toThrow('synthetic parent deletion failed');
  mockDeleteFails = false;
  expect(mockDb.prepare('select deleted_at from local_training_sessions where local_id=?').get('session-A')?.deleted_at).toBeNull();
  expect(await AsyncStorage.getItem(key())).toBe(before);
  await recordSupportProvenance('session-A', 'lay', true);
  expect((await loadSupportRecordingProvenance('session-A')).lay.segments).toHaveLength(2);
});

it('bounds new attempt metadata without evicting valid history or generating one key per run', async () => {
  for (let i = 0; i < SUPPORT_PROVENANCE_ATTEMPT_LIMIT + 2; i++) await recordSupportProvenance('session-A', 'search', false, 'run-' + i);
  expect((await AsyncStorage.getAllKeys()).filter(k => k.startsWith('anyvo.support.provenance.v2::'))).toEqual([key()]);
  expect((await loadSupportRecordingProvenance('session-A', 'run-0')).search.availability).toBe('available');
  expect((await loadSupportRecordingProvenance('session-A', 'run-63')).search.availability).toBe('available');
  expect((await loadSupportRecordingProvenance('session-A', 'run-64')).search.availability).toBe('unknown');
});

it('only cleans metadata after an explicit successful wipe, never on a cancelled wipe', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  await AsyncStorage.setItem('existing-unrelated-key', 'unchanged');
  const cancelled = beginSupportProvenanceWipe(); cancelled.cancel(); cancelled.cancel();
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('available');
  const wipe = beginSupportProvenanceWipe();
  await recordSupportProvenance('session-A', 'lay', true); // fenced while explicit wipe is in flight
  await wipe.commit();
  expect(await AsyncStorage.getItem(key())).toBeNull();
  expect(await AsyncStorage.getItem('existing-unrelated-key')).toBe('unchanged');
});

it('keeps overlapping diagnostic fences active until both complete', async () => {
  const a = beginSupportProvenanceDeletion(['session-A']), b = beginSupportProvenanceDeletion(['session-A']);
  a.cancel(); a.cancel();
  await recordSupportProvenance('session-A', 'lay', false);
  expect(await AsyncStorage.getItem(key())).toBeNull();
  b.cancel(); await recordSupportProvenance('session-A', 'lay', false);
  expect(await AsyncStorage.getItem(key())).not.toBeNull();
});

it('explicit QA clear removes only selected diagnostic parents without deleting training rows', async () => {
  resolveDiagnosticsAccess('owner-A', getDiagnosticsAccessSnapshot().generation, true);
  const capture: QaSessionCapture = { captureVersion: 1, sessionLocalId: 'session-A', durationMs: 1000,
    counts: { rawFixes: 0, acceptedFixes: 0, rejectedFixes: 0, detectorPoints: 0, linePoints: 0 },
    distances: { rawPathM: 0, detectorPathM: 0, recordedLineM: 0, storeDistanceM: 0 },
    rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [] };
  await saveQaSessionCapture(capture);
  await recordSupportProvenance('session-A', 'lay', false);
  await recordSupportProvenance('unrelated', 'lay', false);
  await clearQaSessionCaptures();
  expect(await AsyncStorage.getItem(key())).toBeNull();
  expect(await AsyncStorage.getItem(key('owner-A', 'unrelated'))).not.toBeNull();
  expect(mockDb.prepare('select count(*) as n from local_training_sessions where deleted_at is null').get()?.n).toBe(3);
});


it('keeps successful primary deletion successful if only new diagnostic cleanup fails', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('synthetic metadata removal failed'));
  await expect(markTrainingAsDeleted('session-A')).resolves.toBeUndefined();
  expect(mockDb.prepare('select sync_status from local_training_sessions where local_id=?').get('session-A')?.sync_status).toBe('deleted_pending');
  expect(await AsyncStorage.getItem(key())).not.toBeNull(); // native cleanup failed, not claimed as removed
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('unknown');
});

it('releases a cancelled parent fence after a separate cancelled wipe without losing preserved metadata', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  const parent = beginSupportProvenanceDeletion(['session-A']);
  const wipe = beginSupportProvenanceWipe();
  wipe.cancel(); parent.cancel();
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('available');
  await recordSupportProvenance('session-A', 'lay', true);
  expect((await loadSupportRecordingProvenance('session-A')).lay.segments).toHaveLength(2);
});

it('rejects a delayed alias SQLite snapshot captured before successful canonical parent deletion', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  const wait = deferred<void>(); const gate = { promise: wait.promise, entered: false }; mockParentReadGate = gate;
  const authorization = canReadSupportProvenance('remote-A'); await entered(() => gate.entered);
  await markTrainingAsDeleted('session-A');
  wait.resolve(); expect(await authorization).toBe(false);
  expect(await canReadSupportProvenance('session-A')).toBe(false);
});


it('retains a durable cleanup intent and automatically retries only new metadata on the next export/read', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  await recordSupportProvenance('unrelated', 'lay', false);
  jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('synthetic removal failed'));
  await markTrainingAsDeleted('session-A');
  const intent = 'anyvo.support.provenance.cleanup.v1::' + JSON.stringify(['owner-A', 'session-A']);
  expect(await AsyncStorage.getItem(intent)).toBe('1');
  expect(await AsyncStorage.getItem(key())).not.toBeNull();
  // No deletion retry of the source row: an ordinary later metadata read drains it.
  expect((await loadSupportRecordingProvenance('unrelated')).lay.availability).toBe('available');
  expect(await AsyncStorage.getItem(intent)).toBeNull(); expect(await AsyncStorage.getItem(key())).toBeNull();
  expect(mockDb.prepare('select sync_status from local_training_sessions where local_id=?').get('session-A')?.sync_status).toBe('deleted_pending');
});

it('uses the retained soft-deleted parent as durable retry evidence if intent writing itself failed', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('synthetic intent write failed'));
  await markTrainingAsDeleted('session-A');
  expect(await AsyncStorage.getItem(key())).not.toBeNull();
  await loadSupportRecordingProvenance('unrelated');
  expect(await AsyncStorage.getItem(key())).toBeNull();
});

it('never appends a new segment into a sidecar still awaiting an explicit diagnostic-clear retry', async () => {
  await recordSupportProvenance('session-A', 'lay', false);
  const before = await AsyncStorage.getItem(key());
  const failure = new Error('synthetic repeated cleanup failure');
  jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
  const cleared = beginSupportProvenanceDeletion(['session-A']); // after an explicit diagnostic clear; parent stays valid
  expect(await cleared.commit()).toBe(false);
  await recordSupportProvenance('session-A', 'lay', true);
  expect(await AsyncStorage.getItem(key())).toBe(before);
  expect((await loadSupportRecordingProvenance('session-A')).lay.availability).toBe('unknown');
  await loadSupportRecordingProvenance('unrelated'); // recovered native storage retries only the marked diagnostic sidecar
  expect(await AsyncStorage.getItem(key())).toBeNull();
  expect(mockDb.prepare('select deleted_at from local_training_sessions where local_id=?').get('session-A')?.deleted_at).toBeNull();
});
