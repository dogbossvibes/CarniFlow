import {
  detectAutoCorner, evaluateBestCorner, confidenceLevel,
  type AutoCornerPoint,
} from '@/features/tracking/utils/autoCornerDetection';
import { toCornerConfidence } from '@/features/tracking/utils/cornerConfidence';

// ──────────────────────────────────────────────────────────────────────────
// Confidence-LEVEL (high/medium/low), Komponenten-Mapping und der optionale
// Geschwindigkeits-Support. Baut auf denselben Geometrie-Helfern wie die übrigen
// Winkeltests auf. Zeitstempel sind optional: nur wenn `speedMps` gesetzt ist,
// bekommen die Punkte ein `t` (→ speedSupport wird berechnet).
// ──────────────────────────────────────────────────────────────────────────

const METERS_PER_DEGREE = 111_320;
function points(
  coords: readonly (readonly [number, number])[],
  accuracy: number | (number | null)[] = 5,
  speedMps?: number,
): AutoCornerPoint[] {
  let cumDist = 0;
  let t = 0;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      const seg = Math.hypot(x - px, y - py);
      cumDist += seg;
      if (speedMps) t += (seg / speedMps) * 1000;
    }
    const acc = Array.isArray(accuracy) ? (accuracy[index] ?? null) : accuracy;
    return {
      lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy: acc,
      ...(speedMps ? { t } : {}),
    };
  });
}

const RAD = Math.PI / 180;
function twoLeg(inHeadingDeg: number, outHeadingDeg: number, legM = 12, stepM = 2): (readonly [number, number])[] {
  const inR = inHeadingDeg * RAD, outR = outHeadingDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return coords;
}
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 12, stepM = 2) {
  const turn = 180 - interiorDeg;
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  return twoLeg(0, out, legM, stepM);
}
function best(pts: AutoCornerPoint[]) {
  return evaluateBestCorner(pts, -Infinity)?.candidate ?? null;
}

// ── confidenceLevel(): reine Schwellen-Funktion ────────────────────────────
describe('confidenceLevel — Grenzen high≥0.80, medium≥0.60, sonst low', () => {
  it('typische Werte', () => {
    expect(confidenceLevel(0.95)).toBe('high');
    expect(confidenceLevel(0.70)).toBe('medium');
    expect(confidenceLevel(0.30)).toBe('low');
  });
  it('exakte Grenzen sind inklusiv nach oben', () => {
    expect(confidenceLevel(0.80)).toBe('high');
    expect(confidenceLevel(0.60)).toBe('medium');
    expect(confidenceLevel(0.5999)).toBe('low');
    expect(confidenceLevel(0.7999)).toBe('medium');
  });
});

// ── HIGH: saubere Winkel, gute Accuracy, ausreichend lange Schenkel ─────────
describe('Confidence-Level — HIGH bei sauberen Winkeln', () => {
  it('sauberer 90° links → high', () => {
    const c = best(points(corner(90, 'links')));
    expect(c?.state).toBe('accept');
    expect(c?.level).toBe('high');
    expect(c!.confidence).toBeGreaterThanOrEqual(0.80);
  });
  it('sauberer 90° rechts → high', () => {
    const c = best(points(corner(90, 'rechts')));
    expect(c?.level).toBe('high');
  });
  it('sauberer Spitzwinkel links → high, spitz_links', () => {
    const c = best(points(corner(45, 'links')));
    expect(c?.kind).toBe('spitz_links');
    expect(c?.level).toBe('high');
  });
  it('sauberer Spitzwinkel rechts → high, spitz_rechts', () => {
    const c = best(points(corner(45, 'rechts')));
    expect(c?.kind).toBe('spitz_rechts');
    expect(c?.level).toBe('high');
  });
  it('detectAutoCorner liefert level + factors mit', () => {
    const r = detectAutoCorner(points(corner(90, 'rechts')), -Infinity);
    expect(r?.level).toBe('high');
    expect(r?.factors.angle).toBeGreaterThan(0.9);
  });
});

// ── MEDIUM: nahe Klassengrenze + gedämpfte Accuracy ────────────────────────
describe('Confidence-Level — MEDIUM nahe Klassengrenze / moderate Accuracy', () => {
  it('80°-Winkel mit moderater Accuracy (26 m) → accept, medium', () => {
    const c = best(points(corner(80, 'rechts'), 26));
    expect(c?.state).toBe('accept');
    expect(c?.level).toBe('medium');
    expect(c!.confidence).toBeGreaterThanOrEqual(0.60);
    expect(c!.confidence).toBeLessThan(0.80);
  });
  it('82° links mit schlechterer Accuracy (30 m) → medium', () => {
    const c = best(points(corner(82, 'links'), 30));
    expect(c?.state).toBe('accept');
    expect(c?.level).toBe('medium');
  });
});

// ── LOW: Ausreißer/Zickzack/schlechte Accuracy/Mikrobewegung ───────────────
describe('Confidence-Level — LOW / kein accept bei schwachen Kandidaten', () => {
  it('Zickzack auf Gerade → kein Winkel, bester Kandidat low', () => {
    const pts = points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]]);
    expect(detectAutoCorner(pts, -Infinity)).toBeNull();
    const c = best(pts);
    expect(c?.state).not.toBe('accept');
    expect(c?.level).toBe('low');
  });
  it('90° mit komplett schlechter GPS-Lage → kein accept, low', () => {
    const noisy = corner(90, 'rechts', 12, 2).map(([x, y], i) => [x + (i % 2 ? -2.4 : 2.6), y + (i % 3 ? 2.0 : -2.2)] as const);
    const c = best(points(noisy, 30));
    expect(c?.state).not.toBe('accept');
    expect(c?.level).toBe('low');
  });
  it('Mikrobewegung/Stop ohne echten Winkel → kein Winkel', () => {
    expect(detectAutoCorner(points([[0, 0], [0.1, 0.2], [-0.1, 0.1], [0.05, 0.05]]), -Infinity)).toBeNull();
  });
});

