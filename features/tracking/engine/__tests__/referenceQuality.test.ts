// Referenz-Qualität: Kontrakt + Kalibrierung an den 11 realen QA-Läufen.
import * as fs from 'fs';
import * as path from 'path';
import {
  computeReferenceQuality, NEUTRAL_REFERENCE_QUALITY, REFERENCE_QUALITY_THRESHOLDS as T,
  type ReferenceLinePoint,
} from '@/features/tracking/engine/referenceQuality';
import { computeTrackAnalyticsV3 } from '@/features/tracking/engine/trackAnalyticsV3';
import type { AnalyticsSample, TrackAnalyticsInput } from '@/features/tracking/engine/trackAnalytics';

const FIX = path.join(__dirname, '..', '..', 'utils', '__tests__', 'fixtures', 'realFieldV21');
const M = 111320;
const toLine = (pts: { x: number; y: number; accuracy: number | null }[]): ReferenceLinePoint[] =>
  pts.map(p => ({ latitude: 47 + p.y / M, longitude: 8 + p.x / (M * Math.cos((47 * Math.PI) / 180)), accuracy: p.accuracy }));

function loadRun(file: string) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'));
  const cornerAtM = (j.markers as { type: string; atM: number | null }[])
    .filter(m => m.type === 'winkel' && m.atM != null).map(m => m.atM as number);
  return { line: toLine(j.points), cornerAtM };
}

describe('Kontrakt', () => {
  const straight = (n: number, acc: number | null = 4): ReferenceLinePoint[] =>
    Array.from({ length: n }, (_, i) => ({ latitude: 47 + (i * 2.5) / M, longitude: 8, accuracy: acc }));

  it('zu wenig Punkte → neutral (Konfidenz unverändert)', () => {
    const r = computeReferenceQuality({ line: straight(3), cornerAtM: [] });
    expect(r.confidenceFactor).toBe(1);
    expect(r.reasons).toEqual([]);
    expect(NEUTRAL_REFERENCE_QUALITY.confidenceFactor).toBe(1);
  });

  it('gute, gerade Referenz → good, Faktor 1', () => {
    const r = computeReferenceQuality({ line: straight(12, 4), cornerAtM: [] });
    expect(r.level).toBe('good');
    expect(r.score).toBe(1);
    expect(r.confidenceFactor).toBe(1);
  });

  it('hohe Median-Accuracy → reference_geometry_low, nie „good"', () => {
    const r = computeReferenceQuality({ line: straight(12, 8), cornerAtM: [] });
    expect(r.reasons).toEqual(['reference_geometry_low']);
    expect(r.level).not.toBe('good');
    expect(r.confidenceFactor).toBeLessThan(1);
    expect(r.confidenceFactor).toBeGreaterThanOrEqual(T.confidenceFloor);
  });

  it('fehlende Accuracy: keine Behauptung — kein Geometrie-Abzug', () => {
    const r = computeReferenceQuality({ line: straight(12, null), cornerAtM: [] });
    expect(r.medianAccuracyM).toBeNull();
    expect(r.reasons).toEqual([]);
  });

  it('scharfer Knick ohne Marker → reference_turn_uncertain; mit Marker in 4,5 m → nicht', () => {
    // Nord 12,5 m, dann spitz zurück (≈ 158°) — ein 90°-Knick läge unter der Schwelle.
    const line: ReferenceLinePoint[] = [];
    for (let i = 0; i < 6; i++) line.push({ latitude: 47 + (i * 2.5) / M, longitude: 8, accuracy: 4 });
    for (let i = 0; i < 5; i++) line.push({ latitude: 47 + (10 - i * 2.5) / M, longitude: 8 + 1 / (M * 0.68), accuracy: 4 });
    const without = computeReferenceQuality({ line, cornerAtM: [] });
    expect(without.reasons).toContain('reference_turn_uncertain');
    expect(without.unmarkedSharpTurns.length).toBeGreaterThanOrEqual(1);
    const apexAt = without.unmarkedSharpTurns[0].atM;
    const withMarker = computeReferenceQuality({ line, cornerAtM: [apexAt + 4] });
    expect(withMarker.reasons).not.toContain('reference_turn_uncertain');
    const tooFar = computeReferenceQuality({ line, cornerAtM: [apexAt + 6] });
    expect(tooFar.reasons).toContain('reference_turn_uncertain');
  });

  it('die ersten zwei Knoten zählen nie (Start-Anker-Artefakt)', () => {
    const line: ReferenceLinePoint[] = [
      { latitude: 47, longitude: 8, accuracy: 4 },
      { latitude: 47 + 3 / M, longitude: 8, accuracy: 4 },
      { latitude: 47 + 0.5 / M, longitude: 8, accuracy: 4 },   // 180°-Umkehr am Knoten 1
      { latitude: 47 + 3 / M, longitude: 8, accuracy: 4 },
      { latitude: 47 + 5.5 / M, longitude: 8, accuracy: 4 },
      { latitude: 47 + 8 / M, longitude: 8, accuracy: 4 },
    ];
    expect(computeReferenceQuality({ line, cornerAtM: [] }).unmarkedSharpTurns.filter(t => t.atM < 4)).toEqual([]);
  });
});

