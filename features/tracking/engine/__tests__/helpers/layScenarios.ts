// Deterministische Lay-Szenarien (Fix-Folgen) für Processor-/Paritätstests.
// Die Golden-Werte in layProcessingSession.test.ts wurden mit genau diesen
// Folgen gegen den ORIGINALEN useTrackRecorder (b6bc114) ermittelt.
import { makeRng, fieldRouteCoords, withDrift } from '../../../utils/__tests__/helpers/goldenRoute';

// ── Szenarien ────────────────────────────────────────────────────────────────
export type Step =
  | { k: 'fix'; t: number; x: number; y: number; acc: number | null; speed?: number; ageMs?: number }
  | { k: 'motion'; t: number; headingDelta: number; stepDelta: number }
  | { k: 'pause'; on: boolean } | { k: 'marker'; type: 'gegenstand' | 'winkel'; angleKind?: string };
export const LAT0 = 47.3, LNG0 = 8.5, M_LAT = 111320, M_LNG = 111320 * Math.cos(LAT0 * Math.PI / 180);
export const T0 = 2_000_000;

function densify(vertices: [number, number][], spacing: number): [number, number][] {
  const out: [number, number][] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const [ax, ay] = vertices[i - 1], [bx, by] = vertices[i];
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / spacing));
    for (let j = 1; j <= n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n]);
  }
  return out;
}
function walk(coords: [number, number][], seed: number, opts: { dtMs?: number; accFn?: (i: number, x: number, y: number) => number | null; noise?: number; startT?: number } = {}): Step[] {
  const rng = makeRng(seed);
  const dt = opts.dtMs ?? 1000, t0 = opts.startT ?? T0 + 6000;
  // 5 ruhige Anker-Fixes am Start (Start-Lock), dann Bewegung.
  const pre: Step[] = [1, 2, 3, 4, 5].map(i => ({ k: 'fix', t: T0 + i * 1000, x: coords[0][0] + (rng() - 0.5) * 0.4, y: coords[0][1] + (rng() - 0.5) * 0.4, acc: 5 }));
  return [...pre, ...coords.map(([x, y], i) => ({
    k: 'fix' as const, t: t0 + i * dt,
    x: x + (rng() - 0.5) * (opts.noise ?? 0.6), y: y + (rng() - 0.5) * (opts.noise ?? 0.6),
    acc: opts.accFn ? opts.accFn(i, x, y) : 5 + rng() * 4,
  }))];
}
const right90 = densify([[0, 0], [0, 20], [20, 20]], 1);
const left90 = densify([[0, 0], [0, 20], [-20, 20]], 1);
const acuteR = densify([[0, 0], [0, 20], [14, 6]], 1);
const acuteL = densify([[0, 0], [0, 20], [-14, 6]], 1);
const straight = densify([[0, 0], [0, 60]], 1);

