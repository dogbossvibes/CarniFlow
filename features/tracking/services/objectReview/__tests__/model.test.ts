import { parseObjectReview, reviewCounts, reviewObjectLabel, validateChanges } from '../model';
import { baseline, corrected, key, request } from './fixtures';
import backendResponses from './backendResponses.json';
import { buildTrackUserExport } from '../../../utils/trackUserExport';
it('preserves original and effective outcomes across JSON roundtrip', () => {
  const original = corrected();
  const copy = parseObjectReview(JSON.parse(JSON.stringify(original)), key);
  expect(copy).toEqual(original);
  expect(copy.objects[1]).toMatchObject({ recordedStatus: 'missed', effectiveStatus: 'found' });
});
it.each(['sessionId', 'dogId', 'runId'] as const)('rejects an unrelated %s', field => {
  expect(() => parseObjectReview({ ...baseline(), [field]: 'other' }, key)).toThrow('REVIEW_INVALID_RESPONSE');
});
it.each([NaN, Infinity, -1, 1.5])('rejects invalid revision %s', revision => {
  expect(() => parseObjectReview(baseline({ revision }), key)).toThrow();
});
it('does not invent totals or scores for legacy, gaps, unobserved or unknown', () => {
  for (const hasGaps of [true, null]) expect(parseObjectReview(baseline({ hasGaps, totalScore: 100 }), key).totalScore).toBeNull();
  expect(parseObjectReview(baseline({ source: 'legacy_markers', totalScore: 100 }), key).totalScore).toBeNull();
  for (const status of ['unknown', 'unobserved'] as const) {
    const review = parseObjectReview(baseline({ objects: baseline().objects.map(o => ({ ...o, effectiveStatus: status })) }), key);
    expect(review.totalScore).toBeNull();
    expect(reviewCounts(review)).toEqual({ found: 0, total: 2, uncertain: 2, completeFound: null });
  }
});
it('rejects duplicate identities and invalid transitions', () => {
  expect(() => parseObjectReview(baseline({ objects: [baseline().objects[0], { ...baseline().objects[0], index: 1 }] }), key)).toThrow();
  for (const changes of [[], [{ objectId: 'stranger', status: 'found' }], [{ objectId: 'object-a', status: 'found' }], [...request().changes, ...request().changes]]) {
    expect(() => validateChanges(baseline(), changes as any)).toThrow('REVIEW_INVALID_CHANGES');
  }
  expect(() => validateChanges(baseline(), request().changes)).not.toThrow();
});
it('does not number dowels or pretend to know legacy G ordinals', () => {
  const review = baseline({ objects: [{ ...baseline().objects[0], material: 'duebel' }, baseline().objects[1]] });
  expect(reviewObjectLabel(review, 'object-a')).toBe('D1');
  expect(reviewObjectLabel(review, 'object-b')).toBe('G1');
  expect(reviewObjectLabel({ ...review, source: 'legacy_markers' }, 'object-b')).toBe('#2');
});
it('exports confirmed history without database IDs, mutating original data, geometry, or sensor score', () => {
  const data = { id: key.sessionId, dog_id: key.dogId, articles_found: 1, articles_total: 2,
    runs: [{ id: key.runId, articles_found: 1, run_points: [{ lat: 47, lng: 8, t: 0 }] }],
    track_data: { run: { run_id: key.runId, analytics: { trackScore: 42 } } }, objectReview: corrected() };
  const before = JSON.stringify(data);
  const result = buildTrackUserExport(data, '2026-10-09T12:00:00Z');
  expect(result.summary).toMatchObject({ found: 2, total: 2, analysisScore: 42 });
  expect(result.objectReview?.totalScore).toBe(100);
  expect(result.objectReview?.audit[0].changes[0]).toEqual({ label: 'G2', before: 'not_found', after: 'found' });
  for (const id of [key.sessionId, key.runId, key.dogId, key.ownerId, 'object-a', 'op-a']) expect(JSON.stringify(result)).not.toContain(id);
  expect(JSON.stringify(data)).toBe(before);
  expect(buildTrackUserExport({ ...data, objectReview: { ...corrected(), runId: 'other' } }, '2026-10-09T12:00:00Z').summary.found).toBe(1);
});
it('accepts actual synthetic PostgreSQL RPC responses and survives local JSON reload', () => {
  const cases = backendResponses;
  for (const { key: binding, response } of cases) {
    const parsed = parseObjectReview(response, binding);
    expect(parseObjectReview(JSON.parse(JSON.stringify(parsed)), binding)).toEqual(parsed);
  }
  expect(parseObjectReview(cases[0].response, cases[0].key).totalScore).toBe(74);
  expect(parseObjectReview(cases[1].response, cases[1].key).totalScore).toBeNull();
  expect(parseObjectReview(cases[2].response, cases[2].key).source).toBe('legacy_markers');
});
it('binds review to the displayed older run, independently of newer payload analytics', () => {
  const result = buildTrackUserExport({ id: key.sessionId, dog_id: key.dogId,
    runs: [{ id: key.runId, articles_found: 0 }], track_data: { run: { run_id: 'newer', analytics: { trackScore: 99 } } }, objectReview: corrected() }, '2026-10-09T12:00:00Z');
  expect(result.summary.found).toBe(2); expect(result.summary.analysisScore).toBeNull();
});