describe('Kalibrierung an den 11 realen Läufen', () => {
  const expected: Record<string, { geometryLow: boolean; unmarked: number }> = {
    'f1t-qa-1616e65f.json':   { geometryLow: true,  unmarked: 1 },   // verlorener L-Turn, 8,1 m
    'ft2-qa-c2a47f13.json':   { geometryLow: true,  unmarked: 0 },   // 7,9 m, beide Winkel erfasst
    'lauf1-qa-a3055da3.json': { geometryLow: false, unmarked: 0 },
    'lauf10-qa-5637ad58.json': { geometryLow: false, unmarked: 0 },
    'lauf2-qa-848ea966.json': { geometryLow: false, unmarked: 0 },
    'lauf3-qa-1c341a07.json': { geometryLow: true,  unmarked: 0 },   // keine Ecke gelaufen; Median-Accuracy 9,2 m
    'lauf7-qa-3e78df58.json': { geometryLow: false, unmarked: 0 },
    'lauf8-qa-ef808e24.json': { geometryLow: false, unmarked: 0 },
    'lauf9-qa-01e12e75.json': { geometryLow: false, unmarked: 0 },
    'r1-qa-03d970ff.json':    { geometryLow: false, unmarked: 0 },
    'spitz-qa-0ec8c4ca.json': { geometryLow: false, unmarked: 2 },   // gelaufen R,L,SL,SR — nur R + SR erfasst
  };
  for (const [file, exp] of Object.entries(expected)) {
    it(`${file}`, () => {
      const r = computeReferenceQuality(loadRun(file));
      expect(r.reasons.includes('reference_geometry_low')).toBe(exp.geometryLow);
      expect(r.unmarkedSharpTurns.length).toBe(exp.unmarked);
      expect(r.reasons.includes('reference_turn_uncertain')).toBe(exp.unmarked > 0);
    });
  }
  it('kein „Knick ohne Marker" auf den Läufen ohne Ecke (Negativfälle)', () => {
    for (const f of ['lauf3-qa-1c341a07.json', 'lauf7-qa-3e78df58.json', 'lauf8-qa-ef808e24.json']) {
      const r = computeReferenceQuality(loadRun(f));
      expect(r.reasons).not.toContain('reference_turn_uncertain');
      expect(r.unmarkedSharpTurns).toEqual([]);
    }
    // Lauf 7/8 sind saubere Referenzen; Lauf 3 hat eine tatsächlich schlechte Accuracy (9,2 m).
    expect(computeReferenceQuality(loadRun('lauf7-qa-3e78df58.json')).level).toBe('good');
    expect(computeReferenceQuality(loadRun('lauf8-qa-ef808e24.json')).level).toBe('good');
  });
});

// ── Integration: Score ≠ Confidence ───────────────────────────────────────
function samples(n = 30): AnalyticsSample[] {
  return Array.from({ length: n }, (_, i) => ({
    atM: i * 0.6, searchDistanceM: i * 0.6, tSec: i, devM: 0.8, confidence: 0.95, speedMps: 1.2, accuracyM: 4,
    geometryAccepted: true, fusionClassification: 'accepted', motionConfidence: 0.9,
  } as unknown as AnalyticsSample));
}
const baseInput = (referenceLine?: ReferenceLinePoint[]): TrackAnalyticsInput => ({
  samples: samples(), corners: [], objects: [], breaks: [], trackLengthM: 18, durationS: 30, referenceLine,
});

describe('computeTrackAnalyticsV3: Referenz-Qualität senkt die Konfidenz, nie den Score', () => {
  const good = toLine(JSON.parse(fs.readFileSync(path.join(FIX, 'lauf1-qa-a3055da3.json'), 'utf8')).points);
  const bad = toLine(JSON.parse(fs.readFileSync(path.join(FIX, 'f1t-qa-1616e65f.json'), 'utf8')).points);

  it('ohne gelegte Linie: identisch zu bisher (kein referenceQuality-Feld)', () => {
    const a = computeTrackAnalyticsV3(baseInput());
    expect(a.referenceQuality).toBeUndefined();
  });

  it('gute Referenz ändert nichts', () => {
    const without = computeTrackAnalyticsV3(baseInput());
    const withGood = computeTrackAnalyticsV3(baseInput(good));
    expect(withGood.referenceQuality?.level).toBe('good');
    expect(withGood.analysisConfidence).toBe(without.analysisConfidence);
  });

  it('schlechte Referenz (F1) senkt analysisConfidence, aber trackScore und scoreBreakdown bleiben gleich', () => {
    const without = computeTrackAnalyticsV3(baseInput());
    const withBad = computeTrackAnalyticsV3(baseInput(bad));
    expect(withBad.referenceQuality?.level).not.toBe('good');
    expect(withBad.referenceQuality?.reasons).toEqual(expect.arrayContaining(['reference_geometry_low', 'reference_turn_uncertain']));
    expect(withBad.analysisConfidence).toBeLessThan(without.analysisConfidence);
    expect(withBad.trackScore).toBe(without.trackScore);
    expect(withBad.scoreBreakdown).toEqual(without.scoreBreakdown);
    expect(withBad.analysisConfidence).toBeGreaterThanOrEqual(without.analysisConfidence * T.confidenceFloor - 0.011);
  });
});
