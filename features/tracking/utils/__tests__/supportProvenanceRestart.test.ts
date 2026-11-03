import { DatabaseSync } from 'node:sqlite';

// Fresh JS module instances share only the simulated native persistent bytes
// and in-memory SQLite, not account epochs, pending promises or JS queues.
const mockPersistentBytes = new Map<string, string>();
let mockRemovalFails = false, mockIntentWriteFails = false;
let mockDb: DatabaseSync;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockPersistentBytes.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (mockIntentWriteFails && key.startsWith('anyvo.support.provenance.cleanup.v1::')) throw new Error('synthetic intent I/O failure');
    mockPersistentBytes.set(key, value);
  },
  removeItem: async (key: string) => { mockPersistentBytes.delete(key); },
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
  mockPersistentBytes.clear(); mockRemovalFails = false; mockIntentWriteFails = false;
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(`create table local_training_sessions(local_id text primary key,user_id text,remote_id text,deleted_at text);
    insert into local_training_sessions values('deleted','owner-A',null,null),('valid','owner-A',null,null),('foreign','owner-B',null,null);`);
});
afterEach(() => mockDb.close());

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
