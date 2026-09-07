import {
  computeTrackAnalytics, computeDeviationStats, analyzeCorners, analyzeObjects,
  computePace, confidenceBand, computeReacquisitionStats,
  type AnalyticsSample, type AnalyticsCornerInput, type AnalyticsObjectInput,
  type TrackAnalyticsInput,
} from '@/features/tracking/engine/trackAnalytics';

function sample(atM: number, tSec: number, devM: number, confidence = 1, speedMps: number | null = null): AnalyticsSample {
  return { atM, tSec, devM, confidence, speedMps };
}

function straightLine(lengthM: number, speedMps: number, devM = 0, confidence = 1): AnalyticsSample[] {
  const out: AnalyticsSample[] = [];
  const stepM = 2;
  for (let atM = 0; atM <= lengthM; atM += stepM) {
    out.push(sample(atM, atM / speedMps, devM, confidence, speedMps));
  }
  return out;
}

function baseInput(overrides: Partial<TrackAnalyticsInput> = {}): TrackAnalyticsInput {
  return {
    samples: straightLine(40, 1.2),
    corners: [], objects: [], breaks: [],
    trackLengthM: 40, durationS: 40 / 1.2,
    ...overrides,
  };
}

describe('trackAnalytics — perfekt gerade Fährte (0 m Abweichung)', () => {
  it('hoher trackScore, Abweichungsstatistik nahe 0', () => {
    const res = computeTrackAnalytics(baseInput());
    expect(res.analyticsVersion).toBe(1);
    expect(res.deviation.meanM).toBeCloseTo(0, 5);
    expect(res.deviation.timeWithinM15S).toBeCloseTo(res.deviation.timeWithinM2S, 0);
    expect(res.trackScore).toBeGreaterThanOrEqual(95);
    expect(res.analysisConfidence).toBe(1);
    expect(res.analysisConfidenceBand).toBe('excellent');
    expect(res.analysisConfidenceHint).toBeNull();
  });
});

describe('trackAnalytics — konstante 2 m Abweichung', () => {
  it('Zeit-innerhalb-2m ≈ Gesamtdauer, Zeit-innerhalb-1.5m ≈ 0, Score deutlich unter perfekt', () => {
    const input = baseInput({ samples: straightLine(40, 1.2, 2.0) });
    const res = computeTrackAnalytics(input);
    expect(res.deviation.meanM).toBeCloseTo(2.0, 1);
    expect(res.deviation.timeWithinM2S).toBeGreaterThan(input.durationS * 0.9);
    expect(res.deviation.timeWithinM15S).toBeLessThan(input.durationS * 0.1);
    const perfect = computeTrackAnalytics(baseInput());
    expect(res.trackScore).toBeLessThan(perfect.trackScore);
  });
});

describe('trackAnalytics — ein einzelner grosser GPS-Ausreisser', () => {
  it('darf maxReliableM nicht dominieren, wenn er niedrige Confidence hat — Score bleibt fair', () => {
    const clean = straightLine(40, 1.2, 0.3);
    const outlierIdx = Math.floor(clean.length / 2);
    const withOutlier = clean.map((s, i) => i === outlierIdx ? { ...s, devM: 45, confidence: 0.1 } : s);
    const res = computeTrackAnalytics(baseInput({ samples: withOutlier }));
    const cleanRes = computeTrackAnalytics(baseInput({ samples: clean }));
    // Der unsichere Ausreisser darf den "reliable" Maximalwert nicht auf 45 m ziehen.
    expect(res.deviation.maxReliableM).toBeLessThan(10);
    expect(res.deviation.maxRawM).toBeGreaterThanOrEqual(45);
    // Score bleibt nahe am sauberen Verlauf — ein einzelner unsicherer Punkt
    // darf den Hund nicht sichtbar schlechter bewerten.
    expect(Math.abs(res.trackScore - cleanRes.trackScore)).toBeLessThanOrEqual(3);
  });
});

