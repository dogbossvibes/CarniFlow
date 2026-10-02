// V6.2 — realer Feldlauf V6.1-F1-02 (R → L, je ~10 Schritte, keine Gegenstände).
// Das Fixture ist datenschutzreduziert (relative x/y/t, keine absoluten Positionen/Zeiten/IDs).
import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns, nearestCompatibleTurnEvidence } from '../turnFusion';
import { MotionEvidenceBuffer, type MotionWindowSample } from '../motionTurnEvidence';
import { advanceEndFixHistory, admitsEndHandlerFix, INITIAL_END_FIX_HISTORY } from '../endFixConfirmation';
import { stepTrackEnd, type TrackEndState } from '../guidanceEngine';
import { confirmLayMovement } from '../layMovementConfirmation';
import {
  normalizeDeg, robustBearing, meanBearing, SCALES_M, STRAIGHT_TOL_DEG, MIN_LEG_M, MIN_SAMPLES_SHORT, MIN_SAMPLES_LONG,
} from '../shortLegCornerDetection';

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fieldV61', 'V6.1-F1-02.json'), 'utf8'));

function run(detector: any[], motionSamples: any[]) {
  const samples: MotionWindowSample[] = motionSamples.map((s: any) => ({
    t: s.tMs, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude,
    accelerationMagnitude: s.accelerationMagnitude, stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState,
  }));
  const motion = new MotionEvidenceBuffer(1e9);
  samples.forEach(s => motion.push(s));
  return fuseTurns(capturedDetectorBuffer(detector), {
    turnEvidenceAt: t => t == null ? null : motion.evidenceForTrailing(t),
    turnEvidenceForDirection: (t, dir) => t == null ? null : nearestCompatibleTurnEvidence(t, dir,
      q => q == null ? null : motion.evidenceFor(q)),
    motionSamples: samples,
  });
}
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fieldV61', name), 'utf8'));
const f2 = () => fixture('V6-F2-2FN-01.json');
const mirror = (pts: any[]) => pts.map(p => ({ ...p, x: -p.x }));

