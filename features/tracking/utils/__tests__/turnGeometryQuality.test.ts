// Turn-Geometrie-Qualität: Kontrakt (synthetisch) + Kalibrierung an realen
// Feldläufen (Detektor-Puffer der QA-v2.1-Exporte).
import * as fs from 'fs';
import * as path from 'path';
import {
  turnGeometryQuality, SHARPNESS_MAX_RATIO, QUALITY_HIGH_MIN,
  type TurnGeometryInput,
} from '@/features/tracking/utils/turnGeometryQuality';
import { detectShortLegCorners, stableLegWindow } from '@/features/tracking/utils/shortLegCornerDetection';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';

const base: TurnGeometryInput = {
  legBeforeM: 5, legAfterM: 5, sampleCountBefore: 6, sampleCountAfter: 6,
  spreadBeforeDeg: 5, spreadAfterDeg: 5, windowAccuraciesM: [4, 4, 4, 4, 4, 4, 4],
};

describe('turnGeometryQuality — Kontrakt', () => {
  it('gute Geometrie (Accuracy 4 m, Schenkel 5 m) → high, Schärfe auflösbar', () => {
    const q = turnGeometryQuality(base);
    expect(q.level).toBe('high');
    expect(q.score).toBeGreaterThanOrEqual(QUALITY_HIGH_MIN);
    expect(q.sharpnessResolvable).toBe(true);
    expect(q.accuracyToLegRatio).toBeCloseTo(0.8, 2);
  });

  it('Test C: Accuracy grösser als der Schenkel → low, Schärfe NICHT auflösbar', () => {
    const q = turnGeometryQuality({ ...base, legBeforeM: 3, legAfterM: 3.4, windowAccuraciesM: [8, 8.3, 8.1, 8, 8.2] });
    expect(q.level).toBe('low');
    expect(q.accuracyToLegRatio!).toBeGreaterThan(SHARPNESS_MAX_RATIO);
    expect(q.sharpnessResolvable).toBe(false);
  });

  it('die Qualität ist monoton: schlechtere Accuracy senkt den Score nie', () => {
    let prev = 2;
    for (const acc of [2, 4, 6, 8, 10, 14]) {
      const q = turnGeometryQuality({ ...base, windowAccuraciesM: [acc, acc, acc] });
      expect(q.score).toBeLessThanOrEqual(prev);
      prev = q.score;
    }
  });

  it('kürzere Schenkel und weniger Punkte senken den Score', () => {
    const long = turnGeometryQuality(base).score;
    expect(turnGeometryQuality({ ...base, legBeforeM: 2.2, legAfterM: 2.2 }).score).toBeLessThan(long);
    expect(turnGeometryQuality({ ...base, sampleCountBefore: 3, sampleCountAfter: 3 }).score).toBeLessThan(long);
    expect(turnGeometryQuality({ ...base, spreadBeforeDeg: 24, spreadAfterDeg: 24 }).score).toBeLessThan(long);
  });

  it('fehlende Accuracy ist UNBEKANNT (neutral), nicht „perfekt"', () => {
    const q = turnGeometryQuality({ ...base, windowAccuraciesM: [null, null] });
    expect(q.accuracyToLegRatio).toBeNull();
    expect(q.parts.ratio).toBe(0.5);
    expect(q.score).toBeLessThan(turnGeometryQuality(base).score);
  });

  it('die Auflösbarkeit hängt NUR an der GPS-Geometrie — die Eingabe kennt keine Motion', () => {
    const ratio2_7 = { ...base, legBeforeM: 3, legAfterM: 3, windowAccuraciesM: [8.1, 8.1, 8.1] };   // Verhältnis 2,7
    expect(turnGeometryQuality(ratio2_7).sharpnessResolvable).toBe(false);
    expect(Object.keys(ratio2_7)).not.toContain('motionCorroborated');
    expect(turnGeometryQuality({ ...ratio2_7, windowAccuraciesM: [7, 7, 7] }).sharpnessResolvable).toBe(true);   // Verhältnis 2,33
  });
});

// ── Kalibrierung an realen Läufen ─────────────────────────────────────────
const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');
function cornerRatios(file: string) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'));
  const buf = capturedDetectorBuffer(j.detectorPoints);
  const { corners, diagnostics } = detectShortLegCorners(buf);
  return corners.map(c => {
    const d = diagnostics.find(x => x.apexIndex === c.apexIndex)!;
    const b = stableLegWindow(buf, c.apexIndex, false)!, a = stableLegWindow(buf, c.apexIndex, true)!;
    const acc: (number | null)[] = [];
    for (let i = b.endIndex; i <= a.endIndex; i++) acc.push(buf[i].accuracy);
    const q = turnGeometryQuality({
      legBeforeM: b.lengthM, legAfterM: a.lengthM, sampleCountBefore: b.sampleCount, sampleCountAfter: a.sampleCount,
      spreadBeforeDeg: b.spreadDeg, spreadAfterDeg: a.spreadDeg, windowAccuraciesM: acc,
    });
    return { kind: c.kind, diag: d, q };
  });
}

describe('Kalibrierung an realen Feldläufen', () => {
  it('bestätigte Spitzwinkel (Spitz-QA, Lauf 2) bleiben auflösbar', () => {
    for (const f of ['spitz-qa-0ec8c4ca.json', 'lauf2-qa-848ea966.json']) {
      const spitz = cornerRatios(f).filter(r => r.kind.startsWith('spitz'));
      expect(spitz.length).toBeGreaterThan(0);
      for (const r of spitz) { expect(r.q.sharpnessResolvable).toBe(true); expect(r.q.accuracyToLegRatio!).toBeLessThan(2); }
    }
  });

  it('FT2 (qa-c2a47f13): der zweite Winkel ist NICHT als „spitz" belegbar und wird zur Richtung-only-Ecke', () => {
    const rows = cornerRatios('ft2-qa-c2a47f13.json');
    expect(rows).toHaveLength(2);
    const second = rows[1];
    expect(second.diag.headingDeltaDeg).toBeCloseTo(-126.1, 1);
    expect(second.diag.interiorAngleDeg).toBeCloseTo(53.9, 1);
    expect(second.q.sharpnessResolvable).toBe(false);
    expect(second.q.accuracyToLegRatio!).toBeGreaterThan(SHARPNESS_MAX_RATIO);
    // Der Detektor selbst: Richtung LINKS bleibt, Schärfe wird nicht mehr als spitz behauptet.
    expect(second.kind).toBe('links');
    expect(second.diag.sharpness).toBe('unresolved');
    expect(second.diag.sharpnessDemoted).toBe(true);
  });
});
