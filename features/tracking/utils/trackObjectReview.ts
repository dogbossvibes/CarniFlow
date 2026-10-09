import type { ReferenceObjectStatus } from './referenceObjectStatus';

/** An immutable recording snapshot. Human corrections are stored separately. */
export interface TrackObjectSnapshot {
  version: 1;
  objects: { id: string; index: number; recordedStatus: ReferenceObjectStatus; material?: string }[];
  scoreBasis: TrackObjectScoreBasis | null;
}

/** Exact, unrounded terms of the existing live score; no new scoring model. */
export interface TrackObjectScoreBasis {
  version: 1;
  trackPoints: number;
  maxTrackPoints: number;
  maxObjectPoints: number;
  totalObjects: number;
}

export type ReviewedObjectStatus = 'found' | 'not_found' | 'unobserved' | 'unknown';

export function recordedObjectOutcome(status: ReferenceObjectStatus): ReviewedObjectStatus {
  switch (status) {
    case 'manual_found': case 'auto_dwell_found': return 'found';
    case 'missed': case 'user_removed': return 'not_found';
    case 'unobserved': return 'unobserved';
    case 'pending': return 'unknown';
  }
}

export function validObjectScoreBasis(value: TrackObjectScoreBasis): boolean {
  return value.version === 1
    && [value.trackPoints, value.maxTrackPoints, value.maxObjectPoints, value.totalObjects].every(Number.isFinite)
    && value.maxTrackPoints > 0 && value.maxObjectPoints >= 0
    && value.maxTrackPoints + value.maxObjectPoints === 100
    && value.trackPoints >= 0 && value.trackPoints <= value.maxTrackPoints
    && Number.isInteger(value.totalObjects) && value.totalObjects >= 0;
}

/**
 * Missing IDs/states stay missing. Never infer object identities from an aggregate
 * count, manufacture marker IDs, or silently pad an old recording with misses.
 */
export function buildTrackObjectSnapshot(input: {
  objects: { id?: string; index: number; material?: string }[];
  statuses: ReferenceObjectStatus[];
  foundObjects: number;
  totalObjects: number;
  scoreBasis?: TrackObjectScoreBasis;
}): TrackObjectSnapshot | undefined {
  if (input.objects.length !== input.statuses.length || input.objects.length !== input.totalObjects) return undefined;
  const ids = new Set<string>();
  const objects: TrackObjectSnapshot['objects'] = [];
  for (let i = 0; i < input.objects.length; i++) {
    const object = input.objects[i];
    const status = input.statuses[i];
    if (!object.id?.trim() || ids.has(object.id) || !Number.isInteger(object.index) || object.index !== i
      || !['pending', 'manual_found', 'auto_dwell_found', 'missed', 'user_removed', 'unobserved'].includes(status)) return undefined;
    ids.add(object.id);
    objects.push({ id: object.id, index: i, recordedStatus: status,
      ...(typeof object.material === 'string' ? { material: object.material.slice(0, 64) } : {}) });
  }
  if (objects.filter(object => recordedObjectOutcome(object.recordedStatus) === 'found').length !== input.foundObjects) return undefined;
  const basis = input.scoreBasis;
  return { version: 1, objects,
    scoreBasis: basis && validObjectScoreBasis(basis) && basis.totalObjects === input.totalObjects ? { ...basis } : null };
}

/** For a reviewed result only. Gaps and unknown observations never earn a total score. */
export function reviewedObjectScore(input: {
  basis: TrackObjectScoreBasis | null;
  outcomes: ReviewedObjectStatus[];
  hasGaps: boolean;
}): number | null {
  const basis = input.basis;
  if (input.hasGaps || !basis || !validObjectScoreBasis(basis)
    || basis.totalObjects !== input.outcomes.length
    || input.outcomes.some(status => status !== 'found' && status !== 'not_found')) return null;
  const observed = input.outcomes.length;
  const found = input.outcomes.filter(status => status === 'found').length;
  const score = basis.trackPoints + (observed ? found / observed * basis.maxObjectPoints : basis.maxObjectPoints);
  return Math.round(Math.max(0, Math.min(100, score)));
}
