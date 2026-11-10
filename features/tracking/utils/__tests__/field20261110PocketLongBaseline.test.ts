// T-190 — Long-Baseline-Rückfall für verrauschte, langsam gelaufene Spuren.
//
// REALE QA-Aufnahmen vom 2026-11-10 (iOS 1.0.8/60, Production-OTA 3bb78943):
//   pocket-slow.json — Handy im Hosensack, langsames Legen (~0,2 m/s),
//                      Genauigkeit 6–9 m. Im Feld: KEIN Winkel erkannt.
//   hand-fast.json   — Handy in der Hand, zügiges Gehen (~1,1 m/s),
//                      Genauigkeit 2–5 m. Im Feld: R → L → SL → SR erkannt.
// Die Fixtures sind datenschutzreduziert (relative x/y/tMs, keine absoluten
// Positionen/Zeiten/IDs).
//
// SOLLFOLGE pocket-slow laut Hundeführerin (2026-11-10, aus der Erinnerung):
// R → R → L → R. Zur GPS-Geometrie passt das so (Detektor-Weg):
//   R  ~36 m   (~117° → ~200°), lange Schenkel
//   R  ~51 m   (~200° → ~280°), danach nur ~5 m realer Schenkel mit Legepause
//   L  ~61 m   (~280° → ~210°)
//   R  ~92 m   (~210° → ~305°), lange Schenkel
// Der Rückfall findet den ERSTEN und den LETZTEN Winkel. Die beiden mittleren
// bleiben eine BEKANNTE LÜCKE: der Schenkel dazwischen ist real nur ~5 m lang,
// bei 6–9 m Genauigkeit und Zittern in der Legepause (Hälften-Biegung 70–150°,
// Sehne 1–4 m auf 5–8 m Pfad). Aus dem GPS allein ist dieser Versatz nicht von
// Drift im Stand zu unterscheiden; die Gates werden dafür bewusst NICHT gelockert.
import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns } from '../turnFusion';
import { detectShortLegCorners, type ShortLegPoint } from '../shortLegCornerDetection';
import {
  detectLongBaselineCorners, evaluateLongBaselineCorner,
  LONG_BASELINE_EXCLUSION_M, LONG_BASELINE_MIN_TURN_DEG,
} from '../longBaselineCorner';
import { CORNER_GAP_M } from '../shortLegCornerDetection';

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'field20261110', name), 'utf8'));
const pocket = () => fixture('pocket-slow.json');
const hand = () => fixture('hand-fast.json');

const M_PER_DEG = 111320;
/** Synthetische Spur aus lokalen Metern; Punktabstand ≈ stepM, deterministisches Zittern. */
function track(vertices: [number, number][], stepM = 0.7, jitterM = 0, seed = 1): ShortLegPoint[] {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const xy: [number, number][] = [];
  for (let v = 0; v < vertices.length - 1; v++) {
    const [ax, ay] = vertices[v], [bx, by] = vertices[v + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / stepM));
    for (let k = v === 0 ? 0 : 1; k <= n; k++) xy.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  let cum = 0;
  let prev: [number, number] | null = null;
  return xy.map(([x0, y0], i) => {
    const x = x0 + rnd() * 2 * jitterM, y = y0 + rnd() * 2 * jitterM;
    if (prev) cum += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
    return { lat: y / M_PER_DEG, lng: x / M_PER_DEG, cumDist: cum, accuracy: 6, t: i * 2000 };
  });
}
/** Kreisbogen mit Radius r über `sweepDeg`, davor/danach gerade Stücke. */
function arc(r: number, sweepDeg: number, leadM = 20): [number, number][] {
  const v: [number, number][] = [[0, -leadM], [0, 0]];
  for (let a = 5; a <= sweepDeg; a += 5) {
    const rad = (a * Math.PI) / 180;
    v.push([r - r * Math.cos(rad), r * Math.sin(rad)]);
  }
  const end = (sweepDeg * Math.PI) / 180;
  const [lx, ly] = v[v.length - 1];
  v.push([lx + leadM * Math.sin(end), ly + leadM * Math.cos(end)]);
  return v;
}

