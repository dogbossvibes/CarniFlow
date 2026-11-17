// T-211: nachträgliche Schärfe-Prüfung eines gemeldeten Winkels — reine Geometrie.
import { refineCornerSharpness, sharpnessRefinementDue, SHARPNESS_REFINE_AFTER_M } from '../sharpnessRefinement';
import type { ShortLegPoint } from '../shortLegCornerDetection';

const LAT0 = 47.3, M_LAT = 111320, M_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
function path(sections: readonly (readonly [number, number])[]): ShortLegPoint[] {
  const points: ShortLegPoint[] = [];
  let x = 0, y = 0, cum = 0;
  const push = () => points.push({ lat: LAT0 + y / M_LAT, lng: 8.5 + x / M_LNG, cumDist: cum, accuracy: 5, t: 1_800_000_000_000 + points.length * 1000 });
  push();
  for (const [courseDeg, lengthM] of sections) {
    const r = (courseDeg * Math.PI) / 180;
    for (let i = 0; i < lengthM; i++) { x += Math.sin(r); y += Math.cos(r); cum += 1; push(); }
  }
  return points;
}

describe('Nachträgliche Schärfe-Prüfung (T-211)', () => {
  it('wird erst fällig, wenn genug Weg hinter dem Winkel liegt', () => {
    const points = path([[0, 20], [135, 20]]);
    expect(sharpnessRefinementDue(points.slice(0, 20 + SHARPNESS_REFINE_AFTER_M), 20)).toBe(false);
    expect(sharpnessRefinementDue(points.slice(0, 21 + SHARPNESS_REFINE_AFTER_M), 20)).toBe(true);
    expect(sharpnessRefinementDue([], 20)).toBe(false);
  });

  it('Spitzwinkel 45°: spitz — auch wenn der Scheitel 2 m daneben gemeldet wurde', () => {
    const points = path([[0, 20], [135, 20]]);
    for (const atM of [18, 20, 22]) expect(refineCornerSharpness(points, atM, 'rechts').spitz).toBe(true);
  });

  it('rechter Winkel bleibt normal — auch mit verschobenem Scheitel', () => {
    const points = path([[0, 20], [90, 20]]);
    for (const atM of [18, 19, 20, 21, 22]) expect(refineCornerSharpness(points, atM, 'rechts').spitz).toBe(false);
  });

  it('Innenwinkel 75° und 62° bleiben normal', () => {
    expect(refineCornerSharpness(path([[0, 20], [105, 20]]), 20, 'rechts').spitz).toBe(false);
    expect(refineCornerSharpness(path([[0, 20], [118, 20]]), 20, 'rechts').spitz).toBe(false);
  });

  it('widerspricht die Richtung, wird nicht hochgestuft', () => {
    expect(refineCornerSharpness(path([[0, 20], [135, 20]]), 20, 'links').spitz).toBe(false);
  });

  it('zwei rechte Winkel kurz hintereinander (U-Form, 6–10 m Basis) werden nie spitz', () => {
    for (const base of [6, 7, 8, 9, 10]) {
      const points = path([[0, 20], [90, base], [180, 20]]);
      for (const shift of [-2, 0, 2]) {
        expect(refineCornerSharpness(points, 20 + shift, 'rechts').spitz).toBe(false);
        expect(refineCornerSharpness(points, 20 + base + shift, 'rechts').spitz).toBe(false);
      }
    }
  });

  it('gleichmässiger Bogen (180° über 30 m) wird nie spitz', () => {
    const arc: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 6, 1]);
    const points = path([[0, 20], ...arc, [180, 20]]);
    for (let atM = 20; atM <= 50; atM += 3) expect(refineCornerSharpness(points, atM, 'rechts').spitz).toBe(false);
  });

  it('ausserhalb des Suchradius wird nichts gefunden', () => {
    const r = refineCornerSharpness(path([[0, 30], [135, 30]]), 20, 'rechts');   // Scheitel real bei 30 m
    expect(r.spitz).toBe(false);
  });
});
