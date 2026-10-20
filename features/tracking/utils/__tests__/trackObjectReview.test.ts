import { buildTrackObjectSnapshot, recordedObjectOutcome, reviewedObjectScore, type TrackObjectScoreBasis } from '../trackObjectReview';

const basis: TrackObjectScoreBasis = { version: 1, trackPoints: 62.375, maxTrackPoints: 79, maxObjectPoints: 21, totalObjects: 3 };
const input = () => ({ objects: [{ id: 'a', index: 0 }, { id: 'b', index: 1 }, { id: 'c', index: 2 }],
  statuses: ['manual_found', 'missed', 'unobserved'] as const, foundObjects: 1, totalObjects: 3, scoreBasis: basis });
const snapshotInput = () => ({ ...input(), statuses: [...input().statuses] });

describe('original object snapshot', () => {
  it('preserves identity, raw statuses and unrounded score terms without sharing mutable arrays', () => {
    const source = snapshotInput();
    const result = buildTrackObjectSnapshot(source)!;
    expect(result.objects).toEqual([{ id: 'a', index: 0, recordedStatus: 'manual_found' },
      { id: 'b', index: 1, recordedStatus: 'missed' }, { id: 'c', index: 2, recordedStatus: 'unobserved' }]);
    expect(result.scoreBasis).toEqual(basis);
    expect(result.scoreBasis).not.toBe(basis);
    source.objects[0].id = 'changed';
    expect(result.objects[0].id).toBe('a');
  });
  it('does not manufacture an object for a zero-object reference', () => {
    expect(buildTrackObjectSnapshot({ objects: [], statuses: [], foundObjects: 0, totalObjects: 0 }))
      .toEqual({ version: 1, objects: [], scoreBasis: null });
  });
  it.each(['count', 'length', 'missingId', 'duplicateId', 'wrongIndex', 'foundCount', 'invalidStatus'])('rejects an inconsistent %s instead of changing old data', kind => {
    const source: any = snapshotInput();
    if (kind === 'count') source.totalObjects = 4;
    if (kind === 'length') source.statuses.pop();
    if (kind === 'missingId') delete source.objects[1].id;
    if (kind === 'duplicateId') source.objects[1].id = 'a';
    if (kind === 'wrongIndex') source.objects[1].index = 7;
    if (kind === 'foundCount') source.foundObjects = 2;
    if (kind === 'invalidStatus') source.statuses[1] = 'surprise';
    expect(buildTrackObjectSnapshot(source)).toBeUndefined();
  });
  it('can preserve statuses without reconstructing a missing score', () => {
    expect(buildTrackObjectSnapshot({ ...snapshotInput(), scoreBasis: undefined })?.scoreBasis).toBeNull();
    expect(buildTrackObjectSnapshot({ ...snapshotInput(), scoreBasis: { ...basis, trackPoints: NaN } })?.scoreBasis).toBeNull();
  });
  it.each([
    ['manual_found', 'found'], ['auto_dwell_found', 'found'], ['user_removed', 'not_found'],
    ['missed', 'not_found'], ['unobserved', 'unobserved'], ['pending', 'unknown'],
  ] as const)('%s retains its distinct meaning', (status, outcome) => expect(recordedObjectOutcome(status)).toBe(outcome));
});

describe('reviewed score uses the existing object component', () => {
  it('changes only the known object contribution, with rounding applied once at the end', () => {
    expect(reviewedObjectScore({ basis, outcomes: ['found', 'not_found', 'not_found'], hasGaps: false })).toBe(69);
    expect(reviewedObjectScore({ basis, outcomes: ['found', 'found', 'not_found'], hasGaps: false })).toBe(76);
    expect(basis.trackPoints).toBe(62.375);
  });
  it('does not turn a partial recording or unknown status into a complete score', () => {
    expect(reviewedObjectScore({ basis, outcomes: ['found', 'found', 'found'], hasGaps: true })).toBeNull();
    expect(reviewedObjectScore({ basis, outcomes: ['found', 'unknown', 'not_found'], hasGaps: false })).toBeNull();
    expect(reviewedObjectScore({ basis, outcomes: ['found', 'unobserved', 'not_found'], hasGaps: false })).toBeNull();
  });
  it('does not reuse a score basis from another reference', () => {
    expect(reviewedObjectScore({ basis, outcomes: ['found'], hasGaps: false })).toBeNull();
    expect(reviewedObjectScore({ basis: null, outcomes: [], hasGaps: false })).toBeNull();
  });
  it('preserves the existing zero-object scoring convention', () => {
    expect(reviewedObjectScore({ basis: { ...basis, totalObjects: 0 }, outcomes: [], hasGaps: false })).toBe(83);
  });
});

it('preserves optional material without changing recorded identities, counts, states or score', () => {
  const original = snapshotInput();
  const result = buildTrackObjectSnapshot({ ...original, objects: original.objects.map((o, i) => ({ ...o, material: i === 0 ? 'gummi' : 'holz' })) })!;
  expect(result.objects.map(o => o.material)).toEqual(['gummi', 'holz', 'holz']);
  expect(result.objects.map(({ material: _material, ...rest }) => rest)).toEqual(buildTrackObjectSnapshot(original)!.objects);
  expect(result.scoreBasis).toEqual(basis);
});

it.each(['duebel','ball'])('refuses a new snapshot that accidentally includes Joker %s', material => {
 const original=snapshotInput();
 expect(buildTrackObjectSnapshot({...original,objects:original.objects.map((o,i)=>({...o,material:i===0?material:'holz'}))})).toBeUndefined();
});
