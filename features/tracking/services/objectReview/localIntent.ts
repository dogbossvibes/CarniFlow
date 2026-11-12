import { isTrainingJoker } from '@/features/tracking/utils/objectMarkers';
import type { ObjectChange, ReviewKey, ReviewRequest } from './model';

/** Local recording identity only. Never assumed to be a server marker UUID. */
export interface LocalAutoObject { objectId: string; index: number; material: string | null }
export interface ReviewIntent extends ReviewKey {
  operationId: string;
  expectedRevision: null;
  changes: ObjectChange[];
  localAutoObjects: LocalAutoObject[];
}
export type ReviewOutboxRequest = ReviewRequest | ReviewIntent;
export const isReviewIntent = (request: ReviewOutboxRequest): request is ReviewIntent => request.expectedRevision === null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** The exact displayed completed run supplies original detection IDs; no index/remote-ID fallback. */
export function localAutoObjectsFromRun(value: unknown, key: ReviewKey): LocalAutoObject[] {
  const run = object(value);
  if (run.run_id !== key.runId || run.session_id !== key.sessionId || typeof run.ended_at !== 'string'
    || !Number.isFinite(Date.parse(run.ended_at)) || !Array.isArray(run.object_detections) || run.object_detections.length > 256) return [];
  const ids = new Set<string>();
  const result: LocalAutoObject[] = [];
  const snapshot = object(run.object_snapshot);
  for (const raw of run.object_detections) {
    const detection = object(raw);
    if (detection.source !== 'auto_dwell' || detection.user_override === true) continue;
    if (typeof detection.id !== 'string' || !detection.id.trim() || ids.has(detection.id)) return [];
    ids.add(detection.id);
    const reference = snapshot.version === 1 && Array.isArray(snapshot.objects)
      ? snapshot.objects.map(object).find(o => o.id === detection.id) : undefined;
    if (typeof reference?.material === 'string' && isTrainingJoker(reference.material)) continue;
    result.push({ objectId: detection.id, index: result.length, material: typeof reference?.material === 'string' ? reference.material : null });
  }
  return result;
}
export function validateIntent(request: ReviewIntent): void {
  if (request.expectedRevision !== null || !request.localAutoObjects.length || request.localAutoObjects.length > 256
    || !request.changes.length || request.changes.length > request.localAutoObjects.length) throw new Error('REVIEW_INVALID_INTENT');
  const ids = new Set<string>();
  for (const [i, item] of request.localAutoObjects.entries()) {
    if (isTrainingJoker(item.material) || typeof item.objectId !== 'string' || !item.objectId.trim() || item.index !== i || ids.has(item.objectId)
      || (item.material !== null && typeof item.material !== 'string')) throw new Error('REVIEW_INVALID_INTENT');
    ids.add(item.objectId);
  }
  const changes = new Set<string>();
  for (const change of request.changes) {
    if (!ids.has(change.objectId) || changes.has(change.objectId) || change.status !== 'not_found') throw new Error('REVIEW_INVALID_INTENT');
    changes.add(change.objectId);
  }
}
