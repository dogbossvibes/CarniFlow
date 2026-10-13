import { isReviewIntent, validateIntent, type ReviewIntent, type ReviewOutboxRequest } from './localIntent';
import { getLocalDb } from '@/lib/localDb/client';
import { parseObjectReview, sameReviewKey, validateChanges, type ObjectReview, type ReviewKey, type ReviewOperation, type ReviewRequest } from './model';

export async function cachedReview(key: ReviewKey): Promise<ObjectReview | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ response_json: string }>(
    'select response_json from track_object_review_cache where owner_id=? and run_id=? and session_id=? and dog_id=?', key.ownerId, key.runId, key.sessionId, key.dogId);
  return row ? parseObjectReview(JSON.parse(row.response_json), key) : null;
}
export async function cacheReview(key: ReviewKey, value: ObjectReview): Promise<void> {
  const review = parseObjectReview(value, key);
  const db = await getLocalDb();
  await db.runAsync(`insert into track_object_review_cache (owner_id,run_id,session_id,dog_id,revision,response_json,updated_at)
    values (?,?,?,?,?,?,?) on conflict(owner_id,run_id) do update set revision=excluded.revision,
    response_json=excluded.response_json,updated_at=excluded.updated_at
    where excluded.revision>=track_object_review_cache.revision and excluded.session_id=track_object_review_cache.session_id
      and excluded.dog_id=track_object_review_cache.dog_id`,
  key.ownerId, key.runId, key.sessionId, key.dogId, review.revision, JSON.stringify(review), new Date().toISOString());
}
export async function enqueueReview(request: ReviewRequest): Promise<void> {
  const current = await cachedReview(request);
  if (!current || current.revision !== request.expectedRevision) throw new Error('REVIEW_STALE_BASELINE');
  validateChanges(current, request.changes);
  const db = await getLocalDb();
  // Revision is checked again in SQL. The partial unique index arbitrates concurrent callers.
  const result = await db.runAsync(`insert into track_object_review_outbox
    (operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
    select ?,?,?,?,?,?,'pending',? where exists (select 1 from track_object_review_cache
      where owner_id=? and run_id=? and session_id=? and dog_id=? and revision=?)`,
  request.operationId, request.ownerId, request.runId, request.sessionId, request.dogId, JSON.stringify(request), new Date().toISOString(),
  request.ownerId, request.runId, request.sessionId, request.dogId, request.expectedRevision);
  if (result.changes !== 1) throw new Error('REVIEW_STALE_BASELINE');
}
export async function reviewOperations(ownerId: string): Promise<ReviewOperation[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ request_json: string; state: ReviewOperation['state']; last_error: string | null }>(
    "select request_json,state,last_error from track_object_review_outbox where owner_id=? and state in ('pending','failed','conflict') order by created_at,operation_id", ownerId);
  return rows.map(row => {
    const request = JSON.parse(row.request_json) as ReviewOutboxRequest;
    if (isReviewIntent(request)) validateIntent(request);
    if (request.ownerId !== ownerId) throw new Error('REVIEW_INVALID_OWNER');
    return { request, state: row.state, lastError: row.last_error };
  });
}
export async function pendingReview(key: ReviewKey): Promise<ReviewOperation | null> {
  return (await reviewOperations(key.ownerId)).find(op => sameReviewKey(key, op.request)) ?? null;
}
export async function setReviewOperationState(request: ReviewOutboxRequest, state: ReviewOperation['state'], error: string | null = null): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update track_object_review_outbox set state=?,last_error=? where operation_id=? and owner_id=?
    and run_id=? and session_id=? and dog_id=? and state in ('pending','failed','conflict')`,
  state, error, request.operationId, request.ownerId, request.runId, request.sessionId, request.dogId);
}


/** No remote/cache prerequisite. Uses the same one-open-operation constraint as warm-cache edits. */
export async function enqueueReviewIntent(request: ReviewIntent): Promise<void> {
  validateIntent(request);
  const db = await getLocalDb();
  await db.runAsync(`insert into track_object_review_outbox
    (operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
    values (?,?,?,?,?,?,'pending',?)`,
  request.operationId, request.ownerId, request.runId, request.sessionId, request.dogId, JSON.stringify(request), new Date().toISOString());
}

/** Archive immutable local intent and enqueue its explicit replacement atomically. Never reuse its RPC UUID. */
export async function replaceReviewIntent(previous: ReviewIntent, next: ReviewOutboxRequest): Promise<void> {
  validateIntent(previous);
  if (!sameReviewKey(previous, next) || previous.operationId === next.operationId) throw new Error('REVIEW_INVALID_INTENT');
  if (isReviewIntent(next)) validateIntent(next);
  const db = await getLocalDb();
  await db.withExclusiveTransactionAsync(async tx => {
    if (!isReviewIntent(next)) {
      const row = await tx.getFirstAsync<{ response_json: string }>(`select response_json from track_object_review_cache
        where owner_id=? and run_id=? and session_id=? and dog_id=? and revision=?`,
      next.ownerId, next.runId, next.sessionId, next.dogId, next.expectedRevision);
      if (!row) throw new Error('REVIEW_STALE_BASELINE');
      validateChanges(parseObjectReview(JSON.parse(row.response_json), next), next.changes);
    }
    const archived = await tx.runAsync(`update track_object_review_outbox set state='cancelled',last_error=?
      where operation_id=? and owner_id=? and run_id=? and session_id=? and dog_id=? and request_json=?
        and state in ('pending','failed','conflict')`,
    `REVIEW_INTENT_REPLACED_BY:${next.operationId}`, previous.operationId, previous.ownerId, previous.runId,
    previous.sessionId, previous.dogId, JSON.stringify(previous));
    if (archived.changes !== 1) throw new Error('REVIEW_INTENT_CHANGED');
    await tx.runAsync(`insert into track_object_review_outbox
      (operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
      values (?,?,?,?,?,?,'pending',?)`,
    next.operationId, next.ownerId, next.runId, next.sessionId, next.dogId, JSON.stringify(next), new Date().toISOString());
  });
}
