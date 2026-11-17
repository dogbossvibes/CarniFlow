// T-211: Der Long-Baseline-Rückfall darf „spitz" belegen — aber nur bei Konsens
// aller Schenkellängen und auflösbarer Geometrie. Rein synthetische Geometrie.
import { evaluateLongBaselineCorner } from '../longBaselineCorner';
import { fuseTurns } from '../turnFusion';
import type { ShortLegPoint } from '../shortLegCornerDetection';

const LAT0 = 47.3, M_LAT = 111320, M_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

/** Polylinie aus Abschnitten (Kurs in Grad, Länge in m), Punktabstand 1 m. */
function path(sections: readonly (readonly [number, number])[], accuracy: number | null = 5): { points: ShortLegPoint[]; apexIndex: number } {
  const points: ShortLegPoint[] = [];
  let x = 0, y = 0, cum = 0, apexIndex = 0;
  const push = () => points.push({ lat: LAT0 + y / M_LAT, lng: 8.5 + x / M_LNG, cumDist: cum, accuracy, t: 1_800_000_000_000 + points.length * 1000 });
  push();
  sections.forEach(([courseDeg, lengthM], s) => {
    const r = (courseDeg * Math.PI) / 180;
    for (let i = 0; i < lengthM; i++) { x += Math.sin(r); y += Math.cos(r); cum += 1; push(); }
    if (s === 0) apexIndex = points.length - 1;
  });
  return { points, apexIndex };
}

describe('Long-Baseline: Schärfe (T-211)', () => {
  it('Innenwinkel 45° über alle Schenkellängen → spitz, Richtung bleibt', () => {
    const { points, apexIndex } = path([[0, 20], [135, 20]]);
    const hit = evaluateLongBaselineCorner(points, apexIndex)!;
    expect(hit.sharpness).toBe('spitz');
    expect(hit.direction).toBe('rechts');
    expect(hit.baselinesM).toEqual([8, 12, 16]);
    expect(hit.maxInteriorDeg).toBeLessThanOrEqual(60);
    const left = path([[0, 20], [-135, 20]]);
    expect(evaluateLongBaselineCorner(left.points, left.apexIndex)).toMatchObject({ sharpness: 'spitz', direction: 'links' });
  });

  it('rechter Winkel bleibt normal', () => {
    const { points, apexIndex } = path([[0, 20], [90, 20]]);
    expect(evaluateLongBaselineCorner(points, apexIndex)!.sharpness).toBe('normal');
  });

  it('Lücke zwischen den Bändern (Innenwinkel 62°) bleibt unaufgelöst', () => {
    const { points, apexIndex } = path([[0, 20], [118, 20]]);
    expect(evaluateLongBaselineCorner(points, apexIndex)!.sharpness).toBe('unresolved');
  });

  it('ohne Konsens der Schenkellängen kein „spitz": 8 m zeigt spitz, die längeren nicht', () => {
    // Der zweite Schenkel knickt nach 8 m um 16° zurück: kurze Basis ≈ 125° Drehung, lange deutlich weniger.
    const { points, apexIndex } = path([[0, 20], [125, 8], [109, 12]]);
    const hit = evaluateLongBaselineCorner(points, apexIndex)!;
    expect(hit).not.toBeNull();
    expect(hit.maxInteriorDeg).toBeGreaterThan(60);
    expect(hit.sharpness).toBe('unresolved');
  });

  it('Positionsunsicherheit klar grösser als die Schenkellänge → kein „spitz"', () => {
    const { points, apexIndex } = path([[0, 20], [135, 20]], 25);   // 25 m ÷ 8 m > 2,5
    const hit = evaluateLongBaselineCorner(points, apexIndex)!;
    expect(hit.accuracyToLegRatio).toBeGreaterThan(2.5);
    expect(hit.sharpness).toBe('unresolved');
  });

  it('fehlende Accuracy blockiert „spitz" nicht (Auflösbarkeit unbekannt, wie im Regelpfad)', () => {
    const { points, apexIndex } = path([[0, 20], [135, 20]], null);
    expect(evaluateLongBaselineCorner(points, apexIndex)!.sharpness).toBe('spitz');
  });

  it('fuseTurns speichert eine spitze Long-Baseline-Ecke als Spitzwinkel', () => {
    // Zitter-Segmente am Scheitel und entlang der Schenkel: Regelpfad und Split-Apex liefern nichts.
    const { points } = path([[0, 20], [135, 20]]);
    const jitter = points.map((p, i) => ({ ...p, lat: p.lat + ((i % 2 ? 0.45 : -0.45) / M_LAT), lng: p.lng + ((i % 3 === 0 ? 0.4 : -0.3) / M_LNG) }));
    const r = fuseTurns(jitter);
    const long = r.turns.filter(t => t.source === 'gps_long_baseline');
    expect(long).toHaveLength(1);
    expect(long[0]).toMatchObject({ sharpness: 'spitz', kind: 'spitz_rechts', direction: 'rechts' });
    expect(r.corners.find(c => c.apexIndex === long[0].apexIndex)?.kind).toBe('spitz_rechts');
  });
});
