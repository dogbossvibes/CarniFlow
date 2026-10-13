import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { queueAutoDetectionIntent, resolveAutoDetectionIntent, syncObjectReviews } from '../service';
import { cachedReview, pendingReview, reviewOperations } from '../repository';
import { isReviewIntent } from '../localIntent';
import { baseline, key } from './fixtures';
import { coldIntent } from './intentFixtures';
let mockDb: DatabaseSync;
let mockOnline = false;
let mockUuid = 0;
const mockRpc = jest.fn();
const mockSql = () => ({
  runAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).run(...params),
  getFirstAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).all(...params),
});
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ ...mockSql(),
  withExclusiveTransactionAsync: async (action: (tx: ReturnType<typeof mockSql>) => Promise<void>) => {
    mockDb.exec('BEGIN IMMEDIATE');
    try { await action(mockSql()); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `op-${++mockUuid}` }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: async () => mockOnline }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-a' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  rpc: (...args: any[]) => ({ abortSignal: () => mockRpc(...args) }),
} }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) mockDb.exec(m.sql); mockOnline = false; mockUuid = 0; mockRpc.mockReset(); });
afterEach(() => mockDb.close());
it('C1: cold offline intent -> explicit server mapping -> lost ACK retry preserves original data and one RPC identity', async () => {
  mockDb.exec(`insert into local_training_sessions(local_id,user_id,payload_json) values('session-a','owner-a','{"originalRun":true}')`);
  const originals = () => mockDb.prepare('select payload_json from local_training_sessions').get()?.payload_json;
  const original = originals();
  await queueAutoDetectionIntent(key, coldIntent().localAutoObjects, 'local-auto-a');
  await queueAutoDetectionIntent(key, coldIntent().localAutoObjects, 'local-auto-b');
  await syncObjectReviews(); expect(mockRpc).not.toHaveBeenCalled(); expect(await cachedReview(key)).toBeNull();
  const before = (await pendingReview(key))!.request;
  expect(before.expectedRevision).toBeNull(); expect(before.changes).toHaveLength(2);
  const server = baseline({ source: 'legacy_markers', totalScore: null, hasGaps: null,
    objects: baseline().objects.map(o => ({ ...o, recordedStatus: 'unknown', effectiveStatus: 'unknown' })) });
  mockOnline = true; mockRpc.mockResolvedValue({ data: server, error: null });
  await syncObjectReviews();
  expect(mockRpc.mock.calls.map(call => call[0])).toEqual(['initialize_track_object_review_v1']);
  expect((await pendingReview(key))?.state).toBe('conflict');
  expect((await cachedReview(key))?.revision).toBe(0);
  await syncObjectReviews(); expect(mockRpc).toHaveBeenCalledTimes(1); // no automatic resolution
  if (!isReviewIntent(before)) throw new Error('expected local intent');
  await resolveAutoDetectionIntent(before, 0, { 'local-auto-a': 'object-a', 'local-auto-b': 'object-b' });
  const queued = (await pendingReview(key))!.request;
  expect(queued.operationId).not.toBe(before.operationId); expect(queued.expectedRevision).toBe(0);
  mockRpc.mockRejectedValueOnce(new Error('lost ACK'));
  await syncObjectReviews(); expect((await pendingReview(key))?.state).toBe('failed');
  expect((await pendingReview(key))?.request).toEqual(queued);
  mockRpc.mockResolvedValue({ data: { ...server, revision: 1, objects: server.objects.map(o => ({ ...o, effectiveStatus: 'not_found' })),
    operationId: queued.operationId, appliedRevision: 1, replayed: true }, error: null });
  await syncObjectReviews();
  expect(await reviewOperations(key.ownerId)).toEqual([]);
  const calls = mockRpc.mock.calls.filter(call => call[0] === 'apply_track_object_review_v1');
  expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][1].p_changes).toEqual([{ objectId: 'object-a', status: 'not_found' }, { objectId: 'object-b', status: 'not_found' }]);
  expect(originals()).toBe(original);
  expect(mockDb.prepare('select count(*) as n from track_object_review_outbox').get()?.n).toBe(3); // all old intentions retained
});
