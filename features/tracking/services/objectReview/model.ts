import { isTrainingJoker } from '@/features/tracking/utils/objectMarkers';
import type { ReviewOutboxRequest } from './localIntent';
import type { ReviewedObjectStatus } from '../../utils/trackObjectReview';

export interface ReviewKey { ownerId: string; sessionId: string; runId: string; dogId: string }
export type CorrectionStatus = Exclude<ReviewedObjectStatus, 'unknown'>;
export interface ObjectChange { objectId: string; status: CorrectionStatus }
export interface ReviewRequest extends ReviewKey {
  operationId: string; expectedRevision: number; changes: ObjectChange[];
}
export interface ReviewObject {
  objectId: string; index: number; material: string | null; recordedStatus: string; effectiveStatus: ReviewedObjectStatus;
}
export interface ReviewAuditEvent {
  operationId: string; revision: number; createdAt: string;
  changes: ObjectChange[];
  beforeOutcomes: Record<string, ReviewedObjectStatus>;
  afterOutcomes: Record<string, ReviewedObjectStatus>;
}
export interface ObjectReview {
  version: 1; sessionId: string; runId: string; dogId: string; revision: number;
  objects: ReviewObject[]; audit: ReviewAuditEvent[]; excludedJokerObjectIds?: string[];
  totalScore: number | null; hasGaps: boolean | null; auditTruncated: boolean;
  source: 'recording_snapshot' | 'legacy_markers';
}
export interface ReviewOperation { request: ReviewOutboxRequest; state: 'pending' | 'failed' | 'conflict' | 'sent' | 'cancelled'; lastError: string | null }
export const sameReviewKey = (a: ReviewKey, b: ReviewKey) => a.ownerId === b.ownerId && a.sessionId === b.sessionId && a.runId === b.runId && a.dogId === b.dogId;
const statuses = ['found', 'not_found', 'unobserved', 'unknown'];
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const nonempty = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
export function parseObjectReview(value: unknown, key: ReviewKey): ObjectReview {
  const v = obj(value);
  if (![1, 2].includes(v.version as number) || v.sessionId !== key.sessionId || v.runId !== key.runId || v.dogId !== key.dogId
    || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0 || !Array.isArray(v.objects) || v.objects.length > 256 || !Array.isArray(v.audit) || v.audit.length > 50) throw new Error('REVIEW_INVALID_RESPONSE');
  const ids = new Set<string>();
  const objects = v.objects.map((raw, i): ReviewObject => {
    const o = obj(raw);
    if (!nonempty(o.objectId) || ids.has(o.objectId) || o.index !== i || !nonempty(o.recordedStatus) || !statuses.includes(String(o.effectiveStatus))) throw new Error('REVIEW_INVALID_RESPONSE');
    ids.add(o.objectId);
    return { objectId: o.objectId, index: i, material: typeof o.material === 'string' ? o.material : null, recordedStatus: o.recordedStatus, effectiveStatus: o.effectiveStatus as ReviewedObjectStatus };
  });
  const excluded = v.excludedJokerObjectIds ?? [];
  if (!Array.isArray(excluded) || excluded.length > 256 || excluded.some(id => !nonempty(id) || ids.has(id)) || new Set(excluded).size !== excluded.length) throw new Error('REVIEW_INVALID_RESPONSE');
  for (const id of excluded) ids.add(id);
  const excludedJokerObjectIds = [...excluded as string[], ...objects.filter(o => isTrainingJoker(o.material)).map(o => o.objectId)];
  const audit = v.audit.map((raw): ReviewAuditEvent => {
    const e = obj(raw);
    if (!nonempty(e.operationId) || !Number.isSafeInteger(e.revision) || (e.revision as number) <= 0 || (e.revision as number) > (v.revision as number)
      || !nonempty(e.createdAt) || !Number.isFinite(Date.parse(e.createdAt)) || !Array.isArray(e.changes)) throw new Error('REVIEW_INVALID_RESPONSE');
    const before = obj(e.beforeOutcomes), after = obj(e.afterOutcomes);
    const changes = e.changes.map((rawChange) => {
      const c = obj(rawChange);
      if (!nonempty(c.objectId) || !ids.has(c.objectId) || !statuses.slice(0, 3).includes(String(c.status))
        || !statuses.includes(String(before[c.objectId])) || after[c.objectId] !== c.status) throw new Error('REVIEW_INVALID_RESPONSE');
      return { objectId: c.objectId, status: c.status as CorrectionStatus };
    });
    return { operationId: e.operationId, revision: e.revision as number, createdAt: e.createdAt, changes,
      beforeOutcomes: before as Record<string, ReviewedObjectStatus>, afterOutcomes: after as Record<string, ReviewedObjectStatus> };
  });
  if (!['recording_snapshot', 'legacy_markers'].includes(String(v.source)) || typeof v.auditTruncated !== 'boolean'
    || (v.hasGaps !== null && typeof v.hasGaps !== 'boolean')) throw new Error('REVIEW_INVALID_RESPONSE');
  const totalScore = v.source === 'recording_snapshot' && v.hasGaps === false && excludedJokerObjectIds.length === 0 && objects.every(o => o.effectiveStatus === 'found' || o.effectiveStatus === 'not_found')
    && typeof v.totalScore === 'number' && Number.isFinite(v.totalScore) && v.totalScore >= 0 && v.totalScore <= 100 ? v.totalScore : null;
  return { version: 1, sessionId: key.sessionId, runId: key.runId, dogId: key.dogId, revision: v.revision as number, objects: objects.filter(o => !isTrainingJoker(o.material)).map((o, index) => ({ ...o, index })), audit, ...(excludedJokerObjectIds.length ? { excludedJokerObjectIds } : {}), totalScore, hasGaps: v.hasGaps as boolean | null, auditTruncated: v.auditTruncated, source: v.source as ObjectReview['source'] };
}
export function validateChanges(review: ObjectReview, changes: ObjectChange[]): void {
  const ids = new Set<string>();
  if (!changes.length || changes.length > review.objects.length) throw new Error('REVIEW_INVALID_CHANGES');
  for (const c of changes) {
    const original = review.objects.find(o => o.objectId === c.objectId);
    if (!original || isTrainingJoker(original.material) || ids.has(c.objectId) || !statuses.slice(0, 3).includes(c.status) || original.effectiveStatus === c.status) throw new Error('REVIEW_INVALID_CHANGES');
    ids.add(c.objectId);
  }
}
export function reviewCounts(review: ObjectReview) {
  const objects = review.objects.filter(o => !isTrainingJoker(o.material));
  const found = objects.filter(o => o.effectiveStatus === 'found').length;
  const uncertain = objects.filter(o => o.effectiveStatus === 'unknown' || o.effectiveStatus === 'unobserved').length;
  return { found, total: objects.length, uncertain, completeFound: uncertain ? null : found };
}

/** Display ordinals never guess that an untyped old marker is an article. */
export function reviewObjectLabel(review: ObjectReview, objectId: string): string {
  const i = review.objects.findIndex(o => o.objectId === objectId);
  if (i < 0) return review.excludedJokerObjectIds?.includes(objectId) ? 'Joker' : '?';
  const object = review.objects[i];
  if (isTrainingJoker(object.material)) return object.material === 'ball' ? 'Ball · Joker' : 'Dübel · Joker';
  if (review.source === 'legacy_markers' || !object.material || review.objects.slice(0, i).some(o => !o.material)) return `#${i + 1}`;
  return `G${review.objects.slice(0, i + 1).filter(o => !isTrainingJoker(o.material)).length}`;
}
