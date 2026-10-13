import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coldIntent } from './intentFixtures';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { cacheReview, cachedReview, enqueueReview, enqueueReviewIntent, replaceReviewIntent, pendingReview, reviewOperations, setReviewOperationState } from '../repository';
import { baseline, corrected, key, request } from './fixtures';
let mockDb: DatabaseSync;
const mockSql = () => ({
  runAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).run(...params),
  getFirstAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).all(...params),
});
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  withExclusiveTransactionAsync: async (action: (tx: ReturnType<typeof mockSql>) => Promise<void>) => {
    mockDb.exec('BEGIN IMMEDIATE');
    try { await action(mockSql()); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
  runAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).run(...params),
  getFirstAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql: string, ...params: any[]) => mockDb.prepare(sql).all(...params),
}) }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const migration of MIGRATIONS) mockDb.exec(migration.sql); });
afterEach(() => { mockDb.close(); });
it('migrates additively and preserves originals across old queue cleanup', async () => {
  mockDb.exec("insert into local_training_sessions (local_id,payload_json) values ('session-a','{\"original\":true}'); insert into sync_queue(id,entity_type,entity_local_id,operation,status) values ('old','training_session','session-a','create','completed')");
  await cacheReview(key, baseline()); await enqueueReview(request());
  mockDb.exec("delete from sync_queue where status='completed'");
  expect((await pendingReview(key))?.request).toEqual(request());
  expect(mockDb.prepare('select payload_json from local_training_sessions').get()?.payload_json).toBe('{"original":true}');
});
it('scopes cache and pending data to owner, run, session and dog', async () => {
  await cacheReview(key, baseline()); await enqueueReview(request());
  for (const field of ['ownerId', 'runId', 'sessionId', 'dogId'] as const) {
    expect(await cachedReview({ ...key, [field]: 'other' })).toBeNull();
    expect(await pendingReview({ ...key, [field]: 'other' })).toBeNull();
  }
  expect(await reviewOperations('another-account')).toEqual([]);
});
it('never regresses a confirmed revision or changes the cache binding', async () => {
  await cacheReview(key, corrected()); await cacheReview(key, baseline());
  expect((await cachedReview(key))?.revision).toBe(1);
  const wrong = { ...key, dogId: 'other' };
  await cacheReview(wrong, { ...corrected(), dogId: 'other', revision: 5 });
  expect(await cachedReview(wrong)).toBeNull();
  expect((await cachedReview(key))?.revision).toBe(1);
});
it('atomically permits only one unconfirmed operation per owner/run', async () => {
  await cacheReview(key, baseline());
  const results = await Promise.allSettled([enqueueReview(request()), enqueueReview(request({ operationId: 'second' }))]);
  expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(await reviewOperations(key.ownerId)).toHaveLength(1);
});
it('keeps conflicts and retries intact and retains withdrawn requests without deleting anything', async () => {
  await cacheReview(key, baseline()); await enqueueReview(request());
  await setReviewOperationState(request(), 'failed', 'offline');
  expect((await pendingReview(key))?.request.operationId).toBe('op-a');
  await setReviewOperationState(request(), 'conflict', 'stale');
  await expect(enqueueReview(request({ operationId: 'second' }))).rejects.toThrow();
  await setReviewOperationState(request(), 'cancelled');
  expect(await pendingReview(key)).toBeNull();
  const row = mockDb.prepare('select state,request_json from track_object_review_outbox').get();
  expect(row?.state).toBe('cancelled'); expect(JSON.parse(String(row?.request_json))).toEqual(request());
  await enqueueReview(request({ operationId: 'second' }));
  expect((await pendingReview(key))?.request.operationId).toBe('second');
});
it('rejects an edit based on an older revision even after a refresh', async () => {
  await cacheReview(key, corrected());
  await expect(enqueueReview(request())).rejects.toThrow('REVIEW_STALE_BASELINE');
  expect(await reviewOperations(key.ownerId)).toEqual([]);
});
it('a stale or foreign ACK cannot clear another operation', async () => {
  await cacheReview(key, baseline()); await enqueueReview(request());
  await setReviewOperationState(request({ ownerId: 'other' }), 'sent');
  await setReviewOperationState(request({ operationId: 'other' }), 'sent');
  expect((await pendingReview(key))?.state).toBe('pending');
});


