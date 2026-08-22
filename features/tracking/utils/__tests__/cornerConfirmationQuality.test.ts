import {
  createCornerConfirmer, feedCornerBuffer,
  type CornerObservation, type ConfirmEvent, type ConfirmedCorner, type ConfirmQuality,
} from '@/features/tracking/utils/cornerConfirmation';
import type { AutoCornerPoint, CornerFactors } from '@/features/tracking/utils/autoCornerDetection';

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 — GPS-Quality-Kopplung der adaptiven Corner Confirmation.
// Verifiziert die kontrollierte Integration: degraded/poor verlangt MEHR Evidenz,
// verwirft aber NIE allein wegen Qualität; Recovery rehabilitiert Kandidaten.
// ──────────────────────────────────────────────────────────────────────────

const GOOD_FACTORS: CornerFactors = {
  angle: 1, straightBefore: 1, straightAfter: 1, support: 0.8, accuracy: 1, bearing: 1, legLength: 1,
};
function obs(over: Partial<CornerObservation> & { apexCumDist: number; latestCumDist: number }): CornerObservation {
  return {
    apexLat: 0, apexLng: 0, state: 'accept', confidence: 0.70, level: 'medium',
    kind: 'rechts', angleDeg: 90, accuracyM: 5, tMs: 1000, factors: GOOD_FACTORS, ...over,
  };
}
const types = (evs: ConfirmEvent[]) => evs.map(e => e.type);

// ── HIGH je nach Qualität ──────────────────────────────────────────────────
describe('Quality × HIGH', () => {
  it('high + good → sofort confirmed', () => {
    const c = createCornerConfirmer();
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'high', confidence: 0.95 }), 'good');
    expect(types(e)).toEqual(['confirmed']);
    expect(e[0].corner?.reason).toBe('high_immediate');
  });

  it('high + degraded → keine Sofort-Persistenz, aber nach 1 Folgepunkt confirmed', () => {
    const c = createCornerConfirmer();
    const e0 = c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'high' }), 'degraded');
    expect(types(e0)).toEqual(['created']);
    const e1 = c.observe(obs({ apexCumDist: 10, latestCumDist: 16, level: 'high' }), 'degraded');
    expect(types(e1)).toEqual(['confirmed']);
  });

  it('high + poor → braucht volle konservative Evidenz (4 Samples)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'high' }), 'poor');       // created
    c.observe(obs({ apexCumDist: 10, latestCumDist: 16, level: 'high' }), 'poor');       // fs1
    c.observe(obs({ apexCumDist: 10, latestCumDist: 18, level: 'high' }), 'poor');       // fs2
    const e3 = c.observe(obs({ apexCumDist: 10, latestCumDist: 20, level: 'high' }), 'poor'); // fs3
    expect(types(e3)).not.toContain('confirmed');
    const e4 = c.observe(obs({ apexCumDist: 10, latestCumDist: 22, level: 'high' }), 'poor'); // fs4
    expect(types(e4)).toEqual(['confirmed']);
  });
});

// ── MEDIUM je nach Qualität ────────────────────────────────────────────────
describe('Quality × MEDIUM', () => {
  it('medium + good → confirm bei 2 Samples (unverändert)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14 }), 'good');
    c.observe(obs({ apexCumDist: 10, latestCumDist: 16 }), 'good');
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 18 }), 'good');
    expect(types(e)).toEqual(['confirmed']);
  });

  it('medium + degraded → 2 Samples reichen NICHT, 3 schon', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14 }), 'degraded');                 // created
    c.observe(obs({ apexCumDist: 10, latestCumDist: 16 }), 'degraded');                 // fs1
    const e2 = c.observe(obs({ apexCumDist: 10, latestCumDist: 18 }), 'degraded');      // fs2 → noch nicht
    expect(types(e2)).toEqual(['evidence']);
    const e3 = c.observe(obs({ apexCumDist: 10, latestCumDist: 20 }), 'degraded');      // fs3 → confirm
    expect(types(e3)).toEqual(['confirmed']);
    expect(e3[0].corner?.reason).toContain('quality=degraded');
  });

  it('medium + poor → deutlich konservativer (4 Samples)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14 }), 'poor');
    for (let d = 16; d <= 20; d += 2) {
      const e = c.observe(obs({ apexCumDist: 10, latestCumDist: d }), 'poor');           // fs1..fs3
      expect(types(e)).not.toContain('confirmed');
    }
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 22 }), 'poor');            // fs4
    expect(types(e)).toEqual(['confirmed']);
  });
});