describe('V6.1-F1-02 fixture', () => {
  it('is privacy-reduced', () => {
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/"(?:lat|lng|latitude|longitude|sessionId|userId|email|createdAt|startedAt|endedAt|absoluteTimestamp)"/i);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('V6.1-F1-02 corners: R → L', () => {
  it('current detector reproduces the field failure shape: every corner apex has no clean window pair', () => {
    // autoDiagnostics are the live field values: the corner apexes were rejected before any angle was measured.
    const reasons = (from: number, to: number) => data.autoDiagnostics
      .filter((d: any) => d.apexIndex >= from && d.apexIndex <= to).map((d: any) => d.rejectReason);
    expect(reasons(6, 10).every((r: string) => r === 'no_window_before' || r === 'no_window_after')).toBe(true);
    expect(reasons(14, 18).every((r: string) => r === 'no_window_before' || r === 'no_window_after')).toBe(true);
    expect(data.turnFusion).toEqual([]);
  });

  it('recovers right then left from GPS geometry, exactly two corners', () => {
    const r = run(data.detectorPoints, data.motionSamples);
    expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(r.turns.map(t => t.direction)).toEqual(['rechts', 'links']);
    expect(r.turns.every(t => t.source === 'gps_split_apex')).toBe(true);
    expect(r.turns[0].headingDeltaDeg!).toBeGreaterThan(80);
    expect(r.turns[1].headingDeltaDeg!).toBeLessThan(-80);
    // Die Schärfe der linken Ecke liegt in der Bänder-Lücke: Richtung belegt, Schärfe nicht behauptet.
    expect(r.turns[1].sharpness).toBe('unresolved');
    // Eine Motion-Episode stützt höchstens eine Ecke.
    const times = r.turns.map(t => t.motionAssociationTimeMs).filter((t): t is number => t != null);
    for (let i = 1; i < times.length; i++) expect(Math.abs(times[i] - times[i - 1])).toBeGreaterThan(1500);
    // Die Ecken liegen an den realen Stellen (Weglänge), nicht an den Kandidaten davor.
    expect(r.turns[0].atM).toBeGreaterThan(5.5);  expect(r.turns[0].atM).toBeLessThan(8.5);
    expect(r.turns[1].atM).toBeGreaterThan(14);   expect(r.turns[1].atM).toBeLessThan(17);
  });

  it('GPS-only: the single-segment-proven left corner stays; the weaker two-segment right corner needs IMU confirmation', () => {
    const r = run(data.detectorPoints, []);
    expect(r.corners.map(c => c.kind)).toEqual(['links']);
    expect(r.turns[0].source).toBe('gps_split_apex');
  });

  it('Motion never decides: a contradicting IMU direction creates and flips nothing', () => {
    const flipped = data.motionSamples.map((s: any) => ({ ...s, headingDelta: -s.headingDelta }));
    const r = run(data.detectorPoints, flipped);
    expect(r.corners).toEqual([]);
    expect(r.turns).toEqual([]);
  });

  it('is direction-symmetric: the mirrored world (geometry and yaw) gives the mirrored result', () => {
    const mirroredMotion = data.motionSamples.map((s: any) => ({ ...s, headingDelta: -s.headingDelta }));
    const r = run(mirror(data.detectorPoints), mirroredMotion);
    expect(r.corners.map(c => c.kind)).toEqual(['links', 'rechts']);
    expect(r.turns.map(t => t.direction)).toEqual(['links', 'rechts']);
  });

  it('does not invent corners on a straight walk with IMU turns (no GPS geometry → no corner)', () => {
    const straight = data.detectorPoints.map((p: any, i: number) => ({ ...p, x: i * 0.9, y: 0, cumDistM: i * 0.9 }));
    const r = run(straight, data.motionSamples);
    expect(r.corners).toEqual([]);
    expect(r.imuOnly.length).toBeGreaterThan(0);
  });

  it('does not accept wander: a non-monotone two-segment transition is not an episode corner', () => {
    // Zick-Zack statt Bogen: Richtung springt hin und her, kein monotoner Übergang.
    const pts = [[0, 0], [1, 0.6], [2, 1.2], [3, 1.8], [4, 2.4], [5, 1.5], [5.4, 2.8], [6.4, 1.2], [7.4, 0], [8.4, -1.2], [9.4, -2.4]]
      .map(([x, y], i, a) => ({ x, y, accuracy: 3, tMs: i * 1000,
        cumDistM: a.slice(1, i + 1).reduce((s, q, k) => s + Math.hypot(q[0] - a[k][0], q[1] - a[k][1]), 0) }));
    const r = run(pts, []);
    expect(r.corners.length).toBeLessThanOrEqual(1);
  });
});

describe('V6.1-F1-02 startup', () => {
  it('had no real movement evidence before the 12.5 s fallback (so fallback was correct)', () => {
    const before = data.startupMovementDiagnostics.samples.filter((s: any) => s.tSec < 12);
    expect(before.every((s: any) => s.cumulativeStepDelta === 0)).toBe(true);
    expect(before.every((s: any) => s.locomotionEvidence === 'none')).toBe(true);
    // GPS-Verschiebung blieb unter der Bestätigungsschwelle: 0,5 × Accuracy, begrenzt auf 1,8–3,0 m.
    const threshold = Math.min(3, Math.max(1.8, 0.5 * data.startupDiagnostics.accuracyAtStartM));
    expect(Math.max(...before.map((s: any) => s.displacementFromAnchorM ?? 0))).toBeLessThan(threshold);
    expect(data.startupMovementDiagnostics.confirmationSource).toBe('fallback');
    expect(data.startupMovementDiagnostics.confirmationTSec).toBeGreaterThan(12);
    // Die Gehbewegung beginnt erst NACH dem Fallback (Rohfixes verlassen den Anker erst danach).
    const standing = data.rawFixes.filter((f: any) => f.tMs < 12500);
    expect(Math.max(...standing.map((f: any) => Math.hypot(f.x, f.y)))).toBeLessThan(threshold);
  });

  it('real walking after onset IS confirmed multi-sensor-style by GPS displacement before any fallback needed', () => {
    const toLL = (f: any) => ({ lat: f.y / 111320, lng: f.x / 111320, accuracy: f.accuracy, t: f.tMs });
    const standing = data.rawFixes.filter((f: any) => f.tMs < 12500).map(toLL);
    const anchor = { lat: standing.map((s: any) => s.lat).sort()[Math.floor(standing.length / 2)],
      lng: standing.map((s: any) => s.lng).sort()[Math.floor(standing.length / 2)] };
    const walking = data.rawFixes.filter((f: any) => f.tMs <= 19500).map(toLL);
    const r = confirmLayMovement({ anchor, anchorAccuracyM: data.startupDiagnostics.accuracyAtStartM, acceptedFixes: walking,
      gaitSamples: [], sessionStartedMs: 0, nowMs: 19500, fallbackAfterMs: 60000 });
    expect(r.source).toBe('gps_displacement');
  });
});

describe('V6.1-F1-02 end confirmation', () => {
  it('the recorded end state is the frozen-fix signature (distinct fixes stopped, distance constant)', () => {
    const tail = data.search.endEligibilitySamples.filter((s: any) => s.tSec >= 25.6);
    expect(new Set(tail.map((s: any) => s.handlerDistanceToEndM)).size).toBe(1);
    expect(data.search.endConfirmationDiagnostics.stableFixCount).toBe(1);
    expect(data.search.endConfirmationDiagnostics.rejectionReason).toBe('end_hysteresis');
  });

  it('admission follows the fusion verdicts: stationary/accepted count; outlier, low_confidence and stale do not', () => {
    const c = (classification: string, reasonFlags: string[] = []) => ({ classification, reasonFlags });
    expect(admitsEndHandlerFix(c('stationary', ['stationary_jitter_suppressed']), 'current')).toBe(true);
    expect(admitsEndHandlerFix(c('accepted'), 'current')).toBe(true);
    expect(admitsEndHandlerFix(c('gps_outlier'), 'current')).toBe(false);
    expect(admitsEndHandlerFix(c('low_confidence'), 'current')).toBe(false);
    expect(admitsEndHandlerFix(c('stationary', ['stale_fix', 'stationary_jitter_suppressed']), 'current')).toBe(false);
    expect(admitsEndHandlerFix(c('accepted', ['stale_fix']), 'current')).toBe(false);
    expect(admitsEndHandlerFix(c('gps_outlier'), 'build40')).toBe(true);   // BUILD40 blockierte nie
  });

  it('two distinct stable handler fixes confirm the end (hysteresis kept at 2, radius unchanged)', () => {
    // Die Eligibility-Samples werden ~2,5× pro Sekunde geschrieben; derselbe Fix erscheint mehrfach.
    const samples = data.search.endEligibilitySamples.filter((s: any) => s.tSec <= 25.7)
      .filter((s: any, i: number, all: any[]) => i === 0 || s.handlerDistanceToEndM !== all[i - 1].handlerDistanceToEndM);
    let history = { ...INITIAL_END_FIX_HISTORY };
    let state: TrackEndState = 'unseen';
    let events = 0;
    const feed = (tSec: number, dist: number, progress: number) => {
      const ratio = progress / data.distances.recordedLineM;
      const lastSegmentReached = ratio >= 0.75 && dist <= 5;
      history = advanceEndFixHistory(history, { tMs: tSec * 1000, distanceToEndM: dist, accuracyM: 3,
        lastSegmentReached, handlerProgressRatio: ratio });
      const next = stepTrackEnd({ dogProgressM: progress + 1, handlerProgressM: progress, handlerDistanceToEndM: dist,
        activeObjectWait: false, searchActive: true, trackLengthM: data.distances.recordedLineM, geomDistanceM: null,
        openMandatoryObjects: 0, accuracyM: 3, lastSegmentReached, approachSeen: history.approachSeen,
        stableEndFixCount: history.insideCount,
        stableEndFixSpanMs: history.firstInsideMs == null ? 0 : tSec * 1000 - history.firstInsideMs }, state);
      state = next.state;
      if (next.justReached) events++;
    };
    samples.forEach((s: any) => feed(s.tSec, s.handlerDistanceToEndM, s.handlerProgressM));
    expect(history.insideCount).toBe(1);
    expect(events).toBe(0);                       // ein Fix reicht nicht
    feed(25.679, 1.24, 18.08);                    // derselbe Fix erneut (gleicher Zeitstempel) zählt nicht
    expect(history.insideCount).toBe(1);
    feed(26.7, 1.2, 18.1);                        // ein zweiter, verschiedener stabiler Fix
    expect(history.insideCount).toBe(2);
    expect(events).toBe(1);
    expect(state).toBe('reached');
    feed(27.7, 1.2, 18.1);                        // weiterhin am Ziel: genau ein Ende-Ereignis
    expect(events).toBe(1);
    expect(state).toBe('completed');
  });
});

describe('Golden matrix: real field runs together', () => {
  const oldF1 = fixture('V6-F1-1FN-01.json');
  const f2 = fixture('V6-F2-2FN-01.json');

  it('OLD V6-F1 (GPS ≈ 2 m): the right corner is the classic single-segment gps_split_apex, unchanged', () => {
    for (const motion of [oldF1.motionSamples, []]) {
      const r = run(oldF1.detectorPoints, motion);
      const right = r.turns.find(t => t.direction === 'rechts')!;
      expect(right).toMatchObject({ apexIndex: 7, source: 'gps_split_apex', kind: 'rechts', sharpness: 'normal' });
      expect(right.headingDeltaDeg!).toBeCloseTo(89.6, 1);
      expect(right.interiorAngleDeg!).toBeCloseTo(90.4, 1);
      expect(right.flags).toContain('split_apex_pair');
      expect(right.flags).not.toContain('turn_episode_pair');
      expect(r.corners[0].kind).toBe('rechts');
    }
    expect(run(oldF1.detectorPoints, oldF1.motionSamples).turns.find(t => t.direction === 'rechts')!.confidence).toBeCloseTo(0.757, 2);
  });

  it('NEW V6.1-F1-02 (GPS 3–5 m): same corner structure, spread over two segments → episode (right) + split apex (left)', () => {
    const r = run(data.detectorPoints, data.motionSamples);
    expect(r.turns.map(t => t.flags[0])).toEqual(['turn_episode_pair', 'split_apex_pair']);
    expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
  });

  it('V6-F2 (SR → SL → R → L): all established turns are unchanged; GPS-only additionally finds the real final left', () => {
    const withMotion = run(f2.detectorPoints, f2.motionSamples);
    expect(withMotion.corners.map(c => c.kind)).toEqual(['spitz_rechts', 'links', 'rechts', 'links']);
    expect(withMotion.turns.map(t => t.apexIndex)).toEqual([11, 21, 33, 41]);
    expect(withMotion.turns.every(t => !t.flags.includes('turn_episode_pair'))).toBe(true);
    const gpsOnly = run(f2.detectorPoints, []);
    expect(gpsOnly.corners.map(c => c.kind).slice(0, 2)).toEqual(['spitz_rechts', 'rechts']);
    expect(gpsOnly.turns.at(-1)).toMatchObject({ direction: 'links', apexIndex: 40 });
  });

  it('is not tied to ~2 m GPS: F1-02 keeps both corners at 2 m and at 6 m accuracy (accuracy only scales confidence)', () => {
    for (const accuracy of [2, 6]) {
      const pts = data.detectorPoints.map((p: any) => ({ ...p, accuracy }));
      const r = run(pts, data.motionSamples);
      expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    }
  });

  it('startup does not depend on the pedometer: with steps removed, GPS displacement still confirms real walking', () => {
    const toLL = (f: any) => ({ lat: f.y / 111320, lng: f.x / 111320, accuracy: f.accuracy, t: f.tMs });
    const standing = data.rawFixes.filter((f: any) => f.tMs < 12500).map(toLL);
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const anchor = { lat: med(standing.map((s: any) => s.lat)), lng: med(standing.map((s: any) => s.lng)) };
    const gait = data.motionSamples.map((s: any) => ({ t: s.tMs, stepDelta: 0, movementState: s.movementState,
      accelerationMagnitude: s.accelerationMagnitude }));
    const at = (now: number) => confirmLayMovement({ anchor, anchorAccuracyM: data.startupDiagnostics.accuracyAtStartM,
      acceptedFixes: data.rawFixes.filter((f: any) => f.tMs <= now).map(toLL), gaitSamples: gait.filter((g: any) => g.t <= now),
      sessionStartedMs: 0, nowMs: now, fallbackAfterMs: 1e9 });
    expect(at(12000).confirmed).toBe(false);      // Stehen + GPS-Jitter bestätigt nichts
    expect(at(19000)).toMatchObject({ confirmed: true, source: 'gps_displacement', stepDelta: 0 });
  });
});

describe('Sharpness stays geometry-only and honest (F2 apex 21, F1-02 left)', () => {
  /** Alle gültigen Schenkelfenster je Skala (wie stableLegWindow, aber ohne „grösstes gewinnt"), Spread ≤ Toleranz. */
  const windows = (pts: any[], from: number, forward: boolean) => {
    const out: { endIndex: number; lengthM: number; bearingDeg: number; spreadDeg: number }[] = [];
    for (const scale of SCALES_M) {
      let end = from;
      for (;;) {
        const n = end + (forward ? 1 : -1);
        if (n < 0 || n >= pts.length) break;
        const d = forward ? pts[n].cumDist - pts[from].cumDist : pts[from].cumDist - pts[n].cumDist;
        if (d > scale) break;
        end = n;
      }
      const lengthM = forward ? pts[end].cumDist - pts[from].cumDist : pts[from].cumDist - pts[end].cumDist;
      if (lengthM < MIN_LEG_M || Math.abs(end - from) + 1 < (scale < 4.5 ? MIN_SAMPLES_SHORT : MIN_SAMPLES_LONG)) continue;
      const fit = robustBearing(pts, from, end);
      const mean = meanBearing(pts, from, end);
      if (!fit || !mean || mean.spreadDeg > STRAIGHT_TOL_DEG || out.some(w => w.endIndex === end)) continue;
      out.push({ endIndex: end, lengthM, bearingDeg: fit.deg, spreadDeg: mean.spreadDeg });
    }
    return out;
  };
  const interiors = (pts: any[], p: number, q: number) => {
    const before = windows(pts, p, false), after = windows(pts, q, true);
    return { before, after, interior: before.flatMap(b => after.map(a => 180 - Math.abs(normalizeDeg(a.bearingDeg - b.bearingDeg)))) };
  };

  it('F2 apex 21: the return leg curves, so only one after-window is valid; every valid pair is a near-reversal (interior ≤ 2°)', () => {
    const r = interiors(capturedDetectorBuffer(f2().detectorPoints), 21, 21);
    expect(r.after).toHaveLength(1);                             // nur 2,4 m: ab 4,5 m ist der Spread 29–31° (> 26°)
    expect(r.after[0].lengthM).toBeLessThan(3);
    expect(r.before.length).toBeGreaterThan(1);
    expect(Math.max(...r.interior)).toBeLessThan(3);             // unterhalb des kalibrierten Spitz-Bandes (≥ 15°) — keine gültige Geometrie im Band
  });

  it('F2 apex 21: direction comes from Motion, sharpness is NOT claimed (unresolved → stored as plain links)', () => {
    const r = run(f2().detectorPoints, f2().motionSamples);
    const t21 = r.turns.find(t => t.apexIndex === 21)!;
    expect(t21).toMatchObject({ direction: 'links', directionSource: 'motion_override_low_geometry', sharpness: 'unresolved', kind: 'links' });
    expect(t21.interiorAngleDeg!).toBeLessThan(5);
  });

  it('F1-02 left: all valid window pairs straddle the 60°/65° band gap (≈ 58–73°) → unresolved is the only honest class', () => {
    const pts = capturedDetectorBuffer(data.detectorPoints);
    const r = interiors(pts, 15, 16);
    expect(r.interior.length).toBeGreaterThan(0);
    expect(Math.min(...r.interior)).toBeLessThan(65);
    expect(Math.max(...r.interior)).toBeGreaterThan(65);
    const left = run(data.detectorPoints, data.motionSamples).turns.find(t => t.direction === 'links')!;
    expect(left.sharpness).toBe('unresolved');
  });

  it('Motion never produces sharpness: with strongly opposite/any yaw magnitudes the F2 apex 21 sharpness stays unresolved', () => {
    const boosted = f2().motionSamples.map((s: any) => ({ ...s, headingDelta: s.headingDelta * 3, rotationMagnitude: s.rotationMagnitude * 3 }));
    const r = run(f2().detectorPoints, boosted);
    expect(r.turns.find(t => t.apexIndex === 21)?.sharpness).toBe('unresolved');
  });
});
