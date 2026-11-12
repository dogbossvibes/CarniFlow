import { DatabaseSync } from 'node:sqlite';

// Fresh JS module instances share only the simulated native persistent bytes
// and in-memory SQLite, not account epochs, pending promises or JS queues.
const mockPersistentBytes = new Map<string, string>();
let mockRemovalFails = false, mockIntentWriteFails = false;
let mockDb: DatabaseSync;
let mockFailSetKey: string | null = null, mockFailRemoveKey: string | null = null;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockPersistentBytes.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (key === mockFailSetKey) throw new Error('synthetic exact write failure');
    if (mockIntentWriteFails && key.startsWith('anyvo.support.provenance.cleanup.v1::')) throw new Error('synthetic intent I/O failure');
    mockPersistentBytes.set(key, value);
  },
  removeItem: async (key: string) => {
    if (key === mockFailRemoveKey) throw new Error('synthetic exact remove failure');
    mockPersistentBytes.delete(key);
  },
  getAllKeys: async () => [...mockPersistentBytes.keys()],
  multiRemove: async (keys: string[]) => {
    if (mockRemovalFails) throw new Error('synthetic removal failure');
    keys.forEach(key => mockPersistentBytes.delete(key));
  },
}));
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
}) }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.6', nativeBuildVersion: '57' }));
jest.mock('expo-device', () => ({ modelName: 'Synthetic Phone', osVersion: '26.0' }));
jest.mock('expo-updates', () => ({ isEnabled: false }));
const sidecar = (owner: string, parent: string) => 'anyvo.support.provenance.v2::' + JSON.stringify([owner, parent]);
const intent = (owner: string, parent: string) => 'anyvo.support.provenance.cleanup.v1::' + JSON.stringify([owner, parent]);
function freshRuntime(owner: string) {
  let runtime!: { store: typeof import('../supportProvenanceStore'); access: typeof import('@/lib/diagnosticsAccessState') };
  jest.isolateModules(() => {
    runtime = { store: jest.requireActual('../supportProvenanceStore'), access: jest.requireActual('@/lib/diagnosticsAccessState') };
    runtime.access.setDiagnosticsSession(owner);
  });
  return runtime;
}
beforeEach(() => {
  jest.useFakeTimers(); mockFailSetKey = null; mockFailRemoveKey = null;
  mockPersistentBytes.clear(); mockRemovalFails = false; mockIntentWriteFails = false;
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(`create table local_training_sessions(local_id text primary key,user_id text,remote_id text,deleted_at text);
    insert into local_training_sessions values('deleted','owner-A',null,null),('valid','owner-A',null,null),('foreign','owner-B',null,null);`);
});
afterEach(() => { mockDb.close(); jest.clearAllTimers(); jest.useRealTimers(); });

it.each([false, true])('retries after a fresh JS runtime and account switch; intent write failed=%s', async intentFailure => {
  const first = freshRuntime('owner-A');
  await first.store.recordSupportProvenance('deleted', 'lay', false);
  await first.store.recordSupportProvenance('valid', 'lay', false);
  first.access.setDiagnosticsSession('owner-B'); await first.store.recordSupportProvenance('foreign', 'lay', false);
  first.access.setDiagnosticsSession('owner-A');
  const preserved = mockPersistentBytes.get(sidecar('owner-A', 'valid'));
  const foreign = mockPersistentBytes.get(sidecar('owner-B', 'foreign'));
  const cleanup = first.store.beginSupportProvenanceDeletion(['deleted']);
  mockDb.exec("update local_training_sessions set deleted_at='synthetic-deleted' where local_id='deleted'");
  mockRemovalFails = true; mockIntentWriteFails = intentFailure;
  expect(await cleanup.commit()).toBe(false);
  expect(mockPersistentBytes.has(sidecar('owner-A', 'deleted'))).toBe(true);
  expect(mockPersistentBytes.has(intent('owner-A', 'deleted'))).toBe(!intentFailure);
  mockRemovalFails = false; mockIntentWriteFails = false;
  const second = freshRuntime('owner-B');
  await second.store.loadSupportRecordingProvenance('foreign');
  expect(mockPersistentBytes.has(sidecar('owner-A', 'deleted'))).toBe(true);
  second.access.setDiagnosticsSession('owner-A');
  expect((await second.store.loadSupportRecordingProvenance('valid')).lay.availability).toBe('available');
  expect(mockPersistentBytes.has(sidecar('owner-A', 'deleted'))).toBe(false);
  expect(mockPersistentBytes.has(intent('owner-A', 'deleted'))).toBe(false);
  expect(mockPersistentBytes.get(sidecar('owner-A', 'valid'))).toBe(preserved);
  expect(mockPersistentBytes.get(sidecar('owner-B', 'foreign'))).toBe(foreign);
});