describe('fixtures 2026-11-10', () => {
  it('are privacy-reduced', () => {
    for (const data of [pocket(), hand()]) {
      const json = JSON.stringify(data);
      expect(json).not.toMatch(/"(?:lat|lng|latitude|longitude|sessionId|userId|email|createdAt|startedAt|endedAt|absoluteTimestamp|updateId)"/i);
      expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('pocket-slow: field failure shape', () => {
  it('in the field no corner was reported and both corner zones failed before any angle was measured', () => {
    const data = pocket();
    expect(data.turnFusion).toEqual([]);
    const reasons = (from: number, to: number) => data.autoDiagnostics
      .filter((d: any) => d.apexIndex >= from && d.apexIndex <= to).map((d: any) => d.rejectReason);
    for (const [from, to] of [[47, 55], [128, 136]]) {
      expect(reasons(from, to).every((r: string) => r === 'no_window_before' || r === 'no_window_after')).toBe(true);
    }
  });

  it('the unchanged regular detector still finds nothing on this buffer', () => {
    const pts = capturedDetectorBuffer(pocket().detectorPoints);
    expect(detectShortLegCorners(pts).corners).toEqual([]);
    expect(fuseTurns(pts, { longBaselineRescue: false }).corners).toEqual([]);
  });
});

describe('pocket-slow: long-baseline fallback', () => {
  const pts = () => capturedDetectorBuffer(pocket().detectorPoints);

  it('finds the two long-leg right corners (first and last of R-R-L-R), as normal corners', () => {
    const p = pts();
    const r = fuseTurns(p);
    expect(r.longBaseline).toBe(2);
    expect(r.rescued).toBe(0);
    expect(r.turns.map(t => [t.source, t.kind, t.sharpness])).toEqual([
      ['gps_long_baseline', 'rechts', 'normal'],
      ['gps_long_baseline', 'rechts', 'normal'],
    ]);
    expect(Math.abs(r.corners[0].atM - 36)).toBeLessThan(4);
    expect(Math.abs(r.corners[1].atM - 92)).toBeLessThan(4);
    for (const t of r.turns) {
      expect(t.flags).toContain('long_baseline');
      expect(Math.abs(t.headingDeltaDeg!)).toBeGreaterThan(75);
      expect(Math.abs(t.headingDeltaDeg!)).toBeLessThan(110);
      expect(t.motion.available).toBe(false);
    }
  });

  it('KNOWN GAP: the two middle corners (R ~51 m, L ~61 m, ~5 m apart) are still not detected', () => {
    // Dokumentiert den Ist-Zustand, kein Soll: 2 von 4 gelaufenen Winkeln fehlen weiterhin.
    // Wer diese Lücke schliesst, ersetzt diesen Test durch die volle Folge R-R-L-R.
    const r = fuseTurns(pts());
    expect(r.corners.filter(c => c.atM > 44 && c.atM < 80)).toEqual([]);
    expect(r.corners).toHaveLength(2);
  });

  it('marks the diagnostics of a rescued apex with its own source', () => {
    const r = fuseTurns(pts());
    for (const c of r.corners) {
      const d = r.diagnostics.find(x => x.apexIndex === c.apexIndex)!;
      expect(d.fusionSource).toBe('gps_long_baseline');
      expect(d.rejectReason).toBeNull();
      expect(d.classification).toBe('rechts');
    }
  });

  it('is stable while the buffer grows: the live commit rule reports each corner exactly once', () => {
    const p = pts();
    // Nachbildung der Commit-Regel aus layProcessingSession.persistShortLegCorners.
    let last = -Infinity;
    const committed: { atM: number; kind: string }[] = [];
    for (let n = 3; n <= p.length; n++) {
      const r = fuseTurns(p.slice(0, n));
      for (const c of r.corners) {
        if (c.atM <= last) continue;
        if (c.atM - last < CORNER_GAP_M) continue;
        const fused = r.turns.find(t => t.apexIndex === c.apexIndex);
        if (fused?.source === 'gps_long_baseline' && c.atM - last < LONG_BASELINE_EXCLUSION_M) continue;
        last = c.atM;
        committed.push({ atM: c.atM, kind: c.kind });
      }
    }
    expect(committed.map(c => c.kind)).toEqual(['rechts', 'rechts']);
    expect(Math.abs(committed[0].atM - 36)).toBeLessThan(4);
    expect(Math.abs(committed[1].atM - 92)).toBeLessThan(4);
  });
});

describe('hand-fast: the regular path is untouched', () => {
  it('reports the same four corners as in the field, none from the fallback', () => {
    const data = hand();
    const r = fuseTurns(capturedDetectorBuffer(data.detectorPoints));
    expect(r.longBaseline).toBe(0);
    expect(r.turns.map(t => [t.apexIndex, t.kind, t.source])).toEqual(
      data.turnFusion.map((t: any) => [t.apexIndex, t.kind, t.source]),
    );
    expect(r.turns.map(t => t.kind)).toEqual(['rechts', 'links', 'spitz_links', 'spitz_rechts']);
  });

  it('is identical with the fallback switched off', () => {
    const p = capturedDetectorBuffer(hand().detectorPoints);
    expect(fuseTurns(p).corners).toEqual(fuseTurns(p, { longBaselineRescue: false }).corners);
  });
});

describe('long-baseline gates (contract tests, synthetic)', () => {
  it('a noisy straight line yields no corner', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(detectLongBaselineCorners(track([[0, 0], [0, 80]], 0.7, 0.5, seed), [])).toEqual([]);
    }
  });

  it('a clean 90° corner with long legs is found once, with the right direction', () => {
    const right = detectLongBaselineCorners(track([[0, 0], [0, 30], [30, 30]], 0.7, 0.4, 7), []);
    expect(right.map(h => h.direction)).toEqual(['rechts']);
    const left = detectLongBaselineCorners(track([[0, 0], [0, 30], [-30, 30]], 0.7, 0.4, 7), []);
    expect(left.map(h => h.direction)).toEqual(['links']);
    expect(Math.abs(right[0].headingDeltaDeg)).toBeGreaterThan(75);
    expect(right[0].sharpness).toBe('normal');
  });

  it('a wide, even arc is not a corner', () => {
    for (const r of [15, 20, 30]) {
      expect(detectLongBaselineCorners(track(arc(r, 90), 0.7, 0.3, 3), [])).toEqual([]);
    }
  });

  it('a gentle bend below the minimum turn is not a corner', () => {
    const deg = LONG_BASELINE_MIN_TURN_DEG - 20;
    const rad = (deg * Math.PI) / 180;
    expect(detectLongBaselineCorners(track([[0, 0], [0, 30], [30 * Math.sin(rad), 30 + 30 * Math.cos(rad)]], 0.7, 0.3, 5), [])).toEqual([]);
  });

  it('legs shorter than the required baseline are left to the regular path', () => {
    expect(detectLongBaselineCorners(track([[0, 0], [0, 8], [8, 8]], 0.7, 0.2, 2), [])).toEqual([]);
  });

  it('standing jitter (path length without progress) is not a leg', () => {
    // 30 m gerade, dann ~60 Fixe Zittern am Ort, dann nichts mehr.
    const p = track([[0, 0], [0, 30]], 0.7, 0.2, 9);
    let cum = p[p.length - 1].cumDist;
    let s = 11;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
    let px = 0, py = 30;
    for (let k = 0; k < 60; k++) {
      const x = rnd() * 1.6, y = 30 + rnd() * 1.6;
      cum += Math.hypot(x - px, y - py); px = x; py = y;
      p.push({ lat: y / M_PER_DEG, lng: x / M_PER_DEG, cumDist: cum, accuracy: 8, t: (p.length + 1) * 2000 });
    }
    expect(detectLongBaselineCorners(p, [])).toEqual([]);
  });

  it('never places a corner inside the exclusion distance of an existing one', () => {
    const p = track([[0, 0], [0, 30], [30, 30]], 0.7, 0.4, 7);
    const [hit] = detectLongBaselineCorners(p, []);
    const atM = p[hit.apexIndex].cumDist;
    expect(detectLongBaselineCorners(p, [atM + LONG_BASELINE_EXCLUSION_M - 1])).toEqual([]);
    expect(evaluateLongBaselineCorner(p, 0)).toBeNull();
    expect(evaluateLongBaselineCorner(p, p.length - 1)).toBeNull();
  });
});
