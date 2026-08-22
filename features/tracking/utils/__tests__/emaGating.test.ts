import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';

// ──────────────────────────────────────────────────────────────────────────
// GPS-Geometrie-Fix: die Track-EMA darf nur noch von Fixes bewegt werden, die die
// Accuracy-/Speed-Gates bestanden haben. Dieser Test SPIEGELT die Reihenfolge aus
// useTrackRecorder.onFix (Track-EMA NACH den Gates) und vergleicht sie gegen die
// alte Reihenfolge (EMA VOR den Gates), um den Kontaminations-Effekt zu belegen.
// Konstanten identisch zu Production.
// ──────────────────────────────────────────────────────────────────────────
const EMA_ALPHA = 0.4, MIN_STEP_M = 2.0, MAX_ACCURACY_M = 45, MAX_SPEED_MPS = 12;
const MPD = 111_320;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const blend = (e: { x: number; y: number }, f: { x: number; y: number }) => ({ x: e.x + (f.x - e.x) * EMA_ALPHA, y: e.y + (f.y - e.y) * EMA_ALPHA });

interface RawFix { x: number; y: number; t: number; acc: number }

// Mirror von onFix: order 'new' = EMA nach Gates (Fix), 'old' = EMA vor Gates (Bug).
function simulate(raws: RawFix[], order: 'new' | 'old') {
  let ema: { x: number; y: number } | null = null, lastAcceptedRaw: RawFix | null = null, rejected = 0;
  const accepted: { x: number; y: number; cum: number }[] = [];
  for (const f of raws) {
    if (order === 'old') ema = ema ? blend(ema, f) : { x: f.x, y: f.y };   // BUG: vor Gates
    if (f.acc == null || f.acc > MAX_ACCURACY_M) { rejected++; continue; } // Accuracy-Gate
    if (lastAcceptedRaw) {                                                  // Speed/Jump-Gate
      const dt = (f.t - lastAcceptedRaw.t) / 1000;
      if (dt > 0 && dist(lastAcceptedRaw, f) / dt > MAX_SPEED_MPS) { rejected++; continue; }
    }
    lastAcceptedRaw = f;
    if (order === 'new') ema = ema ? blend(ema, f) : { x: f.x, y: f.y };   // FIX: nach Gates
    const last = accepted[accepted.length - 1];
    const step = last ? dist(last, ema!) : 0;
    if (last && step < MIN_STEP_M) continue;                               // MIN_STEP-Gate (unverändert)
    accepted.push({ x: ema!.x, y: ema!.y, cum: (last?.cum ?? 0) + step });
  }
  return { accepted, rejected, distance: accepted.length ? accepted[accepted.length - 1].cum : 0 };
}
const toCornerPts = (acc: { x: number; y: number; cum: number }[]): AutoCornerPoint[] =>
  acc.map((p, i) => ({ lat: p.y / MPD, lng: p.x / MPD, cumDist: p.cum, accuracy: 5, t: 1000 + i * 1000 }));

// Track-Generatoren (Meter, 1 Hz walking).
function straight(len = 40): RawFix[] { return Array.from({ length: len + 1 }, (_, i) => ({ x: 0, y: i, t: 1000 + i * 1000, acc: 4 })); }
function corner(dir: 'links' | 'rechts', spitz = false, leg = 24): RawFix[] {
  const out: RawFix[] = []; let t = 1000, k = 0;
  for (let y = 0; y <= leg; y++) out.push({ x: 0, y, t: t + k++ * 1000, acc: 4 });
  // Auslauf: rechts=+x, links=-x; spitz = zurücklaufender scharfer Winkel
  const sx = dir === 'rechts' ? 1 : -1;
  for (let d = 1; d <= leg; d++) {
    const x = spitz ? sx * d * Math.SQRT1_2 : sx * d;
    const y = spitz ? leg - d * Math.SQRT1_2 : leg;
    out.push({ x, y, t: 1000 + k++ * 1000, acc: 4 });
  }
  return out;
}
// ZUSÄTZLICHEN schlechten Fix (Spike) vor idx einfügen — ein realer GPS-Spike ist ein
// extra Reading zwischen guten Fixes, das kein gutes Reading ersetzt.
function insertSpike(raws: RawFix[], idx: number, kind: 'acc' | 'jump'): RawFix[] {
  const c = raws.map(r => ({ ...r }));
  const prev = c[idx - 1], cur = c[idx];
  const tMid = Math.floor((prev.t + cur.t) / 2);
  const spike: RawFix = kind === 'acc'
    ? { x: prev.x + 20, y: prev.y, t: tMid, acc: 60 }                              // acc>45 → Accuracy-Reject
    : { x: prev.x + 15, y: prev.y, t: tMid, acc: 5 };                              // 15 m/0.5 s = 30 m/s > 12 → Jump-Reject
  c.splice(idx, 0, spike);
  return c;
}