it.each([false, true])('retries a completed explicit local wipe after restart; intent write failed=%s', async intentFailure => {
  const first = freshRuntime('owner-A'); await first.store.recordSupportProvenance('deleted', 'lay', false);
  mockPersistentBytes.set('unrelated-customer-key', 'unchanged');
  const cleanup = first.store.beginSupportProvenanceWipe();
  mockDb.exec('delete from local_training_sessions');
  mockRemovalFails = true; mockIntentWriteFails = intentFailure;
  expect(await cleanup.commit()).toBe(false); mockRemovalFails = false; mockIntentWriteFails = false;
  expect(mockPersistentBytes.has(intent('owner-A', 'deleted'))).toBe(!intentFailure);
  const second = freshRuntime('owner-A'); await second.store.loadSupportRecordingProvenance('missing');
  expect(mockPersistentBytes.has(sidecar('owner-A', 'deleted'))).toBe(false);
  expect(mockPersistentBytes.has(intent('owner-A', 'deleted'))).toBe(false);
  expect(mockPersistentBytes.get('unrelated-customer-key')).toBe('unchanged');
});

it('retries only an explicitly marked diagnostic clear while preserving other valid historical provenance', async () => {
  const first = freshRuntime('owner-A');
  await first.store.recordSupportProvenance('deleted', 'lay', false); await first.store.recordSupportProvenance('valid', 'lay', false);
  const clear = first.store.beginSupportProvenanceDeletion(['deleted']);
  mockRemovalFails = true; expect(await clear.commit()).toBe(false); mockRemovalFails = false;
  const second = freshRuntime('owner-A'); await second.store.loadSupportRecordingProvenance('valid');
  expect(mockPersistentBytes.has(sidecar('owner-A', 'deleted'))).toBe(false);
  expect((await second.store.loadSupportRecordingProvenance('valid')).lay.availability).toBe('available');
  expect(mockDb.prepare('select count(*) as n from local_training_sessions where deleted_at is null').get()?.n).toBe(3);
});


const qaKey = (id: string) => 'anyvo.qa.trackCapture.' + id;
const qaIndex = 'anyvo.qa.trackCapture.index';
function allowQa(runtime: ReturnType<typeof freshRuntime>, owner: string) {
  runtime.access.resolveDiagnosticsAccess(owner, runtime.access.getDiagnosticsAccessSnapshot().generation, true);
}
function syntheticCapture(id: string): import('../qaSessionCapture').QaSessionCapture {
  return { captureVersion: 1, sessionLocalId: id, durationMs: 0,
    counts: { rawFixes: 0, acceptedFixes: 0, rejectedFixes: 0, detectorPoints: 0, linePoints: 0 },
    distances: { rawPathM: 0, detectorPathM: 0, recordedLineM: 0, storeDistanceM: 0 },
    rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [] };
}