// ── Robustheit: langsames Gehen, Stop im Winkel, Einzel-Ausreißer, 2 Winkel ─
describe('Confidence-Level — Robustheit', () => {
  it('langsames Gehen (0.3 m/s) + echter Winkel → weiterhin accept, NICHT low', () => {
    const c = best(points(corner(90, 'rechts'), 5, 0.3));
    expect(c?.state).toBe('accept');
    expect(c?.level).not.toBe('low');
    // Bei echter (wenn auch langsamer) Fortbewegung ist speedSupport voll.
    expect(c!.factors.speedSupport).toBe(1);
  });

  it('Stop im Winkel (Mikro-Segmente am Scheitel) + stabile Schenkel → plausibel', () => {
    const withStop = [
      [0, -12], [0, -10], [0, -8], [0, -6], [0, -4], [0, -2], [0, 0],
      [0, 0], [0, 0], [0.05, -0.05],                                   // Stop/Jitter im Scheitel
      [-2, 0], [-4, 0], [-6, 0], [-8, 0], [-10, 0], [-12, 0],
    ] as const;
    const c = best(points(withStop, 5, 0.6));
    expect(c?.state).toBe('accept');
    expect(c?.kind).toBe('links');
    // Mikro-Segmente werden übersprungen (nicht als Stillstand bestraft) → speedSupport hoch.
    expect(c!.factors.speedSupport).toBeGreaterThanOrEqual(0.9);
  });

  it('einzelner GPS-Ausreißer zwischen guten Punkten → Confidence kollabiert nicht', () => {
    const withOutlier = [
      [0, -10], [0, -8], [0, -6], [2.8, -4.2], [0, -2], [0, 0],
      [2, 0], [4, 0], [6, 0], [8, 0], [10, 0],
    ] as const;
    const c = best(points(withOutlier));
    expect(c?.state).toBe('accept');
    expect(c?.kind).toBe('rechts');
    expect(c!.confidence).toBeGreaterThanOrEqual(0.62);
  });

  it('sehr langsames Kriechen (0.05 m/s) senkt nur speedSupport, nicht den accept', () => {
    // Geschwindigkeit ist NICHT im gewichteten Score → Erkennung bleibt; nur die
    // informelle Komponente/Reason markiert die geringe Bewegung.
    const c = best(points(corner(90, 'rechts'), 5, 0.05));
    expect(c?.state).toBe('accept');
    expect(c!.factors.speedSupport).toBe(0);
    expect(toCornerConfidence(c!).reasons).toContain('low_movement');
  });

  it('zwei echte Winkel kurz hintereinander → beide akzeptierbar mit Level', () => {
    const prefix: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) prefix.push([0, y]);
    for (let x = 2; x <= 12; x += 2) prefix.push([x, 0]);
    const c1 = detectAutoCorner(points(prefix), -Infinity);
    expect(c1?.kind).toBe('rechts');
    expect(c1?.level).toBeDefined();

    const full: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) full.push([0, y]);
    for (let x = 2; x <= 12; x += 2) full.push([x, 0]);
    for (let y = 2; y <= 12; y += 2) full.push([12, y]);
    const c2 = detectAutoCorner(points(full), 12);
    expect(c2?.kind).toBe('links');
    expect(c2?.level).toBeDefined();
  });
});

// ── Komponenten-Mapping (CornerConfidence) ─────────────────────────────────
describe('toCornerConfidence — Struktur & Mapping', () => {
  it('sauberer Winkel: score/level + alle Kern-Komponenten vorhanden', () => {
    const c = best(points(corner(90, 'rechts')))!;
    const cc = toCornerConfidence(c);
    expect(cc.score).toBe(c.confidence);
    expect(cc.level).toBe('high');
    expect(cc.components.turnStrength).toBe(c.factors.angle);
    expect(cc.components.gpsQuality).toBe(c.factors.accuracy);
    expect(cc.components.straightness).toBe(Math.min(c.factors.straightBefore, c.factors.straightAfter));
    expect(cc.components.legSupport).toBe(Math.min(c.factors.support, c.factors.legLength));
    expect(cc.components.stability).toBe(c.factors.bearing);
    // Ohne Zeitstempel: speedSupport fehlt (undefined) und keine reasons.
    expect(cc.components.speedSupport).toBeUndefined();
    expect(cc.reasons).toBeUndefined();
  });

  it('mit Zeitstempeln: speedSupport wird in components gespiegelt', () => {
    const c = best(points(corner(90, 'rechts'), 5, 0.8))!;
    const cc = toCornerConfidence(c);
    expect(cc.components.speedSupport).toBe(c.factors.speedSupport);
    expect(cc.components.speedSupport).toBe(1);
  });

  it('schwacher Kandidat: reasons enthalten aussagekräftige Gründe', () => {
    const noisy = corner(90, 'rechts', 12, 2).map(([x, y], i) => [x + (i % 2 ? -2.4 : 2.6), y + (i % 3 ? 2.0 : -2.2)] as const);
    const cc = toCornerConfidence(best(points(noisy, 30))!);
    expect(cc.level).toBe('low');
    expect(Array.isArray(cc.reasons)).toBe(true);
    expect(cc.reasons!.length).toBeGreaterThan(0);
  });
});
