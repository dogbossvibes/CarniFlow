import { trainingUnitFingerprint } from '@/features/training/documentation/retry';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocumentedUnit, saveDocumentedUnitAtomic, finishTrainingUnit } from '../trainingUnitService';
import { saveAtomicTrainingDocument, listServerTrainingFocuses } from '../trainingDocumentService';

const mockRpc = jest.fn();
const mockSave = jest.fn();
const mockGet = jest.fn();
const mockFrom = jest.fn();
let mockCounter = 0;
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockCounter}` }));
jest.mock('@/features/ai/services/trainingEmbeddingService', () => ({ createEmbeddingForTrainingSession: jest.fn(), createEmbeddingForExerciseNote: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) } }));
const metrics = { motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null };
const payload = { ...metrics, dog_id: 'dog-a', session_date: '2026-10-15', started_at: null, ended_at: null,
  duration_sec: null, score: null, notes: 'today', photos: [], videos: [], audio_files: [], shared_with_trainer: false };
const exercises = [{ id: 'occurrence-a', discipline: 'Obedience', exercise_name: 'Sit', rating: 3, notes: null, duration_sec: null, seq_index: 0 }];
const unit = { ...payload, id: 'unit-a', owner_id: 'owner-a', status: 'completed', rating: 4, created_at: '2026-10-15T12:00:00Z' };
const response = (request: any, duplicate = false) => ({ data: { version: 1, unitId: request.unitId, token: 'token-1', currentToken: 'token-1', duplicate, exerciseIds: request.exercises.map((e: any) => e.id) }, error: null });
beforeEach(async () => {
  jest.clearAllMocks(); mockCounter = 0; await AsyncStorage.clear();
  mockSave.mockReset().mockImplementation(async request => response(request));
  mockGet.mockReset().mockResolvedValue({ data: { version: 1, unitId: 'unit-a', token: 'snapshot-1', document: { unit, exercises } }, error: null });
  mockRpc.mockImplementation(async (rpc, args) => rpc === 'training_document_v1' ? args.p_action === 'get' ? mockGet() : mockSave(args.p_request) : { data: [], error: null });
  mockFrom.mockImplementation(() => { const chain: any = { select: () => chain, eq: () => chain, then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve) }; return chain; });
});
const noLegacyWrites = () => expect(mockFrom.mock.calls.map(call => call[0]).filter(table => ['training_units', 'training_exercises', 'newbie_quota_claims'].includes(table))).toEqual([]);

test('new documentation sends one atomic save, no separate quota/parent/child calls', async () => {
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error).toBeNull();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('training_document_v1', expect.objectContaining({ p_action: 'save', p_request: expect.objectContaining({ expectedOwnerId: 'owner-a', expectedToken: null, unit: expect.objectContaining({ status: 'completed' }) }) }));
  noLegacyWrites();
});
test('lost acknowledgement replays the exact persisted request and occurrence IDs', async () => {
  mockSave.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error).not.toBeNull();
  mockSave.mockImplementationOnce(async request => response(request, true));
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error).toBeNull();
  expect(mockSave.mock.calls[0][0]).toEqual(mockSave.mock.calls[1][0]); noLegacyWrites();
});
test('simultaneous callers share a durable request instead of appending children', async () => {
  await Promise.all([createDocumentedUnit('owner-a', payload, exercises, 'unit-a'), createDocumentedUnit('owner-a', payload, exercises, 'unit-a')]);
  expect(mockSave.mock.calls[0][0]).toEqual(mockSave.mock.calls[1][0]); noLegacyWrites();
});
test('edit submits server CAS token and preserves stable occurrence id', async () => {
  expect((await saveDocumentedUnitAtomic('owner-a', 'unit-a', { notes: 'edited' }, exercises, 'edit', { expectedFingerprint: trainingUnitFingerprint({ ...unit, exercises } as any) })).error).toBeNull();
  expect(mockSave.mock.calls[0][0]).toMatchObject({ expectedToken: 'snapshot-1', exercises: [expect.objectContaining({ id: 'occurrence-a' })], unit: { notes: 'edited', status: 'completed' } });
  expect(mockSave.mock.calls[0][0].unit).not.toHaveProperty('photos'); noLegacyWrites();
});
test('changed aggregate is rejected before sending edit', async () => {
  const result = await saveDocumentedUnitAtomic('owner-a', 'unit-a', payload, exercises, 'edit', { expectedFingerprint: 'stale' });
  expect(result.error?.code).toBe('CONFLICT'); expect(mockSave).not.toHaveBeenCalled();
});
test('quota rejection uses existing upgrade error and never falls back', async () => {
  mockSave.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'QUOTA_EXCEEDED' } });
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error?.code).toBe('quota_exceeded'); noLegacyWrites();
});
test('local storage failure prevents transport', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error?.code).toBe('LOCAL_SAVE_ERROR');
  expect(mockRpc).not.toHaveBeenCalled();
});
test('account change during transport cannot report success', async () => {
  let current = true;
  mockSave.mockImplementationOnce(async request => { current = false; return response(request); });
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a', () => current)).error?.code).toBe('CONTEXT_CHANGED');
});
test('missing RPC retains durable retry and never uses legacy HTTP writes', async () => {
  mockSave.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function unavailable' } });
  await createDocumentedUnit('owner-a', payload, exercises, 'unit-a');
  expect(await AsyncStorage.getItem('training_atomic_save_v1:owner-a:unit-a')).not.toBeNull(); noLegacyWrites();
});
test('modified input cannot overwrite an unresolved request', async () => {
  mockSave.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  await createDocumentedUnit('owner-a', payload, exercises, 'unit-a');
  expect((await createDocumentedUnit('owner-a', { ...payload, notes: 'different' }, exercises, 'unit-a')).error?.code).toBe('UNRESOLVED_SAVE');
  expect(mockSave).toHaveBeenCalledTimes(1);
});
test('late duplicate with a newer current token is a conflict, not a false success', async () => {
  mockSave.mockImplementationOnce(async request => ({ ...response(request), data: { ...response(request).data, duplicate: true, currentToken: 'changed' } }));
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error?.code).toBe('CONFLICT');
});
test('nested identity and focus changes contain the expected account assertion', async () => {
  await saveAtomicTrainingDocument('owner-a', { requestId: 'request', unitId: 'unit-a', expectedToken: null, unit: payload, exercises,
    identityChanges: [{ request: { id: 'identity', requestId: 'identity-request', expectedRevision: null, disciplineKey: 'system:obedience', displayName: 'Sit' } }],
    focusChanges: [{ action: 'create', request: { id: 'focus', requestId: 'focus-request', sourceUnitId: 'unit-a', disciplineKey: 'system:obedience', text: 'Stay calm' } }] });
  const sent = mockSave.mock.calls[0][0];
  expect(sent.identityChanges[0].request.expectedOwnerId).toBe('owner-a'); expect(sent.focusChanges[0].request.expectedOwnerId).toBe('owner-a');
});
test('live completion uses the same atomic path and preserves omitted stored media', async () => {
  mockGet.mockResolvedValueOnce({ data: { version: 1, unitId: 'unit-a', token: 'snapshot-1', document: { unit: { ...unit, status: 'active', rating: null, notes: null }, exercises: [] } }, error: null });
  expect((await finishTrainingUnit('unit-a', { duration_sec: 65, rating: 4, notes: 'done' }, exercises, 'owner-a')).error).toBeNull();
  expect(mockSave.mock.calls[0][0]).toMatchObject({ expectedToken: 'snapshot-1', unit: { status: 'completed', duration_sec: 65, ended_at: expect.any(String) } });
  expect(mockSave.mock.calls[0][0].unit).not.toHaveProperty('photos'); noLegacyWrites();
});
test('foreign read response blocks edit even if transport claims success', async () => {
  mockGet.mockResolvedValueOnce({ data: { version: 1, unitId: 'unit-a', token: 'x', document: { unit: { ...unit, owner_id: 'foreign' }, exercises } }, error: null });
  expect((await saveDocumentedUnitAtomic('owner-a', 'unit-a', payload, exercises, 'edit', { expectedFingerprint: 'original' })).error?.code).toBe('INVALID_RESPONSE'); expect(mockSave).not.toHaveBeenCalled();
});
test('malformed success cannot clear the pending request', async () => {
  mockSave.mockResolvedValueOnce({ data: { version: 1, unitId: 'unit-a' }, error: null });
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error?.code).toBe('INVALID_RESPONSE');
  expect(await AsyncStorage.getItem('training_atomic_save_v1:owner-a:unit-a')).not.toBeNull();
});
test('focus list without filters is owner asserted for deleted-source discoverability', async () => {
  expect((await listServerTrainingFocuses('owner-a')).error).toBeNull();
  expect(mockRpc).toHaveBeenCalledWith('training_focus_v1', { p_action: 'list', p_request: { expectedOwnerId: 'owner-a' } });
});

test('live completion cannot overwrite a training already completed elsewhere', async () => {
  expect((await finishTrainingUnit('unit-a', { duration_sec: 65, rating: 4, notes: 'old local' }, exercises, 'owner-a')).error?.code).toBe('CONFLICT');
  expect(mockSave).not.toHaveBeenCalled();
});
test('legacy live draft cannot replace remote child results', async () => {
  mockGet.mockResolvedValueOnce({ data: { version: 1, unitId: 'unit-a', token: 'snapshot-1', document: { unit: { ...unit, status: 'active', rating: null, notes: null }, exercises } }, error: null });
  expect((await finishTrainingUnit('unit-a', { duration_sec: 65, rating: 4, notes: 'old local' }, exercises, 'owner-a')).error?.code).toBe('CONFLICT');
  expect(mockSave).not.toHaveBeenCalled();
});
test('captured live baseline rejects a remote parent modification', async () => {
  mockGet.mockResolvedValueOnce({ data: { version: 1, unitId: 'unit-a', token: 'snapshot-1', document: { unit: { ...unit, status: 'active' }, exercises: [] } }, error: null });
  expect((await finishTrainingUnit('unit-a', { duration_sec: 65, rating: 4, notes: 'old local' }, exercises, 'owner-a', () => true, 'original baseline')).error?.code).toBe('CONFLICT');
  expect(mockSave).not.toHaveBeenCalled();
});

test('edit without original baseline is rejected rather than adopting a fresh token', async () => {
  expect((await saveDocumentedUnitAtomic('owner-a', 'unit-a', payload, exercises, 'edit')).error?.code).toBe('CONFLICT');
  expect(mockGet).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled();
});

test('a lost local completion marker retains the original request for safe retry', async () => {
  const write = AsyncStorage.setItem as jest.Mock; const original = write.getMockImplementation()!; let count = 0;
  write.mockImplementation((key: string, value: string) => ++count === 2 ? Promise.reject(new Error('disk full after response')) : original(key, value));
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error?.code).toBe('LOCAL_SAVE_ERROR');
  write.mockImplementation(original);
  mockSave.mockImplementationOnce(async request => response(request, true));
  expect((await createDocumentedUnit('owner-a', payload, exercises, 'unit-a')).error).toBeNull();
  expect(mockSave.mock.calls[0][0]).toEqual(mockSave.mock.calls[1][0]);
});