async function withQaRuntime(owner: string, work: (runtime: ReturnType<typeof freshRuntime> & {
  qa: typeof import('../qaSessionCapture');
}) => Promise<void>) {
  // Keep the registry alive through awaits: clearQaSessionCaptures lazy-loads its store.
  await jest.isolateModulesAsync(async () => {
    const runtime = { store: jest.requireActual('../supportProvenanceStore'),
      access: jest.requireActual('@/lib/diagnosticsAccessState'), qa: jest.requireActual('../qaSessionCapture') };
    runtime.access.setDiagnosticsSession(owner);
    await work(runtime);
  });
}

it.each(['first intent', 'second intent', 'sidecar removal', 'capture removal', 'index removal'])(
  'QA clear retains retry identity after %s failure and completes in a fresh authorized runtime', async failure => {
    mockDb.exec("insert into local_training_sessions values('qa-second','owner-A',null,null)");
    await withQaRuntime('owner-B', async runtime => {
      await runtime.store.recordSupportProvenance('foreign', 'lay', false);
    });
    const foreign = mockPersistentBytes.get(sidecar('owner-B', 'foreign'));
    const parents = mockDb.prepare('select * from local_training_sessions order by local_id').all();
    mockPersistentBytes.set('unrelated-customer-key', 'unchanged');
    let ids: string[] = [], valid: string | undefined;
    await withQaRuntime('owner-A', async first => {
      allowQa(first, 'owner-A');
      for (const id of ['deleted', 'qa-second']) {
        await first.store.recordSupportProvenance(id, 'lay', false);
        await first.qa.saveQaSessionCapture(syntheticCapture(id));
      }
      await first.store.recordSupportProvenance('valid', 'lay', false);
      valid = mockPersistentBytes.get(sidecar('owner-A', 'valid'));
      ids = await first.qa.listQaSessionCaptureIds();
      if (failure === 'first intent') mockFailSetKey = intent('owner-A', ids[0]);
      if (failure === 'second intent') mockFailSetKey = intent('owner-A', ids[1]);
      if (failure === 'sidecar removal') mockRemovalFails = true;
      if (failure === 'capture removal') mockFailRemoveKey = qaKey(ids[1]);
      if (failure === 'index removal') mockFailRemoveKey = qaIndex;
      await first.qa.clearQaSessionCaptures();
      expect(await first.qa.listQaSessionCaptureIds()).toEqual(ids);
    });
    mockFailSetKey = null; mockFailRemoveKey = null; mockRemovalFails = false;
    await withQaRuntime('owner-B', async runtime => {
      await runtime.store.loadSupportRecordingProvenance('foreign');
      expect(mockPersistentBytes.get(sidecar('owner-B', 'foreign'))).toBe(foreign);
    });
    await withQaRuntime('owner-A', async restarted => {
      // A restart/account switch does not itself grant internal diagnostic access.
      await restarted.qa.clearQaSessionCaptures();
      expect(JSON.parse(mockPersistentBytes.get(qaIndex)!)).toEqual(ids);
      allowQa(restarted, 'owner-A');
      await restarted.qa.clearQaSessionCaptures();
      expect(await restarted.qa.listQaSessionCaptureIds()).toEqual([]);
      for (const id of ids) {
        expect(mockPersistentBytes.has(qaKey(id))).toBe(false);
        expect(mockPersistentBytes.has(sidecar('owner-A', id))).toBe(false);
        expect(mockPersistentBytes.has(intent('owner-A', id))).toBe(false);
      }
      await restarted.qa.clearQaSessionCaptures(); // Idempotent after completion.
    });
    expect(mockPersistentBytes.get(sidecar('owner-A', 'valid'))).toBe(valid);
    expect(mockPersistentBytes.get(sidecar('owner-B', 'foreign'))).toBe(foreign);
    expect(mockPersistentBytes.get('unrelated-customer-key')).toBe('unchanged');
    expect(mockDb.prepare('select * from local_training_sessions order by local_id').all()).toEqual(parents);
  });
