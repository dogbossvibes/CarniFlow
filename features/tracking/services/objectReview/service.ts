import { isReviewIntent, type LocalAutoObject, type ReviewIntent, type ReviewOutboxRequest } from './localIntent';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { fetchIsOnline } from '@/features/sync/services/netinfo';
import { cacheReview, cachedReview, enqueueReview, reviewOperations, setReviewOperationState, pendingReview, enqueueReviewIntent, replaceReviewIntent } from './repository';
import { parseObjectReview, type ObjectChange, type ObjectReview, type ReviewKey, type ReviewRequest } from './model';

export const REVIEW_REQUEST_TIMEOUT_MS = 20_000;
async function bounded<T>(promise: PromiseLike<T>, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { onTimeout?.(); reject(new Error('REVIEW_TIMEOUT')); }, REVIEW_REQUEST_TIMEOUT_MS);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** A response from an earlier login must never be exposed in a later account. */
async function guarded<T>(ownerId: string, action: (assertCurrent: () => void) => Promise<T>): Promise<T> {
  let invalid = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || session?.user.id !== ownerId) invalid = true;
  });
  const assertCurrent = () => { if (invalid) throw new Error('REVIEW_ACCOUNT_CHANGED'); };
  try {
    const { data: { session }, error } = await bounded(supabase.auth.getSession());
    if (error || session?.user.id !== ownerId) invalid = true;
    assertCurrent();
    const result = await action(assertCurrent);
    assertCurrent();
    return result;
  } finally { subscription.unsubscribe(); }
}
const argsFor = (key: ReviewKey) => ({ p_session_id: key.sessionId, p_run_id: key.runId, p_dog_id: key.dogId });
async function rpcReview(key: ReviewKey, name: string, extra: Record<string, unknown> = {}): Promise<ObjectReview> {
  return guarded(key.ownerId, async assertCurrent => {
    if (!(await fetchIsOnline())) throw new Error('REVIEW_OFFLINE');
    assertCurrent();
    const controller = new AbortController();
    const { data, error } = await bounded(supabase.rpc(name, { ...argsFor(key), ...extra }).abortSignal(controller.signal), () => controller.abort());
    assertCurrent();
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
    if (name === 'apply_track_object_review_v1' && (!data || data.operationId !== extra.p_operation_id
      || data.appliedRevision !== Number(extra.p_expected_revision) + 1 || typeof data.replayed !== 'boolean'
      || data.revision < data.appliedRevision)) throw new Error('REVIEW_INVALID_ACK');
    const response = parseObjectReview(data, key);
    await cacheReview(key, response);
    assertCurrent();
    // An older response never regresses a newer cache.
    return (await cachedReview(key)) ?? response;
  });
}
export const readObjectReview = (key: ReviewKey) => rpcReview(key, 'get_track_object_review_v1');
/** Explicit user action only; freezes a baseline on the server, does not edit original data. */
export const initializeObjectReview = (key: ReviewKey) => rpcReview(key, 'initialize_track_object_review_v1');
export async function queueObjectChanges(key: ReviewKey, revision: number, changes: ObjectChange[]): Promise<void> {
  await guarded(key.ownerId, async assertCurrent => {
    const request: ReviewRequest = { ...key, operationId: Crypto.randomUUID(), expectedRevision: revision, changes };
    assertCurrent();
    await enqueueReview(request);
  });
}
let flight: Promise<void> | null = null;
export function syncObjectReviews(): Promise<void> {
  if (flight) return flight;
  flight = sync().finally(() => { flight = null; });
  return flight;
}
async function sync(): Promise<void> {
  if (!(await fetchIsOnline())) return;
  const { data: { session }, error } = await bounded(supabase.auth.getSession());
  if (error || !session) return;
  const ownerId = session.user.id;
  const operations = await reviewOperations(ownerId);
  for (const op of operations) {
    if (op.state === 'conflict') continue;
    const request = op.request;
    try {
      if (isReviewIntent(request)) {
        // Explicitly queued offline intent permits preparing a baseline, but never guesses a mapping/revision.
        await initializeObjectReview(request);
        await setReviewOperationState(request, 'conflict', 'REVIEW_INTENT_CONFIRMATION_REQUIRED');
        continue;
      }
      await rpcReview(request, 'apply_track_object_review_v1', {
        p_operation_id: request.operationId, p_expected_revision: request.expectedRevision, p_changes: request.changes,
      });
      // Cache first, ACK second. An interrupted ACK safely retries the SAME operation UUID.
      await setReviewOperationState(request, 'sent');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/REVIEW_ACCOUNT_CHANGED/.test(message)) return;
      await setReviewOperationState(request, /REVIEW_REVISION_CONFLICT|REVIEW_OPERATION_CONFLICT|23505/.test(message) ? 'conflict' : 'failed', message);
    }
  }
}
/** Preserve the conflicting request in the outbox history; never auto-rebase it. */
export async function acceptCurrentReview(request: ReviewOutboxRequest): Promise<ObjectReview> {
  const latest = await readObjectReview(request);
  await guarded(request.ownerId, async () => { await setReviewOperationState(request, 'cancelled'); });
  return latest;
}

/** Include the separate durable outbox in the existing sync summary. */
export async function objectReviewQueueCounts(): Promise<{ pending: number; failed: number; conflict: number }> {
  const empty = { pending: 0, failed: 0, conflict: 0 };
  const { data: { session }, error } = await bounded(supabase.auth.getSession());
  if (error) throw error;
  if (!session) return empty;
  return guarded(session.user.id, async () => {
    const operations = await reviewOperations(session.user.id);
    return operations.reduce((counts, operation) => {
      if (operation.state === 'pending' || operation.state === 'failed' || operation.state === 'conflict') counts[operation.state]++;
      return counts;
    }, empty);
  });
}


/** Persist the user's dismissal without changing the recorded run, even before any server review exists. */
export async function queueAutoDetectionIntent(key: ReviewKey, localAutoObjects: LocalAutoObject[], objectId: string): Promise<void> {
  await guarded(key.ownerId, async assertCurrent => {
    const pending = await pendingReview(key);
    assertCurrent();
    if (pending && !isReviewIntent(pending.request)) throw new Error('REVIEW_OPERATION_PENDING');
    const previous = pending?.request as ReviewIntent | undefined;
    if (previous?.changes.some(c => c.objectId === objectId)) return;
    const request: ReviewIntent = { ...key, operationId: Crypto.randomUUID(), expectedRevision: null,
      localAutoObjects: previous?.localAutoObjects ?? localAutoObjects,
      changes: [...(previous?.changes ?? []), { objectId, status: 'not_found' }] };
    if (previous) await replaceReviewIntent(previous, request); else await enqueueReviewIntent(request);
  });
}

/** The user maps every local detection explicitly to the freshly displayed server baseline. */
export async function resolveAutoDetectionIntent(request: ReviewIntent, expectedRevision: number, targets: Record<string, string>): Promise<void> {
  await guarded(request.ownerId, async assertCurrent => {
    if (Object.keys(targets).length !== request.changes.length) throw new Error('REVIEW_INVALID_CHANGES');
    const changes = request.changes.map(change => {
      const objectId = targets[change.objectId];
      if (typeof objectId !== 'string' || !objectId.trim()) throw new Error('REVIEW_INVALID_CHANGES');
      return { objectId, status: change.status };
    });
    assertCurrent();
    await replaceReviewIntent(request, { ownerId: request.ownerId, sessionId: request.sessionId, runId: request.runId, dogId: request.dogId,
      operationId: Crypto.randomUUID(), expectedRevision, changes });
  });
}
