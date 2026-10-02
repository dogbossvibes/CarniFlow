// Grenzfälle des V6.2-Rescue-Bounds EPISODE_MAX_SPAN_M (= TURN_CONCENTRATION_M = 2,5 m).
// Varianten der REALEN F1-02-Geometrie: nur der Nachher-Schenkel wird entlang des Übergangs
// verschoben, um die Strecke zwischen Vorher- und Nachher-Scheitel gezielt zu verändern
// (real 1,68 m). Der klassische Regelpfad/Split-Apex findet dort nichts — nur die Episode greift.
import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns, EPISODE_MAX_SPAN_M } from '../turnFusion';
import { TURN_CONCENTRATION_M } from '../shortLegCornerDetection';

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fieldV61', 'V6.1-F1-02.json'), 'utf8'));
const BASE_SPAN_M = 1.68;   // Strecke zwischen Punkt 7 und 9 im realen Lauf

type Pt = { x: number; y: number; accuracy: number; tMs: number; cumDistM?: number };
function withCum(pts: Pt[]): Pt[] {
  let cum = 0;
  return pts.map((p, i) => { if (i) cum += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { ...p, cumDistM: cum }; });
}
/** Nachher-Schenkel (Punkte ≥ 9) um `extraM` entlang des Segments 8→9 verschieben → Übergangsstrecke wächst. */
function widened(extraM: number): Pt[] {
  const pts: Pt[] = data.detectorPoints.map((p: Pt) => ({ ...p }));
  const dx = pts[9].x - pts[8].x, dy = pts[9].y - pts[8].y, len = Math.hypot(dx, dy);
  for (let i = 9; i < pts.length; i++) { pts[i].x += (dx / len) * extraM; pts[i].y += (dy / len) * extraM; }
  return withCum(pts);
}
const evidence = (signedNetYawDeg: number) => ({
  available: true, evidence: 1, signedNetYawDeg, netYawDeg: Math.abs(signedNetYawDeg), grossYawDeg: Math.abs(signedNetYawDeg),
  monotonicity: 1, yawShare: 1, gaitAccelFraction: 1, steps: 6, cadence: null, movementState: 'walking',
  locomotionSource: 'steps', windowStartMs: 0, windowEndMs: 0, sampleCount: 8,
}) as any;
const run = (pts: Pt[], yaw: number | null) => fuseTurns(capturedDetectorBuffer(pts), yaw == null ? {} : {
  turnEvidenceAt: () => evidence(yaw), turnEvidenceForDirection: () => evidence(yaw),
});
const episodes = (r: ReturnType<typeof run>) => r.turns.filter(t => t.flags.includes('turn_episode_pair'));
const span = (pts: Pt[]) => pts[9].cumDistM! - pts[7].cumDistM!;

describe('Zwei-Segment-Episode: Bound EPISODE_MAX_SPAN_M und Gates', () => {
  it('the bound is the existing concentration length, not a free number', () => {
    expect(EPISODE_MAX_SPAN_M).toBe(TURN_CONCENTRATION_M);
    expect(EPISODE_MAX_SPAN_M).toBe(2.5);
  });

  it('real span (1.68 m) → episode corner; baseline for the variants', () => {
    const pts = widened(0);
    expect(span(pts)).toBeCloseTo(BASE_SPAN_M, 1);
    const hits = episodes(run(pts, -85));
    expect(hits).toHaveLength(1);
    expect(hits[0].direction).toBe('rechts');
  });

  it('knapp unter dem Bound (2,45 m) → Episode-Ecke', () => {
    const pts = widened(2.45 - BASE_SPAN_M);
    expect(span(pts)).toBeLessThanOrEqual(EPISODE_MAX_SPAN_M);
    expect(episodes(run(pts, -85))).toHaveLength(1);
  });

  it('knapp über dem Bound (2,6 m) → keine Episode, auch mit passender IMU', () => {
    const pts = widened(2.6 - BASE_SPAN_M);
    expect(span(pts)).toBeGreaterThan(EPISODE_MAX_SPAN_M);
    expect(episodes(run(pts, -85))).toHaveLength(0);
  });

  it('ohne IMU-Bestätigung → keine Episode (GPS allein reicht für diese schwächere Paarung nicht)', () => {
    expect(episodes(run(widened(0), null))).toHaveLength(0);
  });

  it('IMU widerspricht der GPS-Richtung → keine Episode und keine Gegenrichtung', () => {
    const r = run(widened(0), +85);
    expect(episodes(r)).toHaveLength(0);
    expect(r.turns.some(t => t.direction === 'rechts')).toBe(false);
  });

  it('Zickzack im Übergang (Richtung springt zurück statt monoton zu drehen) → keine Episode', () => {
    const pts: Pt[] = data.detectorPoints.map((p: Pt) => ({ ...p }));
    // Punkt 8 so setzen, dass das erste Übergangssegment über die Zielrichtung hinausschiesst (≈ 140°) und das zweite zurückdreht.
    const a = pts[7], len = 0.9, b = (140 * Math.PI) / 180;
    pts[8] = { ...pts[8], x: a.x + len * Math.sin(b), y: a.y + len * Math.cos(b) };
    const z = withCum(pts);
    const bearing = (i: number) => (Math.atan2(z[i + 1].x - z[i].x, z[i + 1].y - z[i].y) * 180) / Math.PI;
    expect(Math.abs(bearing(8) - 140)).toBeGreaterThan(Math.abs(bearing(7) - 140) - 1);   // Sanity: nicht monoton
    expect(episodes(run(z, -85))).toHaveLength(0);
  });

  it('gespiegelt: dieselbe Geometrie nach links, IMU links → Episode links (kein seitenspezifischer Wert)', () => {
    const mirrored = widened(0).map(p => ({ ...p, x: -p.x }));
    const hits = episodes(run(mirrored, +85));
    expect(hits).toHaveLength(1);
    expect(hits[0].direction).toBe('links');
  });
});
