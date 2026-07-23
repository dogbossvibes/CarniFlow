import {
  SEGMENT_PREANNOUNCE_STEPS,
  analyzeTrackSegments,
  actualSegmentSteps,
  buildTrackSegmentPolylines,
  clampSegmentSteps,
  coerceTrackSegments,
  createPlannedSegment,
  plannedSegmentAnnouncement,
  searchSegmentAnnouncements,
  segmentEndAnnouncement,
  segmentStartAnnouncement,
  type TrackSegment,
} from '@/features/tracking/utils/trackSegments';

const baseSegment = (patch: Partial<TrackSegment> = {}): TrackSegment => ({
  id: 'seg-1',
  dogId: 'dog-a',
  trackSessionId: 'track-1',
  type: 'no_food',
  customLabel: null,
  plannedLengthSteps: 10,
  startStep: 3,
  endStep: 13,
  startCoordinate: { lat: 47, lng: 8 },
  endCoordinate: { lat: 47.0009, lng: 8 },
  startedAt: 1,
  completedAt: 2,
  status: 'completed',
  voiceEnabled: true,
  createdAt: 1,
  updatedAt: 2,
  startTrackPointIndex: 1,
  endTrackPointIndex: 3,
  ...patch,
});

describe('trackSegments', () => {
  test('plant eine Teilstrecke mit Vorlauf und genau einem Codepfad im Modell', () => {
    const segment = createPlannedSegment({
      dogId: 'dog-a',
      trackSessionId: 'track-1',
      type: 'no_food',
      currentStep: 100,
      plannedLengthSteps: 10,
      voiceEnabled: true,
    });
    expect(segment.status).toBe('planned');
    expect(segment.startStep).toBe(103);
    expect(segment.endStep).toBe(113);
    expect(segment.plannedLengthSteps).toBe(10);
    expect(plannedSegmentAnnouncement(segment)).toBe('In 3 Schritten folgen 10 Schritte ohne Futter.');
  });

  test('validiert Grenzen und Custom-Label deterministisch', () => {
    expect(clampSegmentSteps(0)).toBe(1);
    expect(clampSegmentSteps(999)).toBe(500);
    const segment = createPlannedSegment({
      dogId: 'dog-a',
      trackSessionId: null,
      type: 'custom',
      customLabel: '  Unterbruch   am  Waldrand  ',
      currentStep: 0,
      plannedLengthSteps: 3,
      voiceEnabled: false,
    });
    expect(segment.customLabel).toBe('Unterbruch am Waldrand');
    expect(segment.voiceEnabled).toBe(false);
  });

  test('liefert feste Ansagetexte und triggert Suchansagen genau einmal', () => {
    const segment = baseSegment();
    expect(segmentStartAnnouncement(segment)).toBe('Teilstrecke ohne Futter beginnt.');
    expect(segmentEndAnnouncement()).toBe('Teilstrecke beendet.');
    let state = {};
    let result = searchSegmentAnnouncements({ segments: [segment], currentStep: segment.startStep - SEGMENT_PREANNOUNCE_STEPS, state });
    expect(result.messages).toEqual(['In 3 Schritten beginnt eine Teilstrecke ohne Futter.']);
    state = result.state;
    result = searchSegmentAnnouncements({ segments: [segment], currentStep: segment.startStep, state });
    expect(result.messages).toEqual(['Teilstrecke ohne Futter beginnt.']);
    state = result.state;
    result = searchSegmentAnnouncements({ segments: [segment], currentStep: segment.endStep, state });
    expect(result.messages).toEqual(['Teilstrecke beendet.']);
    result = searchSegmentAnnouncements({ segments: [segment], currentStep: segment.endStep + 2, state: result.state });
    expect(result.messages).toEqual([]);
  });

  test('teilt die Karte in normal, Teilstrecke, normal', () => {
    const points = [0, 1, 2, 3, 4].map(i => ({ lat: 47 + i * 0.0001, lng: 8, t: i }));
    const parts = buildTrackSegmentPolylines(points, [baseSegment()]);
    expect(parts.map(p => p.kind)).toEqual(['normal', 'segment', 'normal']);
    expect(parts[1].coordinates).toHaveLength(3);
  });

  test('koerziert alte Persistenz ohne segments zu leer und analysiert neutral', () => {
    expect(coerceTrackSegments(undefined)).toEqual([]);
    expect(analyzeTrackSegments({ segments: [] })).toEqual({ count: 0, plannedSteps: 0, actualSteps: 0, types: [], hints: [] });
  });

  test('analysiert abgeschlossene und vorzeitig beendete Teilstrecken ohne KI-Begriffe', () => {
    const segment = baseSegment({ endStep: 10 });
    expect(actualSegmentSteps(segment)).toBe(7);
    const analysis = analyzeTrackSegments({ segments: [segment] });
    expect(analysis.count).toBe(1);
    expect(analysis.plannedSteps).toBe(10);
    expect(analysis.actualSteps).toBe(7);
    expect(analysis.hints.join(' ')).toContain('nach 7 statt 10 Schritten beendet');
    expect(analysis.hints.join(' ')).not.toMatch(/\b(KI|AI|künstliche Intelligenz)\b/i);
  });
});
