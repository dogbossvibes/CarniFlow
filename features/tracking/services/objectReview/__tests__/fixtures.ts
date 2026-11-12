import type { ObjectReview, ReviewKey, ReviewRequest } from '../model';
export const key: ReviewKey = { ownerId: 'owner-a', sessionId: 'session-a', runId: 'run-a', dogId: 'dog-a' };
export const baseline = (overrides: Partial<ObjectReview> = {}): ObjectReview => ({
  version: 1, sessionId: key.sessionId, runId: key.runId, dogId: key.dogId, revision: 0, source: 'recording_snapshot',
  objects: [{ objectId: 'object-a', index: 0, material: 'holz', recordedStatus: 'manual_found', effectiveStatus: 'found' },
    { objectId: 'object-b', index: 1, material: 'filz', recordedStatus: 'missed', effectiveStatus: 'not_found' }],
  audit: [], auditTruncated: false, totalScore: 85, hasGaps: false, ...overrides,
});
export const request = (overrides: Partial<ReviewRequest> = {}): ReviewRequest => ({ ...key, operationId: 'op-a', expectedRevision: 0, changes: [{ objectId: 'object-b', status: 'found' }], ...overrides });
export const corrected = (): ObjectReview => baseline({ revision: 1, totalScore: 100,
  objects: baseline().objects.map(o => ({ ...o, effectiveStatus: 'found' })),
  audit: [{ operationId: 'op-a', revision: 1, createdAt: '2026-10-09T10:00:00Z', changes: request().changes,
    beforeOutcomes: { 'object-a': 'found', 'object-b': 'not_found' }, afterOutcomes: { 'object-a': 'found', 'object-b': 'found' } }],
});
