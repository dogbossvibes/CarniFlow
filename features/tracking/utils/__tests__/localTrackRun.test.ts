import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';

const base = {
  runId: 'run-1', sessionId: 'sess-1',
  startedAtMs: Date.parse('2026-08-12T10:00:00.000Z'),
  endedAtMs:   Date.parse('2026-08-12T10:10:00.000Z'),
  searchHandlerDistanceM: 10,
  result: {
    durationS: 600, score: 88, deviationAvgM: 1.4, foundObjects: 2, totalObjects: 3,
    distanceM: 250, breaks: [{}, {}],
    points: [{ latitude: 47, longitude: 8 }, { latitude: 47.1, longitude: 8.1 }],
  },
};

describe('buildRunResultPayload — vollständiges Run-Ergebnis', () => {
  it('mappt alle Felder inkl. run_points + breaks-Zählung', () => {
    const p = buildRunResultPayload(base);
    expect(p.run_id).toBe('run-1');
    expect(p.session_id).toBe('sess-1');
    expect(p.started_at).toBe('2026-08-12T10:00:00.000Z');
    expect(p.ended_at).toBe('2026-08-12T10:10:00.000Z');
    expect(p.duration_seconds).toBe(600);
    expect(p.score).toBe(88);
    expect(p.average_deviation_meters).toBe(1.4);
    expect(p.articles_found).toBe(2);
    expect(p.total_objects).toBe(3);
    expect(p.distance_meters).toBe(250);
    expect(p.breaks).toBe(2);
    expect(p.search_handler_distance_m).toBe(10);
    expect(p.run_points).toEqual([{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1 }]);
  });

  it('ohne handlerDistance → null (kein Dummy)', () => {
    const p = buildRunResultPayload({ ...base, searchHandlerDistanceM: undefined });
    expect(p.search_handler_distance_m).toBeNull();
  });
});

describe('buildRunResultPayload — analytics (Punkt 10/12/13, additiv)', () => {
  it('ohne analytics: kein `analytics`-Feld im Payload (kein Dummy-Objekt, keine Migration nötig)', () => {
    const p = buildRunResultPayload(base);
    expect('analytics' in p).toBe(false);
  });

  it('mit analytics: wird 1:1 unverändert ins Payload übernommen', () => {
    const analytics = { analyticsVersion: 1 as const, trackScore: 77 } as any;
    const p = buildRunResultPayload({ ...base, analytics });
    expect(p.analytics).toBe(analytics);
  });
});


describe('optional original object snapshot', () => {
  const input = () => ({ objects: [
    { id: 'marker-a', index: 0, material: 'stoff' },
    { id: 'marker-b', index: 1, material: 'duebel' },
    { id: 'marker-c', index: 2, material: 'holz' },
  ], statuses: ['manual_found', 'auto_dwell_found', 'pending'] as import('../referenceObjectStatus').ReferenceObjectStatus[],
  scoreBasis: { version: 1 as const, trackPoints: 74, maxTrackPoints: 79, maxObjectPoints: 21, totalObjects: 3 } });
  it('adds snapshot while preserving every existing result field and durable JSON representation', () => {
    const original = buildRunResultPayload(base);
    const source = input();
    const result = buildRunResultPayload({ ...base, objectSnapshotInput: source });
    const { object_snapshot: snapshot, ...existing } = result;
    expect(existing).toEqual(original);
    expect(JSON.parse(JSON.stringify(result)).object_snapshot).toEqual({ version: 1,
      objects: source.objects.map((o, i) => ({ ...o, recordedStatus: source.statuses[i] })), scoreBasis: source.scoreBasis });
    source.objects[0].id = 'changed'; source.statuses[1] = 'user_removed'; source.scoreBasis.trackPoints = 0;
    expect(snapshot).toMatchObject({ objects: [{ id: 'marker-a' }, { recordedStatus: 'auto_dwell_found' }, {}], scoreBasis: { trackPoints: 74 } });
  });
  it('does not backfill legacy/recovery runs or guess missing marker IDs', () => {
    expect(buildRunResultPayload(base)).not.toHaveProperty('object_snapshot');
    const source = input(); source.objects[1].id = '';
    expect(buildRunResultPayload({ ...base, objectSnapshotInput: source })).toEqual(buildRunResultPayload(base));
  });
  it('uses result counts as authority and omits inconsistent new metadata without changing original save', () => {
    const source = input(); source.statuses[1] = 'pending';
    expect(buildRunResultPayload({ ...base, objectSnapshotInput: source })).toEqual(buildRunResultPayload(base));
    expect(buildRunResultPayload({ ...base, objectSnapshotInput: { ...input(), statuses: [] } })).toEqual(buildRunResultPayload(base));
  });
  it('stores a real zero-object reference but never invents rulebook objects for free search', () => {
    const noObjects = { ...base, result: { ...base.result, foundObjects: 0, totalObjects: 0 } };
    const empty = { objects: [], statuses: [] };
    expect(buildRunResultPayload({ ...noObjects, objectSnapshotInput: empty }).object_snapshot)
      .toEqual({ version: 1, objects: [], scoreBasis: null });
    const free = { ...noObjects, result: { ...noObjects.result, totalObjects: 3 } };
    expect(buildRunResultPayload({ ...free, objectSnapshotInput: empty })).toEqual(buildRunResultPayload(free));
  });
});
