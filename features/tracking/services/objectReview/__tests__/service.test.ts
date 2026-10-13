import { coldIntent } from './intentFixtures';
import { baseline, corrected, key, request } from './fixtures';
import { initializeObjectReview, queueObjectChanges, readObjectReview, syncObjectReviews, objectReviewQueueCounts, REVIEW_REQUEST_TIMEOUT_MS, queueAutoDetectionIntent, resolveAutoDetectionIntent } from '../service';
let mockSession: any = { user: { id: 'owner-a' } };
let mockListeners = new Set<(event: string, session: any) => void>();
const mockRpc = jest.fn();
const mockOnline = jest.fn();
const mockCache = jest.fn(); const mockCached = jest.fn(); const mockEnqueue = jest.fn(); const mockOperations = jest.fn(); const mockSetState = jest.fn(); const mockPending = jest.fn(); const mockIntent = jest.fn(); const mockReplace = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-operation' }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mockSession }, error: null }),
    onAuthStateChange: (cb: any) => { mockListeners.add(cb); return { data: { subscription: { unsubscribe: () => mockListeners.delete(cb) } } }; } },
  rpc: (...args: any[]) => ({ abortSignal: () => mockRpc(...args) }),
} }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: () => mockOnline() }));
jest.mock('../repository', () => ({
  pendingReview: (...args: any[]) => mockPending(...args), enqueueReviewIntent: (...args: any[]) => mockIntent(...args), replaceReviewIntent: (...args: any[]) => mockReplace(...args),
  cacheReview: (...args: any[]) => mockCache(...args), cachedReview: (...args: any[]) => mockCached(...args),
  enqueueReview: (...args: any[]) => mockEnqueue(...args), reviewOperations: (...args: any[]) => mockOperations(...args),
  setReviewOperationState: (...args: any[]) => mockSetState(...args),
}));
beforeEach(() => {
  jest.resetAllMocks(); mockListeners = new Set(); mockSession = { user: { id: key.ownerId } };
  mockOnline.mockResolvedValue(true); mockCached.mockResolvedValue(null); mockOperations.mockResolvedValue([]);
  mockRpc.mockResolvedValue({ data: baseline(), error: null });
});
it('reading does not initialize or mutate original training data', async () => {
  await readObjectReview(key);
  expect(mockRpc).toHaveBeenCalledWith('get_track_object_review_v1', { p_session_id: key.sessionId, p_run_id: key.runId, p_dog_id: key.dogId });
  expect(mockListeners.size).toBe(0);
});
it('initializes only via explicit action and reports an unavailable backend', async () => {
  await initializeObjectReview(key); expect(mockRpc.mock.calls[0][0]).toBe('initialize_track_object_review_v1');
  mockRpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'not installed' }, data: null });
  await expect(readObjectReview(key)).rejects.toThrow('PGRST202'); expect(mockEnqueue).not.toHaveBeenCalled();
});
it('rejects another account before sending and ignores a response after logout', async () => {
  mockSession = { user: { id: 'other' } }; await expect(readObjectReview(key)).rejects.toThrow('REVIEW_ACCOUNT_CHANGED');
  expect(mockRpc).not.toHaveBeenCalled();
  mockSession = { user: { id: key.ownerId } };
  mockRpc.mockImplementation(async () => { mockListeners.forEach(cb => cb('SIGNED_OUT', null)); return { data: baseline() }; });
  await expect(readObjectReview(key)).rejects.toThrow('REVIEW_ACCOUNT_CHANGED'); expect(mockCache).not.toHaveBeenCalled();
});
it('queues offline changes locally without network mutation or optimistic confirmed results', async () => {
  mockOnline.mockResolvedValue(false);
  await queueObjectChanges(key, 0, request().changes);
  expect(mockEnqueue).toHaveBeenCalledWith({ ...request(), operationId: 'new-operation' });
  expect(mockRpc).not.toHaveBeenCalled(); expect(mockCache).not.toHaveBeenCalled();
});
it('retries the same operation after a lost ACK and never retries conflicts automatically', async () => {
  mockOperations.mockResolvedValue([{ request: request(), state: 'failed' }, { request: request({ operationId: 'conflict' }), state: 'conflict' }]);
  mockRpc.mockResolvedValue({ data: { ...corrected(), operationId: 'op-a', appliedRevision: 1, replayed: true } });
  await syncObjectReviews();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('apply_track_object_review_v1', expect.objectContaining({ p_operation_id: 'op-a', p_expected_revision: 0 }));
  expect(mockSetState).toHaveBeenCalledWith(request(), 'sent');
  expect(mockCache.mock.invocationCallOrder[0]).toBeLessThan(mockSetState.mock.invocationCallOrder[0]);
});
it.each(['REVIEW_REVISION_CONFLICT', 'REVIEW_OPERATION_CONFLICT', '23505'])('retains %s as an explicit conflict', async message => {
  mockOperations.mockResolvedValue([{ request: request(), state: 'pending' }]); mockRpc.mockResolvedValue({ error: { code: 'P0001', message } });
  await syncObjectReviews(); expect(mockSetState).toHaveBeenCalledWith(request(), 'conflict', expect.stringContaining(message)); expect(mockCache).not.toHaveBeenCalled();
});
it('never acknowledges a wrong operation or malformed response', async () => {
  mockOperations.mockResolvedValue([{ request: request(), state: 'pending' }]);
  mockRpc.mockResolvedValue({ data: { ...corrected(), operationId: 'another-op', appliedRevision: 1, replayed: false } });
  await syncObjectReviews(); expect(mockSetState).toHaveBeenCalledWith(request(), 'failed', 'REVIEW_INVALID_ACK'); expect(mockCache).not.toHaveBeenCalled();
});
it('has a single sync worker even before connectivity and auth await', async () => {
  await Promise.all([syncObjectReviews(), syncObjectReviews()]); expect(mockOperations).toHaveBeenCalledTimes(1);
});

