import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';
import { createCornerConfirmer, feedCornerBuffer } from '@/features/tracking/utils/cornerConfirmation';

// ──────────────────────────────────────────────────────────────────────────
// HOTFIX-Guard: ein geometrisch AKZEPTIERTER Winkel wird SOFORT persistiert; die
// Adaptive Confirmation läuft nur als Shadow (kein Persist) und darf einen bereits
// akzeptierten Winkel NICHT mehr verlieren. Dieser Test spiegelt exakt die
// Recorder-Policy aus useTrackRecorder.detectCorner (Sofort-Persist + Shadow).
// ──────────────────────────────────────────────────────────────────────────

const MPD = 111_320;
const CORNER_GAP_M = 4;

function points(coords: readonly (readonly [number, number])[], accuracy: number | (number | null)[] = 5): AutoCornerPoint[] {
  let cum = 0;
  return coords.map(([x, y], i) => {
    if (i > 0) { const [px, py] = coords[i - 1]; cum += Math.hypot(x - px, y - py); }
    const acc = Array.isArray(accuracy) ? (accuracy[i] ?? null) : accuracy;
    return { lat: y / MPD, lng: x / MPD, cumDist: cum, accuracy: acc, t: 1000 + i * 1000 };
  });
}
const RAD = Math.PI / 180;
function twoLeg(inH: number, outH: number, legM = 14, stepM = 2): (readonly [number, number])[] {
  const inR = inH * RAD, outR = outH * RAD;
  const c: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) c.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) c.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return c;
}
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 14, stepM = 2) {
  const turn = 180 - interiorDeg;
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  return twoLeg(0, out, legM, stepM);
}

// Spiegelt useTrackRecorder.detectCorner: Shadow-Confirmation (kein Persist) +
// Sofort-Persist bei detectAutoCorner-Accept, Gap via lastCornerAt.
function simulate(pts: AutoCornerPoint[]) {
  const shadow = createCornerConfirmer();
  let lastCornerAt = -Infinity;
  const markers: { kind: string; cum: number; level: string }[] = [];
  let shadowConfirmed = 0;
  for (let k = 3; k <= pts.length; k++) {
    const buf = pts.slice(0, k);
    const now = (pts[k - 1].t as number) ?? k * 1000;
    for (const ev of feedCornerBuffer(shadow, buf, lastCornerAt, now)) if (ev.type === 'confirmed') shadowConfirmed++;
    const c = detectAutoCorner(buf, lastCornerAt);
    if (c) { markers.push({ kind: c.kind, cum: c.apex.cumDist, level: c.level }); lastCornerAt = c.apex.cumDist; }
  }
  return { markers, shadowConfirmed };
}

// ── Sofort-Persist bei Accept ──────────────────────────────────────────────
describe('Hotfix — geometrischer Accept persistiert sofort', () => {
  const cases: [string, number, 'rechts' | 'links', string][] = [
    ['90 links', 90, 'links', 'links'],
    ['90 rechts', 90, 'rechts', 'rechts'],
    ['spitz links', 45, 'links', 'spitz_links'],
    ['spitz rechts', 45, 'rechts', 'spitz_rechts'],
  ];
  for (const [name, deg, dir, kind] of cases) {
    it(`${name} → genau 1 Marker (${kind})`, () => {
      const { markers } = simulate(points(corner(deg, dir)));
      expect(markers.length).toBe(1);
      expect(markers[0].kind).toBe(kind);
    });
  }
});

// ── MEDIUM wird trotzdem persistiert (Kern der Regression) ─────────────────
describe('Hotfix — MEDIUM/accept persistiert, Confirmation blockiert nicht', () => {
  it('80° @26 m Accuracy (medium) → persistiert (≥1), auch wenn Shadow nicht confirmt', () => {
    const { markers, shadowConfirmed } = simulate(points(corner(80, 'rechts'), 26));
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers.length).toBeGreaterThanOrEqual(shadowConfirmed);   // immediate verliert nie ggü. Confirmation
  });

  it('sauberer Winkel, den die Confirmation NICHT bestätigt → Sofort-Persist rettet ihn', () => {
    // legM klein: Auslauf zu kurz für 2 Samples/8 m → Shadow bleibt created, confirmed=0.
    const { markers, shadowConfirmed } = simulate(points(corner(90, 'rechts', 10, 2)));
    expect(markers.length).toBe(1);                 // Sofort-Persist
    expect(markers.length).toBeGreaterThanOrEqual(shadowConfirmed);
  });
});