describe('trackAnalytics — Ecke überschossen (Overshoot + Re-Acquisition)', () => {
  it('erkennt Overshoot-Distanz und Re-Acquisition-Zeit korrekt', () => {
    const corner: AnalyticsCornerInput = { atM: 20, angleKind: 'links' };
    const samples: AnalyticsSample[] = [
      sample(15, 12, 0.4),
      sample(18, 15, 0.3),
      sample(20, 17, 0.5),    // an der Ecke
      sample(22, 19, 4.0),    // überschossen, Abweichung > ON_TRACK_M (3.0)
      sample(24, 21, 5.5),
      sample(26, 24, 2.0),    // wieder unter der Schwelle — Reacquisition
      sample(30, 28, 0.4),
    ];
    const res = analyzeCorners(samples, [corner]);
    expect(res).toHaveLength(1);
    const c = res[0];
    expect(c.side).toBe('links');
    expect(c.sharpness).toBe('rechtwinklig');
    expect(c.overshootM).not.toBeNull();
    expect(c.overshootM!).toBeGreaterThan(0);
    expect(c.reacquisitionSec).not.toBeNull();
    expect(c.reacquisitionSec!).toBeGreaterThan(0);
    expect(c.maxLateralDeviationM).toBeCloseTo(5.5, 5);
  });

  it('keine Abweichungsspitze nach der Ecke → overshootM 0, reacquisitionSec 0', () => {
    const corner: AnalyticsCornerInput = { atM: 20, angleKind: 'rechts' };
    const samples = straightLine(40, 1.2, 0.3);
    const res = analyzeCorners(samples, [corner]);
    expect(res[0].overshootM).toBe(0);
    expect(res[0].reacquisitionSec).toBe(0);
  });
});

describe('trackAnalytics — Fährte verlassen und wieder aufgenommen (Break + Recovery)', () => {
  it('reacquisition.count zählt Breaks, Score sinkt gegenüber breakfrei', () => {
    const withBreak = computeTrackAnalytics(baseInput({ breaks: [{ startedAtSec: 15, recoveredAtSec: 20, durationSec: 5 }] }));
    const noBreak = computeTrackAnalytics(baseInput());
    expect(withBreak.reacquisition.count).toBe(1);
    expect(withBreak.trackScore).toBeLessThan(noBreak.trackScore);
  });
});

describe('trackAnalytics — Re-Acquisition Time (Punkt 1 der Nachbesserung)', () => {
  it('ein vollständiger Break, 5 Sekunden ausserhalb → mean = max = 5', () => {
    const res = computeReacquisitionStats([{ startedAtSec: 10, recoveredAtSec: 15, durationSec: 5 }]);
    expect(res.count).toBe(1);
    expect(res.completedCount).toBe(1);
    expect(res.meanSec).toBe(5);
    expect(res.maxSec).toBe(5);
    expect(res.medianSec).toBe(5);
  });

  it('zwei Breaks mit unterschiedlichen Zeiten (3s + 7s) → mean = 5, max = 7', () => {
    const res = computeReacquisitionStats([
      { startedAtSec: 10, recoveredAtSec: 13, durationSec: 3 },
      { startedAtSec: 40, recoveredAtSec: 47, durationSec: 7 },
    ]);
    expect(res.count).toBe(2);
    expect(res.completedCount).toBe(2);
    expect(res.meanSec).toBe(5);
    expect(res.maxSec).toBe(7);
  });

  it('ein Break ohne Recovery vor Session-Ende: zählt in count, NICHT in mean/max', () => {
    const res = computeReacquisitionStats([
      { startedAtSec: 10, recoveredAtSec: 13, durationSec: 3 },
      { startedAtSec: 50, recoveredAtSec: null, durationSec: null },   // Session endete im Abriss
    ]);
    expect(res.count).toBe(2);          // beide Breaks zählen
    expect(res.completedCount).toBe(1); // nur der abgeschlossene fliesst in die Dauer-Statistik ein
    expect(res.meanSec).toBe(3);        // NICHT durch den offenen Break verzerrt
    expect(res.maxSec).toBe(3);
  });

  it('nur ein offener Break, nie erholt → count 1, aber mean/max bleiben null (keine erfundene Dauer)', () => {
    const res = computeReacquisitionStats([{ startedAtSec: 10, recoveredAtSec: null, durationSec: null }]);
    expect(res.count).toBe(1);
    expect(res.completedCount).toBe(0);
    expect(res.meanSec).toBeNull();
    expect(res.maxSec).toBeNull();
  });

  it('kein Break → Werte null/0, passend zur bisherigen API', () => {
    const res = computeReacquisitionStats([]);
    expect(res.count).toBe(0);
    expect(res.completedCount).toBe(0);
    expect(res.meanSec).toBeNull();
    expect(res.maxSec).toBeNull();
    expect(res.medianSec).toBeNull();
  });

  it('niedrige Confidence darf keinen künstlichen langen Break erzeugen (Synergie mit der Fusion-Schutzschicht, Punkt 2): eine reine Kurz-Exkursion ohne echte Dauer bleibt unauffällig', () => {
    // Dieselbe kurze, schnell wieder erholte Exkursion wie im ersten Test,
    // aber mit einer sehr kurzen Dauer (1s) — steht stellvertretend für einen
    // Break, der durch einen einzelnen (von der Fusion-Schutzschicht bereits
    // aus der Geometrie ferngehaltenen) GPS-Ausreisser ausgelöst worden wäre:
    // ohne echte Bewegungsdauer bleibt die gemessene Re-Acquisition-Zeit kurz
    // und verzerrt mean/max nicht künstlich nach oben.
    const res = computeReacquisitionStats([{ startedAtSec: 10, recoveredAtSec: 11, durationSec: 1 }]);
    expect(res.meanSec).toBe(1);
    expect(res.maxSec).toBe(1);
  });
});