it('times out stalled requests, retains the same operation and releases the worker for retry', async () => {
  jest.useFakeTimers();
  try {
    mockOperations.mockResolvedValue([{ request: request(), state: 'pending' }]);
    mockRpc.mockReturnValue(new Promise(() => {}));
    const sync = syncObjectReviews();
    await jest.advanceTimersByTimeAsync(REVIEW_REQUEST_TIMEOUT_MS + 1);
    await sync;
    expect(mockSetState).toHaveBeenCalledWith(request(), 'failed', 'REVIEW_TIMEOUT');
    mockRpc.mockResolvedValue({ data: { ...corrected(), operationId: 'op-a', appliedRevision: 1, replayed: true } });
    await syncObjectReviews(); expect(mockSetState).toHaveBeenLastCalledWith(request(), 'sent');
  } finally { jest.useRealTimers(); }
});

it('counts only the authenticated owner durable outbox for the sync summary', async () => {
  mockOperations.mockResolvedValue([{ state: 'pending' }, { state: 'failed' }, { state: 'conflict' }]);
  expect(await objectReviewQueueCounts()).toEqual({ pending: 1, failed: 1, conflict: 1 });
  expect(mockOperations).toHaveBeenLastCalledWith(key.ownerId);
  mockSession = null;
  expect(await objectReviewQueueCounts()).toEqual({ pending: 0, failed: 0, conflict: 0 });
});


it('C1 queues a cold-cache dismissal while offline without RPC or fabricated revision', async () => {
  mockOnline.mockResolvedValue(false);
  await queueAutoDetectionIntent(key, coldIntent().localAutoObjects, 'local-auto-a');
  expect(mockIntent).toHaveBeenCalledWith({ ...coldIntent(), operationId: 'new-operation' });
  expect(mockRpc).not.toHaveBeenCalled(); expect(mockCache).not.toHaveBeenCalled();
});
it('extends an existing offline intent immutably and never duplicates a double tap', async () => {
  mockPending.mockResolvedValue({ request: coldIntent(), state: 'pending' });
  await queueAutoDetectionIntent(key, [], 'local-auto-a'); expect(mockReplace).not.toHaveBeenCalled();
  await queueAutoDetectionIntent(key, [], 'local-auto-b');
  expect(mockReplace).toHaveBeenCalledWith(coldIntent(), expect.objectContaining({ operationId: 'new-operation', expectedRevision: null,
    localAutoObjects: coldIntent().localAutoObjects, changes: [...coldIntent().changes, { objectId: 'local-auto-b', status: 'not_found' }] }));
});
it('reconnect prepares a baseline but NEVER maps local IDs or sends a cold intent to apply RPC', async () => {
  mockOperations.mockResolvedValue([{ request: coldIntent(), state: 'pending' }]);
  await syncObjectReviews();
  expect(mockRpc.mock.calls.map(call => call[0])).toEqual(['initialize_track_object_review_v1']);
  expect(mockSetState).toHaveBeenCalledWith(coldIntent(), 'conflict', 'REVIEW_INTENT_CONFIRMATION_REQUIRED');
  expect(mockEnqueue).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
});
it('retains cold intents when parent/reference upload or backend is unavailable', async () => {
  mockOperations.mockResolvedValue([{ request: coldIntent(), state: 'pending' }]);
  mockRpc.mockResolvedValue({ error: { code: 'P0001', message: 'REVIEW_REFERENCE_INCOMPLETE' } });
  await syncObjectReviews();
  expect(mockSetState).toHaveBeenCalledWith(coldIntent(), 'failed', expect.stringContaining('REVIEW_REFERENCE_INCOMPLETE'));
  expect(mockReplace).not.toHaveBeenCalled();
});
it('explicit resolution records user mapping and current revision in a fresh immutable operation', async () => {
  await resolveAutoDetectionIntent(coldIntent(), 3, { 'local-auto-a': 'server-object-z' });
  expect(mockReplace).toHaveBeenCalledWith(coldIntent(), { ...key, operationId: 'new-operation', expectedRevision: 3,
    changes: [{ objectId: 'server-object-z', status: 'not_found' }] });
  await expect(resolveAutoDetectionIntent(coldIntent(), 3, {})).rejects.toThrow('REVIEW_INVALID_CHANGES');
});
it('never queues or resolves cold intents for a different account', async () => {
  mockSession = { user: { id: 'other' } };
  await expect(queueAutoDetectionIntent(key, coldIntent().localAutoObjects, 'local-auto-a')).rejects.toThrow('REVIEW_ACCOUNT_CHANGED');
  await expect(resolveAutoDetectionIntent(coldIntent(), 0, { 'local-auto-a': 'object-a' })).rejects.toThrow('REVIEW_ACCOUNT_CHANGED');
  expect(mockIntent).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
});

it('keeps the cold intent unacknowledged when the account changes during baseline preparation', async () => {
  mockOperations.mockResolvedValue([{ request: coldIntent(), state: 'pending' }]);
  mockRpc.mockImplementation(async () => { mockListeners.forEach(cb => cb('SIGNED_OUT', null)); return { data: baseline(), error: null }; });
  await syncObjectReviews();
  expect(mockCache).not.toHaveBeenCalled(); expect(mockSetState).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled();
});
