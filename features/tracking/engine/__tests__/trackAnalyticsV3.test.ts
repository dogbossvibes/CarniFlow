import {
  analyzeCornersV3, analyzeObjectContacts, classifyAnalyticsSamples,
  computeAssessableDistance, computeTrackAnalyticsV3, detectDeviationEvents,
  type ObjectContactStatus,
} from '@/features/tracking/engine/trackAnalyticsV3';
import type { AnalyticsSample, TrackAnalyticsInput } from '@/features/tracking/engine/trackAnalytics';

const sample = (atM: number, tSec: number, devM = 0.5, speedMps = 1, extra: Partial<AnalyticsSample> = {}): AnalyticsSample => ({
  atM, tSec, devM, speedMps, confidence: 0.95, accuracyM: 5, geometryAccepted: true,
  motionConfidence: 0.9, ...extra,
});
const straight = (count = 20): AnalyticsSample[] => Array.from({ length: count }, (_, index) => sample(index * 2, index * 2));
const input = (samples: AnalyticsSample[], extras: Partial<TrackAnalyticsInput> = {}): TrackAnalyticsInput => ({
  samples, corners: [], objects: [], breaks: [], trackLengthM: Math.max(0, samples.at(-1)?.atM ?? 0), durationS: samples.at(-1)?.tSec ?? 0,
  ...extras,
});

describe('Confidence-basierte Linienabweichung und Recovery v3', () => {
  it('1) einzelner GPS-Sprung erzeugt kein Abweichungsereignis', () => {
    const points = straight();
    points[8] = sample(16, 16, 19, 12, { fusionClassification: 'gps_outlier', geometryAccepted: false });
    expect(detectDeviationEvents(classifyAnalyticsSamples(points))).toHaveLength(0);
  });

  it('2) mehrere zuverlässige Fixes ausserhalb des dynamischen Korridors erzeugen ein Ereignis', () => {
    const points = straight();
    [8, 9, 10, 11].forEach((index, offset) => { points[index] = sample(index * 2, index * 2, 4.5 + offset); });
    const events = detectDeviationEvents(classifyAnalyticsSamples(points));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ startAlongTrackM: 16, recovered: true });
    expect(events[0].maxLineDeviationM).toBeGreaterThan(5);
  });

  it('3) gleiche Geometrie mit schlechter GPS-Qualität ist unsicher/ausgeschlossen, kein harter Fehler', () => {
    const points = straight();
    [8, 9, 10, 11].forEach(index => { points[index] = sample(index * 2, index * 2, 7, 1, { accuracyM: 40 }); });
    const classified = classifyAnalyticsSamples(points);
    expect(classified[9].state).toBe('uncertain');
    expect(detectDeviationEvents(classified)).toHaveLength(0);
    expect(computeAssessableDistance(classified).percent).toBeLessThan(100);
  });

  it('4) ohne Abweichung ist keine Neuaufnahme erforderlich (nicht 0,0 s)', () => {
    const result = computeTrackAnalyticsV3(input(straight()));
    expect(result.reacquisition).toMatchObject({ count: 0, completedCount: 0, meanSec: null, maxSec: null });
  });

  it('5) plausibler Ausflug mit Rückkehr besitzt Recovery-Zeit und -Distanz > 0', () => {
    const points = straight();
    [8, 9, 10, 11].forEach((index, offset) => { points[index] = sample(index * 2, index * 2, 4.5 + offset); });
    const result = computeTrackAnalyticsV3(input(points));
    expect(result.deviationEvents[0].recoveryTimeSec).toBeGreaterThan(0);
    expect(result.deviationEvents[0].recoveryDistanceM).toBeGreaterThan(0);
    expect(result.reacquisition.meanSec).toBeGreaterThan(0);
  });

  it('GPS-Outlier und fehlende Geometrie reduzieren bewertbare Strecke und Score', () => {
    const good = computeTrackAnalyticsV3(input(straight()));
    const badPoints = straight();
    badPoints[8] = sample(16, 16, 20, 10, { geometryAccepted: false, fusionClassification: 'gps_outlier' });
    badPoints[9] = sample(18, 18, 0.5, 1, { accuracyM: 50 });
    const bad = computeTrackAnalyticsV3(input(badPoints));
    expect(bad.assessableDistance.percent).toBeLessThan(good.assessableDistance.percent);
    expect(bad.trackScore).toBeLessThan(good.trackScore);
    expect(bad.analyticsVersion).toBe(3);
  });

  it('bewertbare Strecke benutzt die akzeptierte Search-Linienlänge, nicht den eingefrorenen Lay-Cursor', () => {
    const points = [
      sample(0, 0, 0.5, 1, { searchDistanceM: 0 }),
      sample(2, 2, 0.5, 1, { searchDistanceM: 2 }),
      sample(2, 4, 8, 1, { searchDistanceM: 6, accuracyM: 40 }),
      sample(2, 6, 8, 1, { searchDistanceM: 10, accuracyM: 40 }),
      sample(4, 8, 0.5, 1, { searchDistanceM: 12 }),
    ];
    const assessable = computeAssessableDistance(classifyAnalyticsSamples(points));
    expect(assessable.totalDistanceM).toBe(12);
    expect(assessable.uncertainDistanceM).toBe(10);
    expect(assessable.percent).toBe(58);
  });
});