it('C1 persists cold-cache intent across database close/reopen without touching any original row', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'anyvo-review-c1-'));
  mockDb.close(); mockDb = new DatabaseSync(join(folder, 'offline.sqlite'));
  for (const migration of MIGRATIONS) mockDb.exec(migration.sql);
  try {
    mockDb.exec(`insert into local_training_sessions(local_id,user_id,payload_json) values('session-a','owner-a','{"run":{"original":true}}')`);
    await enqueueReviewIntent(coldIntent());
    expect(await cachedReview(key)).toBeNull();
    mockDb.close(); mockDb = new DatabaseSync(join(folder, 'offline.sqlite'));
    expect((await pendingReview(key))?.request).toEqual(coldIntent());
    expect(mockDb.prepare('select payload_json from local_training_sessions').get()?.payload_json).toBe('{"run":{"original":true}}');
    expect(await reviewOperations('other-owner')).toEqual([]);
    expect(await pendingReview({ ...key, dogId: 'other-dog' })).toBeNull();
  } finally { mockDb.close(); mockDb = new DatabaseSync(':memory:'); rmSync(folder, { recursive: true }); }
});
it('allows more offline dismissals and archives the prior intent without deleting it', async () => {
  const first = coldIntent(); await enqueueReviewIntent(first);
  const next = { ...first, operationId: 'intent-b', changes: [...first.changes, { objectId: 'local-auto-b', status: 'not_found' as const }] };
  await replaceReviewIntent(first, next);
  expect((await pendingReview(key))?.request).toEqual(next);
  const history = mockDb.prepare('select state,request_json,last_error from track_object_review_outbox where operation_id=?').get(first.operationId);
  expect(history?.state).toBe('cancelled'); expect(JSON.parse(String(history?.request_json))).toEqual(first);
  expect(history?.last_error).toBe('REVIEW_INTENT_REPLACED_BY:intent-b');
  await expect(replaceReviewIntent(first, { ...next, operationId: 'race' })).rejects.toThrow('REVIEW_INTENT_CHANGED');
  expect((await pendingReview(key))?.request).toEqual(next);
});
it('cold and warm writes share one durable per-run constraint', async () => {
  await cacheReview(key, baseline()); await enqueueReviewIntent(coldIntent());
  await expect(enqueueReview(request())).rejects.toThrow();
  await expect(enqueueReviewIntent({ ...coldIntent(), operationId: 'duplicate' })).rejects.toThrow();
  expect(await reviewOperations(key.ownerId)).toHaveLength(1);
});
it('requires explicit mapping/current revision and a fresh operation UUID; rollback retains the intent on failure', async () => {
  const intent = coldIntent(); await enqueueReviewIntent(intent); await cacheReview(key, baseline());
  await expect(replaceReviewIntent(intent, request({ operationId: intent.operationId }))).rejects.toThrow('REVIEW_INVALID_INTENT');
  await expect(replaceReviewIntent(intent, request({ changes: intent.changes }))).rejects.toThrow('REVIEW_INVALID_CHANGES');
  await cacheReview(key, corrected());
  await expect(replaceReviewIntent(intent, request())).rejects.toThrow('REVIEW_STALE_BASELINE');
  expect((await pendingReview(key))?.request).toEqual(intent);
  await replaceReviewIntent(intent, request({ expectedRevision: 1, changes: [{ objectId: 'object-b', status: 'not_found' }] }));
  expect((await pendingReview(key))?.request.operationId).toBe('op-a');
  expect(mockDb.prepare('select state from track_object_review_outbox where operation_id=?').get(intent.operationId)?.state).toBe('cancelled');
});
it('a duplicate replacement UUID rolls back archive and cannot lose the offline intent', async () => {
  const intent = coldIntent(); await enqueueReviewIntent(intent); await cacheReview(key, baseline());
  mockDb.prepare(`insert into track_object_review_outbox(operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
    values ('taken','another-owner','another-run','s','d','{}','sent','now')`).run();
  await expect(replaceReviewIntent(intent, request({ operationId: 'taken' }))).rejects.toThrow();
  expect((await pendingReview(key))?.request).toEqual(intent);
  expect((await pendingReview(key))?.state).toBe('pending');
});