describe('EMA-Gating — verworfene Fixes kontaminieren die Track-EMA NICHT (Fix)', () => {
  it('Accuracy-Reject: new-order identisch zur Baseline; old-order kontaminiert', () => {
    const base = simulate(straight(40), 'new');
    const spiked = simulate(insertSpike(straight(40), 20, 'acc'), 'new');
    const spikedOld = simulate(insertSpike(straight(40), 20, 'acc'), 'old');
    expect(spiked.rejected).toBe(1);                                   // Spike verworfen
    expect(spiked.accepted).toEqual(base.accepted);                   // KEINE Kontamination (new)
    expect(spiked.distance).toBeCloseTo(base.distance, 6);            // Distanz kein Zusatz
    expect(spikedOld.accepted).not.toEqual(base.accepted);           // alte Reihenfolge WÄRE kontaminiert
  });

  it('Jump-Reject: new-order identisch zur Baseline; old-order kontaminiert', () => {
    const base = simulate(straight(40), 'new');
    const spiked = simulate(insertSpike(straight(40), 20, 'jump'), 'new');
    const spikedOld = simulate(insertSpike(straight(40), 20, 'jump'), 'old');
    expect(spiked.rejected).toBe(1);
    expect(spiked.accepted).toEqual(base.accepted);
    expect(spiked.distance).toBeCloseTo(base.distance, 6);
    expect(spikedOld.accepted).not.toEqual(base.accepted);
  });

  it('rejected Spike landet nicht im Corner-Buffer (Punktzahl unverändert)', () => {
    const base = simulate(straight(40), 'new');
    const spiked = simulate(insertSpike(straight(40), 20, 'jump'), 'new');
    expect(spiked.accepted.length).toBe(base.accepted.length);
  });
});

describe('EMA-Gating — Winkel-Recall bleibt, Spike am Scheitel verschiebt nichts', () => {
  for (const [name, dir, spitz] of [['90° rechts', 'rechts', false], ['90° links', 'links', false], ['Spitz rechts', 'rechts', true]] as const) {
    it(`${name}: erkannt, Spike am Scheitel ändert Apex-cumDist nicht`, () => {
      const apexIdx = 24;   // Scheitel-Fix
      const base = simulate(corner(dir, spitz), 'new');
      const spiked = simulate(insertSpike(corner(dir, spitz), apexIdx, 'jump'), 'new');
      const cBase = detectAutoCorner(toCornerPts(base.accepted), -Infinity);
      const cSpk = detectAutoCorner(toCornerPts(spiked.accepted), -Infinity);
      expect(cBase?.kind).toBeTruthy();                                // Baseline erkennt Winkel
      expect(cSpk?.kind).toBe(cBase?.kind);                            // gleiche Klasse trotz Spike
      if (cBase && cSpk) expect(Math.abs(cSpk.apex.cumDist - cBase.apex.cumDist)).toBeLessThan(1.0);  // Scheitel ~unverschoben
      expect(spiked.rejected).toBe(1);
    });
  }
});

describe('EMA-Gating — reale Kreuzung bleibt erhalten (keine Loop-Removal)', () => {
  it('N→E→S→W kreuzt sich selbst → Self-Intersection erhalten', () => {
    const raw: RawFix[] = []; let k = 0; const push = (x: number, y: number) => raw.push({ x, y, t: 1000 + k++ * 1000, acc: 4 });
    for (let y = 0; y <= 20; y++) push(0, y);        // N
    for (let x = 1; x <= 20; x++) push(x, 20);       // E
    for (let y = 19; y >= 5; y--) push(20, y);       // S bis y=5
    for (let x = 19; x >= -5; x--) push(x, 5);       // W über x=0 (kreuzt N-Schenkel bei (0,5))
    const acc = simulate(raw, 'new').accepted;
    const isect = (p1: any, p2: any, p3: any, p4: any) => { const d = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y); if (d === 0) return false; const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d, ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / d; return ua > 0 && ua < 1 && ub > 0 && ub < 1; };
    let crosses = 0;
    for (let i = 0; i < acc.length - 1; i++) for (let j = i + 2; j < acc.length - 1; j++) if (isect(acc[i], acc[i + 1], acc[j], acc[j + 1])) crosses++;
    expect(crosses).toBeGreaterThan(0);
  });
});