describe('Winkelstabilisierung v3 (Ground Truth bleibt erhalten)', () => {
  const corner = [{ atM: 20, angleKind: 'links' as const }];

  it('6) sauberer 90°-Winkel hat keinen falschen Overshoot', () => {
    const result = analyzeCornersV3(classifyAnalyticsSamples(straight()), corner)[0];
    expect(result.overshootM).toBe(0);
    expect(result.stabilizationTimeSec).not.toBeNull();
    expect(result.interpretation).not.toBe('likely_overshoot');
  });

  it('7) anhaltendes Überschiessen und Rückkehr ergeben Overshoot und Stabilisierung', () => {
    const points = straight();
    [11, 12, 13, 14].forEach((index, offset) => { points[index] = sample(index * 2, index * 2, 4.5 + offset); });
    const result = analyzeCornersV3(classifyAnalyticsSamples(points), corner)[0];
    expect(result.overshootM).toBeGreaterThan(0);
    expect(result.reacquisitionSec).toBeGreaterThan(0);
    expect(result.stabilizationTimeSec).toBeGreaterThan(0);
  });

  it('8) schlechte Daten erlauben keine Winkelinterpretation', () => {
    const points = straight().map(point => ({ ...point, accuracyM: 60 }));
    const result = analyzeCornersV3(classifyAnalyticsSamples(points), corner)[0];
    expect(result.interpretation).toBe('not_reliably_assessable');
    expect(result.stabilizationTimeSec).toBeNull();
  });
});

describe('Automatische Gegenstandskontakte ohne Fundbehauptung', () => {
  const object = [{ objectId: 'stable-g1', objectIndex: 1, atM: 20, material: 'leder', legIndex: 2, found: false }];
  const status = (points: AnalyticsSample[]): ObjectContactStatus => analyzeObjectContacts(classifyAnalyticsSamples(points), object)[0].status;
  const contactPoints = () => [
    sample(10, 10), sample(13, 13), sample(16, 16), sample(19, 19, 0.5, 0.1),
    sample(19.2, 21, 0.5, 0.1), sample(19.3, 24, 0.5, 0.1),
    sample(20, 26, 0.5, 0.5), sample(23, 29), sample(27, 33),
  ];

  it('9) stabiler Halt mit anschliessendem Weiterlaufen ergibt likely_contact', () => {
    const result = analyzeObjectContacts(classifyAnalyticsSamples(contactPoints()), object)[0];
    expect(result.status).toBe('likely_contact');
    expect(result.stopDurationSec).toBeGreaterThanOrEqual(3);
    expect(result.reasonCodes).toContain('stable_stop');
    expect(result.objectId).toBe('stable-g1');
    expect(result.minRecordedDistanceM).not.toBeNull();
  });

  it('stationäre Fusion-Fixes liefern Stillstandsevidenz, ohne Geometrie zu verschieben', () => {
    const points = contactPoints();
    points[4] = sample(19, 21, 0.5, 0, { geometryAccepted: false, fusionClassification: 'stationary', confidence: 0.6 });
    points[5] = sample(19, 24, 0.5, 0, { geometryAccepted: false, fusionClassification: 'stationary', confidence: 0.6 });
    const classified = classifyAnalyticsSamples(points);
    expect(classified[4].state).toBe('uncertain');
    expect(status(points)).toBe('likely_contact');
    expect(points[4].atM).toBe(points[5].atM);
  });

  it('Führer-Hund-Distanz erweitert das unsichere Vorfeld, nie die Objektposition', () => {
    const upstream = [
      sample(3, 3), sample(6, 6), sample(9, 9), sample(10, 11, 0.5, 0.1),
      sample(10, 14, 0.5, 0.1), sample(10, 17, 0.5, 0.1),
      sample(14, 21), sample(18, 25), sample(22, 29), sample(25, 32),
    ];
    const withoutHint = analyzeObjectContacts(classifyAnalyticsSamples(upstream), object)[0];
    const withHint = analyzeObjectContacts(classifyAnalyticsSamples(upstream), object, 10)[0];
    expect(withoutHint.status).not.toBe('likely_contact');
    expect(withHint.status).toBe('likely_contact');
    expect(withHint.alongTrackPositionM).toBe(20);
    expect(withHint.contactConfidence).toBeLessThan(1);
  });

  it('10) zuverlässig ohne Halt passiert ergibt kein klares Kontaktmuster', () => {
    expect(status(straight())).toBe('no_clear_contact');
  });

  it('11) schlechte GPS-/Motion-Daten im Objektfenster ergeben insufficient_data', () => {
    const points = straight().map(point => Math.abs(point.atM - 20) <= 8 ? { ...point, accuracyM: 60, motionConfidence: 0.1 } : point);
    expect(status(points)).toBe('insufficient_data');
  });

  it('12) einzelner GPS-Fix nahe G1 ist nie likely_contact', () => {
    expect(status([sample(20, 10, 0.1, 0)])).toBe('insufficient_data');
  });

  it('likelihood wird dokumentiert, nicht als bestätigtes Objekt in den Score gezählt', () => {
    const points = contactPoints();
    const without = computeTrackAnalyticsV3(input(points));
    const withObject = computeTrackAnalyticsV3(input(points, { objects: object }));
    expect(withObject.objects[0].status).toBe('likely_contact');
    expect(withObject.trackScore).toBe(without.trackScore);
    expect(withObject.segments.find(segment => segment.type === 'object_zone')?.score).toBeNull();
  });

  it('historischer Marker ohne Material kann weiterhin analysiert werden', () => {
    const result = analyzeObjectContacts(classifyAnalyticsSamples(straight()), [{ atM: 20, material: null, found: false }])[0];
    expect(result.material).toBeNull();
    expect(result.objectIndex).toBe(1);
  });
});