describe('trackAnalytics — keine Ecken auf der Fährte', () => {
  it('winkel-Kategorie entfällt vollständig, Score wird NICHT bestraft (Gewicht verteilt sich um)', () => {
    const res = computeTrackAnalytics(baseInput());   // corners: []
    expect(res.corners).toEqual([]);
    expect(res.trackScore).toBeGreaterThanOrEqual(95);   // eckenlose, perfekte Fährte bleibt hoch bewertet
  });
});

describe('trackAnalytics — keine Gegenstände auf der Fährte', () => {
  it('gegenstaende-Kategorie entfällt vollständig, Score wird NICHT bestraft', () => {
    const res = computeTrackAnalytics(baseInput());   // objects: []
    expect(res.objects).toEqual([]);
    expect(res.trackScore).toBeGreaterThanOrEqual(95);
  });

  it('analyzeObjects: Gegenstand gefunden vs. übersehen wird korrekt reflektiert', () => {
    const obj: AnalyticsObjectInput = { atM: 10, material: 'stoff', found: true };
    const samples: AnalyticsSample[] = [sample(8, 6, 0.5), sample(10, 8, 0.3), sample(10, 9.5, 0.3), sample(12, 11, 0.4)];
    const res = analyzeObjects(samples, [obj]);
    expect(res[0].found).toBe(true);
    expect(res[0].minDistanceM).not.toBeNull();
    expect(res[0].behavior).toBe('stationary');   // >=1.5s in der Nähe (8→9.5)
  });
});

describe('trackAnalytics — schlechte GPS-/Motion-Confidence darf den Track Score NICHT senken', () => {
  it('identische Bewegung, aber durchgehend niedrige Confidence → gleicher trackScore, aber niedrigere analysisConfidence + Hinweistext', () => {
    const goodConf = computeTrackAnalytics(baseInput({ samples: straightLine(40, 1.2, 0.3, 1.0) }));
    const badConf = computeTrackAnalytics(baseInput({ samples: straightLine(40, 1.2, 0.3, 0.3) }));
    expect(badConf.trackScore).toBe(goodConf.trackScore);
    expect(badConf.analysisConfidence).toBeLessThan(goodConf.analysisConfidence);
    expect(badConf.analysisConfidenceBand).toMatch(/limited|unreliable/);
    expect(badConf.analysisConfidenceHint).not.toBeNull();
    expect(badConf.analysisConfidenceHint).toMatch(/Track Score.*(nicht|unabhängig)/);
    expect(goodConf.analysisConfidenceHint).toBeNull();
  });
});

describe('trackAnalytics — confidenceBand', () => {
  it('teilt sich mit trackFusionEngine dieselben Schwellen', () => {
    expect(confidenceBand(0.95)).toBe('excellent');
    expect(confidenceBand(0.8)).toBe('good');
    expect(confidenceBand(0.6)).toBe('limited');
    expect(confidenceBand(0.2)).toBe('unreliable');
  });
});

describe('trackAnalytics — computePace ist immun gegen Stillstands-Jitter', () => {
  it('kurze rückwärts-/Null-Deltas (Cursor-Rauschen im Stillstand) verzerren die Pace-Statistik nicht', () => {
    const samples: AnalyticsSample[] = [
      sample(0, 0, 0.3), sample(2, 2, 0.3), sample(4, 4, 0.3),
      sample(3.9, 5, 0.3),   // Jitter: winziges Rückwärts-Delta beim Stillstehen
      sample(4, 6, 0.3), sample(6, 8, 0.3), sample(8, 10, 0.3),
    ];
    const pace = computePace(samples);
    expect(pace.avgMps).toBeCloseTo(1.0, 0);
    expect(pace.consistency).toBeGreaterThan(0.7);
  });
});

describe('trackAnalytics — deviation stats direkt (Grenzfall leere Samples)', () => {
  it('keine Samples → alles 0, kein Absturz', () => {
    const stats = computeDeviationStats([]);
    expect(stats.meanM).toBe(0);
    expect(stats.maxReliableM).toBe(0);
  });
});