// ── Kein Doppelmarker ──────────────────────────────────────────────────────
describe('Hotfix — kein Doppelmarker', () => {
  it('ein Winkel → exakt 1 Marker (kein zweiter durch späteres confirmed)', () => {
    const { markers } = simulate(points(corner(90, 'rechts')));
    expect(markers.length).toBe(1);
  });
  it('zwei echte Winkel → 2 Marker, ≥ CORNER_GAP auseinander', () => {
    const two: (readonly [number, number])[] = [];
    for (let y = -14; y <= 0; y += 2) two.push([0, y]);
    for (let x = 2; x <= 12; x += 2) two.push([x, 0]);
    for (let y = 2; y <= 14; y += 2) two.push([12, y]);
    const { markers } = simulate(points(two));
    expect(markers.map(m => m.kind)).toEqual(['rechts', 'links']);
    expect(Math.abs(markers[1].cum - markers[0].cum)).toBeGreaterThanOrEqual(CORNER_GAP_M);
  });
});

// ── False-Positive-Schutz bleibt aktiv (nur echte Accepts persistieren) ────
describe('Hotfix — reject/pending persistiert NICHT', () => {
  const S = (amp: number, period: number, n: number) =>
    Array.from({ length: n }, (_, i) => { const y = i * 2; return [amp * Math.sin(Math.PI * y / period), y] as const; });
  it('GPS-Jitter auf Gerade → 0 Marker', () => {
    expect(simulate(points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]])).markers).toHaveLength(0);
  });
  it('Zickzack-Noise → 0 Marker', () => {
    expect(simulate(points(S(3, 8, 15))).markers).toHaveLength(0);
  });
  it('Stop / Mikrobewegung → 0 Marker', () => {
    expect(simulate(points([[0, 0], [0.1, 0.2], [-0.1, 0.1], [0.05, 0.05], [0, 0.1]])).markers).toHaveLength(0);
  });
  it('leichte Kurve (Viertelkreis) → 0 Marker', () => {
    const q = Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * 90 * RAD; return [14 * Math.cos(a) - 14, 14 * Math.sin(a)] as const; });
    expect(simulate(points(q)).markers).toHaveLength(0);
  });
});

// ── Realistischer EMA/MIN_STEP-Track (wie Production) ──────────────────────
describe('Hotfix — realistischer EMA/MIN_STEP-Track', () => {
  const EMA_ALPHA = 0.4, MIN_STEP_M = 2.0;
  let seed = 20260821;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const noise = (m: number) => (rnd() - 0.5) * 2 * m;

  // Rohfixe ~1 Hz mit ±amp lateralem Rauschen, optional Stop am Scheitel; EMA + 2 m-Gate.
  function realistic(interiorDeg: number, dir: 'rechts' | 'links', legM = 16, amp = 1.5, stopAtApex = false): AutoCornerPoint[] {
    const turn = 180 - interiorDeg;
    const out = (dir === 'rechts' ? turn : (360 - turn) % 360) * RAD;
    const raw: { x: number; y: number; t: number; acc: number }[] = [];
    let t = 1000;
    for (let d = legM; d >= 0; d -= 1) { raw.push({ x: noise(amp), y: -d + noise(amp), t, acc: 4 + Math.abs(noise(3)) }); t += 1000 + Math.round(noise(300)); }
    if (stopAtApex) for (let s = 0; s < 4; s++) { raw.push({ x: noise(0.3), y: noise(0.3), t, acc: 5 }); t += 1000; }   // ~4 s Stop
    for (let e = 1; e <= legM; e += 1) { raw.push({ x: Math.sin(out) * e + noise(amp), y: Math.cos(out) * e + noise(amp), t, acc: 4 + Math.abs(noise(3)) }); t += 1000 + Math.round(noise(300)); }
    let ema: { x: number; y: number } | null = null, last: { x: number; y: number } | null = null, cum = 0;
    const pts: AutoCornerPoint[] = [];
    for (const f of raw) {
      ema = ema ? { x: ema.x + (f.x - ema.x) * EMA_ALPHA, y: ema.y + (f.y - ema.y) * EMA_ALPHA } : { x: f.x, y: f.y };
      const step = last ? Math.hypot(ema.x - last.x, ema.y - last.y) : 0;
      if (last && step < MIN_STEP_M) continue;
      cum += step; last = { x: ema.x, y: ema.y };
      pts.push({ lat: ema.y / MPD, lng: ema.x / MPD, cumDist: cum, accuracy: f.acc, t: f.t });
    }
    return pts;
  }

  it('90° mit leichtem Rauschen: JEDER geometrische Accept wird persistiert (≥ Shadow)', () => {
    for (const [deg, dir] of [[90, 'rechts'], [90, 'links'], [45, 'rechts']] as const) {
      const { markers, shadowConfirmed } = simulate(realistic(deg, dir, 16, 1.2, false));
      // Hauptgarantie des Hotfix: Sofort-Persist verliert nie gegenüber der Confirmation.
      expect(markers.length).toBeGreaterThanOrEqual(shadowConfirmed);
    }
  });

  it('Stop am Winkel: Sofort-Persist ≥ Confirmation (kein Verlust durch Stop-Phase)', () => {
    const { markers, shadowConfirmed } = simulate(realistic(90, 'rechts', 16, 1.0, true));
    expect(markers.length).toBeGreaterThanOrEqual(shadowConfirmed);
  });
});
