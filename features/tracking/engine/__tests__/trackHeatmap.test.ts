import {
  deviationBand, paceBand, pacePercentiles, buildHeatmapParts, heatmapColorForSegment,
  DEVIATION_BAND_COLORS, CONFIDENCE_BAND_COLORS,
} from '@/features/tracking/engine/trackHeatmap';
import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';
import type { ReplayGeometry } from '@/features/tracking/engine/trackReplay';

function segment(overrides: Partial<AnalyticsSegment>): AnalyticsSegment {
  return {
    id: 'seg-0', index: 0, type: 'straight',
    startDistanceM: 0, endDistanceM: 10, lengthM: 10,
    startTimeSec: 0, endTimeSec: 10, durationSec: 10,
    meanDeviationM: 0.5, medianDeviationM: 0.5, p95DeviationM: 0.5, maxDeviationM: 0.5,
    timeWithinM15S: 10, timeWithinM2S: 10, timeOutsideM3S: 0, timeOutsideM5S: 0,
    averageSpeedMps: 1, speedConsistency: 1, analysisConfidence: 1, analysisConfidenceBand: 'excellent',
    score: 90,
    ...overrides,
  };
}

describe('trackHeatmap — Abweichungs-Bänder (Punkt 14, bestehende Grenzen)', () => {
  it('nutzt exakt 1.5/3/5 m — dieselben Grenzen wie DeviationStats', () => {
    expect(deviationBand(1.0)).toBe('very_low');
    expect(deviationBand(1.5)).toBe('very_low');
    expect(deviationBand(2.0)).toBe('low');
    expect(deviationBand(3.0)).toBe('low');
    expect(deviationBand(4.0)).toBe('medium');
    expect(deviationBand(5.0)).toBe('medium');
    expect(deviationBand(6.0)).toBe('high');
  });
});

describe('trackHeatmap — Tempo-Bänder (Punkt 14: Percentile relativ zur eigenen Session)', () => {
  it('klassifiziert relativ zu den tatsächlichen Session-Geschwindigkeiten, nicht global', () => {
    const segs = [0.5, 1.0, 1.0, 1.5, 2.0].map((v, i) => segment({ id: `s${i}`, averageSpeedMps: v }));
    const pct = pacePercentiles(segs);
    expect(paceBand(0.5, pct)).toBe('slow');
    expect(paceBand(2.0, pct)).toBe('fast');
  });

  it('leere Session → neutrale Percentile, kein Crash', () => {
    expect(pacePercentiles([])).toEqual({ p33: 0, p66: 0 });
  });
});

describe('trackHeatmap — Confidence-Bänder (Punkt 14: direkt aus bestehender Systematik)', () => {
  it('nutzt dieselben Confidence-Bänder wie trackAnalytics', () => {
    const excellent = segment({ analysisConfidence: 0.95 });
    const info = heatmapColorForSegment(excellent, 'confidence', { p33: 0, p66: 0 });
    expect(info!.band).toBe('excellent');
    expect(info!.color).toBe(CONFIDENCE_BAND_COLORS.excellent);
  });
});

describe('trackHeatmap — Farblogik ("grün=gut" nur bei Abweichung, nicht bei Confidence)', () => {
  it('Deviation-Bänder haben eine echte Bewertungsskala (very_low…high, 4 unterschiedliche Farben)', () => {
    const colors = new Set(Object.values(DEVIATION_BAND_COLORS));
    expect(colors.size).toBe(4);
  });
  it('Confidence-Bänder verwenden KEINE Ampelfarben (kein reines Grün/Rot-Paar für gut/schlecht)', () => {
    const vals = Object.values(CONFIDENCE_BAND_COLORS).map(c => c.toLowerCase());
    // Keine der Confidence-Farben ist die "Gefahr"-rote Abweichungsfarbe.
    expect(vals).not.toContain(DEVIATION_BAND_COLORS.high.toLowerCase());
  });
});

describe('trackHeatmap — buildHeatmapParts', () => {
  const geometry: ReplayGeometry = {
    points: [
      { latitude: 0, longitude: 0 }, { latitude: 0.0001, longitude: 0 }, { latitude: 0.0002, longitude: 0 },
      { latitude: 0.0003, longitude: 0 }, { latitude: 0.0004, longitude: 0 },
    ],
    pointsTimeSec: [0, 2, 4, 6, 8],
  };
  const segments: AnalyticsSegment[] = [
    segment({ id: 'a', index: 0, startTimeSec: 0, endTimeSec: 4, meanDeviationM: 0.5 }),
    segment({ id: 'b', index: 1, startTimeSec: 4, endTimeSec: 8, meanDeviationM: 4.0 }),
  ];

  it('erzeugt einen farbigen Teil je Segment mit den zeitlich passenden Punkten', () => {
    const parts = buildHeatmapParts(geometry, segments, 'deviation');
    expect(parts).toHaveLength(2);
    expect(parts[0].band).toBe('very_low');
    expect(parts[1].band).toBe('medium');
    expect(parts[0].coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('Segment ohne anwendbare Metrik wird übersprungen, kein erfundener Wert', () => {
    const withNull = [segment({ id: 'a', startTimeSec: 0, endTimeSec: 8, meanDeviationM: null })];
    expect(buildHeatmapParts(geometry, withNull, 'deviation')).toEqual([]);
  });

  it('Längen-Mismatch der Geometrie (z. B. altes Format) → leeres Ergebnis, kein Crash', () => {
    expect(buildHeatmapParts({ points: geometry.points, pointsTimeSec: [0, 1] }, segments, 'deviation')).toEqual([]);
  });
});
