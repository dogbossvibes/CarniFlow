// T-197: Messunsicherheit der Linienabweichung — reine Anzeigehilfe.
import { computeTrackAnalyticsV3 } from '../../engine/trackAnalyticsV3';
import type { AnalyticsSample } from '../../engine/trackAnalytics';
import { DEVIATION_UNCERTAINTY_FACTOR, deviationUncertaintyM, medianAccuracyM } from '../deviationUncertainty';
import { formatDeviationUncertaintyM } from '../formatDeviation';

describe('deviationUncertaintyM', () => {
  test('kombiniert Referenz und Absuche quadratisch', () => {
    expect(deviationUncertaintyM(3, 4)).toBeCloseTo(DEVIATION_UNCERTAINTY_FACTOR * 5, 6);   // 2,0 m
    expect(deviationUncertaintyM(3, 3)).toBe(1.7);
  });
  test('ohne Genauigkeit der Absuche gibt es keine Angabe', () => {
    expect(deviationUncertaintyM(4, null)).toBeNull();
    expect(deviationUncertaintyM(4, Number.NaN)).toBeNull();
    expect(deviationUncertaintyM(4, 0)).toBeNull();
  });
  test('fehlt nur die Referenz, zählt die Absuche allein', () => {
    expect(deviationUncertaintyM(null, 5)).toBe(2);
    expect(deviationUncertaintyM(undefined, 5)).toBe(2);
  });
  test('Median ignoriert fehlende und ungültige Werte', () => {
    expect(medianAccuracyM([5, null, 3, undefined, Number.NaN, 4, -1])).toBe(4);
    expect(medianAccuracyM([4, 6])).toBe(5);
    expect(medianAccuracyM([null, undefined])).toBeNull();
  });
  test('Anzeige auf ganze Meter, nie unter 1 m', () => {
    expect(formatDeviationUncertaintyM(1.7)).toBe('±2 m');
    expect(formatDeviationUncertaintyM(0.3)).toBe('±1 m');
    expect(formatDeviationUncertaintyM(4.4)).toBe('±4 m');
  });
});

describe('computeTrackAnalyticsV3', () => {
  const samples = (accuracyM: number | null): AnalyticsSample[] => Array.from({ length: 40 }, (_, i) => ({
    atM: i * 1.2, searchDistanceM: i * 1.2, tSec: i, devM: 1 + (i % 3) * 0.3, confidence: 0.9, speedMps: 1.2, accuracyM,
  }));
  const referenceLine = Array.from({ length: 30 }, (_, i) => ({ latitude: 47.3 + i * 0.00002, longitude: 8.5, accuracy: 4 }));
  const input = (accuracyM: number | null, withReference: boolean) => ({
    samples: samples(accuracyM), corners: [], objects: [], breaks: [], trackLengthM: 50, durationS: 40,
    ...(withReference ? { referenceLine } : {}),
  });

  test('liefert die Unsicherheit zusätzlich, ohne Score oder Abweichung zu verändern', () => {
    const withAccuracy = computeTrackAnalyticsV3(input(3, true));
    const withoutAccuracy = computeTrackAnalyticsV3(input(null, true));
    expect(withAccuracy.deviationUncertaintyM).toBe(2);   // 0,4 × √(4² + 3²)
    expect(withoutAccuracy.deviationUncertaintyM).toBeUndefined();
    // Dieselben Messwerte: die Linienabweichung ist identisch, ob eine Unsicherheit ausgewiesen wird oder nicht.
    expect(withAccuracy.deviation).toEqual(withoutAccuracy.deviation);
  });
  test('ohne gelegte Referenz zählt die Absuche allein', () => {
    expect(computeTrackAnalyticsV3(input(5, false)).deviationUncertaintyM).toBe(2);
  });
});
