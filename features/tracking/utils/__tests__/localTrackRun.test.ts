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