export interface Scenario { name: string; steps: Step[]; engine?: 'current' | 'build40'; qa?: boolean; autoDetect?: boolean }
export const scenarios: Scenario[] = [];
for (const qa of [false, true]) for (const engine of ['current', 'build40'] as const) {
  const sfx = `${engine}${qa ? '+qa' : ''}`;
  scenarios.push(
    { name: `straight60 ${sfx}`, steps: walk(straight, 1), engine, qa },
    { name: `right90 ${sfx}`, steps: walk(right90, 2), engine, qa },
    { name: `left90 ${sfx}`, steps: walk(left90, 3), engine, qa },
    { name: `acuteRight ${sfx}`, steps: walk(acuteR, 4), engine, qa },
    { name: `acuteLeft ${sfx}`, steps: walk(acuteL, 5), engine, qa },
    { name: `fieldRoute0.5 drift2 ${sfx}`, steps: walk(withDrift(fieldRouteCoords(0.5), 2, 7), 6, { noise: 0.3 }), engine, qa },
    { name: `fieldRoute1.0 ${sfx}`, steps: walk(fieldRouteCoords(1.0), 8, { noise: 0.2 }), engine, qa },
  );
}
// Jitter vor der Ecke / schlechte Accuracy an der Ecke
scenarios.push({ name: 'jitterBeforeCorner', steps: walk(right90, 11, { noise: 0.6 }).map((s, i, a) => (s.k === 'fix' && i > 15 && i < 25) ? { ...s, x: s.x + Math.sin(i * 1.7) * 1.5, y: s.y + Math.cos(i * 2.3) * 1.5 } : s) });
scenarios.push({ name: 'badAccuracyAtCorner', steps: walk(right90, 12, { accFn: (_i, x, y) => (Math.hypot(x - 0, y - 20) < 3.5 ? 40 + ((x + y) % 25) : 6) }) });
// Ablehnungs-Mix: Ausreisser, null/grobe Accuracy, kleine Schritte
scenarios.push({ name: 'rejectMix', steps: (() => {
  const s = walk(densify([[0, 0], [0, 30]], 1), 13);
  s.splice(15, 0, { k: 'fix', t: (s[14] as any).t + 300, x: 40, y: 10, acc: 6 });          // 40-m-Sprung
  s.splice(20, 0, { k: 'fix', t: (s[19] as any).t + 200, x: 0, y: 12, acc: null });       // keine Accuracy
  s.splice(22, 0, { k: 'fix', t: (s[21] as any).t + 200, x: 0, y: 13, acc: 80 });         // zu grob
  const last = s[s.length - 1] as any;
  for (let i = 1; i <= 12; i++) s.push({ k: 'fix', t: last.t + i * 1000, x: 0, y: 30 + i * 0.3, acc: 5 });   // kleine Schritte
  return s;
})() });
// Start-Lock-Varianten: stale, wiederholte Zeitstempel, kein Bewegungsnachweis → Fallback 12 s
scenarios.push({ name: 'startLockStaleRepeatFallback', steps: (() => {
  const s: Step[] = [];
  for (let i = 1; i <= 4; i++) s.push({ k: 'fix', t: T0 + i * 100, x: 0, y: 0, acc: 5, ageMs: 10_000 });
  for (let i = 1; i <= 3; i++) s.push({ k: 'fix', t: T0 + 1000, x: 0, y: 0, acc: 5 });   // gleicher Zeitstempel
  for (let i = 2; i <= 14; i++) s.push({ k: 'fix', t: T0 + i * 1000, x: 0, y: 0.1 * (i % 2), acc: i % 3 === 0 ? 25 : 5 });
  for (let i = 1; i <= 25; i++) s.push({ k: 'fix', t: T0 + 14_000 + i * 1000, x: 0, y: i, acc: 6 });
  return s;
})() });
// Lange Pause (60 s Lücke) + zeitgleiche Fixes
scenarios.push({ name: 'longGapAndDuplicateTime', steps: (() => {
  const s = walk(densify([[0, 0], [0, 30], [25, 30]], 1), 14);
  const k = 20, gap = 60_000;
  return s.map((st, i) => (st.k === 'fix' && i >= k ? { ...st, t: st.t + gap } : st)).flatMap((st, i) => (i === 30 && st.k === 'fix' ? [st, { ...st, x: st.x + 0.2 }] : [st]));
})() });
// Pause/Resume mitten in der Fährte
scenarios.push({ name: 'pausedMidRoute', steps: (() => {
  const s = walk(right90, 15);
  s.splice(12, 0, { k: 'pause', on: true });
  s.splice(22, 0, { k: 'pause', on: false });
  return s;
})() });
// Auto-Erkennung aus
scenarios.push({ name: 'autoDetectOff', steps: walk(right90, 16), autoDetect: false });
// Manuelle Marker
scenarios.push({ name: 'manualMarkers', steps: (() => {
  const s = walk(right90, 17);
  s.splice(15, 0, { k: 'marker', type: 'gegenstand' });
  s.splice(30, 0, { k: 'marker', type: 'winkel', angleKind: 'rechts' });
  return s;
})() });
// QA + Motion-Evidenz (Turn-Fusion mit IMU)
scenarios.push({ name: 'motionEvidence current+qa', qa: true, steps: (() => {
  const base = walk(densify([[0, 0], [0, 20], [20, 20], [20, 0]], 1), 18);
  const out: Step[] = [];
  for (const st of base) {
    out.push(st);
    if (st.k === 'fix') for (let j = 1; j <= 4; j++) {
      const t = st.t + j * 200;
      const near = (st.y > 18 && st.x < 2) || (st.x > 18 && st.y > 18);
      out.push({ k: 'motion', t, headingDelta: near ? 18 : (j % 2 ? 0.4 : -0.4), stepDelta: j === 2 ? 1 : 0 });
    }
  }
  return out;
})() });
// Lange Aufnahme (Punkt-Flush-Batches ≥ 25)
scenarios.push({ name: 'longRouteFlushBatches', steps: walk(densify([[0, 0], [0, 80], [60, 80], [60, 20]], 1), 19) });