// ── Schlechte Phase am Scheitel + Recovery ─────────────────────────────────
describe('Quality × Robustheit', () => {
  it('schlechte GPS-Phase (Misses) am Scheitel wird toleriert, danach confirmed', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14 }), 'good');                     // created medium
    // 2 transiente Misses unter degraded (maxMisses 2+1=3) → nicht verworfen
    const m1 = c.observe(obs({ apexCumDist: 10, latestCumDist: 15, state: 'pending', factors: { ...GOOD_FACTORS, straightAfter: 0.6 } }), 'degraded');
    const m2 = c.observe(obs({ apexCumDist: 10, latestCumDist: 15, state: 'pending', factors: { ...GOOD_FACTORS, straightAfter: 0.6 } }), 'degraded');
    expect(types(m1)).toEqual(['updated']);
    expect(types(m2)).toEqual(['updated']);
    // Recovery: gute Fixes → Evidenz sammelt, confirmed
    c.observe(obs({ apexCumDist: 10, latestCumDist: 17 }), 'good');
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 19 }), 'good');
    expect(types(e)).toEqual(['confirmed']);
  });

  it('GPS Recovery rehabilitiert einen Pending-Candidate (poor → good → confirm)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14 }), 'poor');                     // created (braucht 4)
    c.observe(obs({ apexCumDist: 10, latestCumDist: 16 }), 'poor');                     // fs1
    const still = c.observe(obs({ apexCumDist: 10, latestCumDist: 18 }), 'poor');       // fs2 <4
    expect(types(still)).toEqual(['evidence']);
    // Qualität erholt sich → Anforderung sinkt auf 2 → sofort confirm
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 20 }), 'good');           // fs3, good req=2
    expect(types(e)).toEqual(['confirmed']);
  });
});

// ── E2E über feedCornerBuffer mit Qualität ─────────────────────────────────
const MPD = 111_320;
function points(coords: readonly (readonly [number, number])[], accuracy = 5): AutoCornerPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], i) => {
    if (i > 0) { const [px, py] = coords[i - 1]; cumDist += Math.hypot(x - px, y - py); }
    return { lat: y / MPD, lng: x / MPD, cumDist, accuracy, t: 1000 + i * 1000 };
  });
}
const RAD = Math.PI / 180;
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 12, stepM = 2) {
  const turn = 180 - interiorDeg;
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  const inR = 0, outR = out * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return coords;
}
function drive(pts: AutoCornerPoint[], quality?: ConfirmQuality) {
  const confirmer = createCornerConfirmer();
  let lastCornerAt = -Infinity;
  const confirmed: ConfirmedCorner[] = [];
  for (let k = 3; k <= pts.length; k++) {
    for (const e of feedCornerBuffer(confirmer, pts.slice(0, k), lastCornerAt, pts[k - 1].t ?? k * 1000, quality)) {
      if (e.type === 'confirmed' && e.corner) { confirmed.push(e.corner); lastCornerAt = e.corner.apexCumDist; }
    }
  }
  for (const e of confirmer.flush(9_999_999)) if (e.type === 'confirmed' && e.corner) confirmed.push(e.corner);
  return confirmed;
}

describe('Quality × E2E', () => {
  it('sauberer 90° unter poor → wird (später) trotzdem confirmed, kein Verlust', () => {
    expect(drive(points(corner(90, 'rechts')), 'poor').map(c => c.kind)).toEqual(['rechts']);
  });
  it('Zickzack unter poor → kein Fantasiewinkel', () => {
    const zig = points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]]);
    expect(drive(zig, 'poor')).toHaveLength(0);
  });
  it('zwei Winkel unter degraded → beide confirmed, Identity/Gap intakt', () => {
    const two: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) two.push([0, y]);
    for (let x = 2; x <= 10; x += 2) two.push([x, 0]);
    for (let y = 2; y <= 12; y += 2) two.push([10, y]);
    expect(drive(points(two), 'degraded').map(c => c.kind)).toEqual(['rechts', 'links']);
  });
});
