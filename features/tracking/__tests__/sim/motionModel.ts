// Fährten-Simulator (T-192) — reiner Testcode.
// Erzeugt die Bewegungsdaten (Drehung, Schritte), die das Handy zur wahren
// Fährte liefern würde. Die Kette der nativen Aufbereitung (20 Hz intern,
// Ausgabe alle 250 ms) kommt aus dem bestehenden Helfer motionScenarioSim, damit
// hier dieselben Annahmen gelten wie in den vorhandenen Tests.
import type { MotionWindowSample } from '../../utils/motionTurnEvidence';
import { HAND, POCKET, simulate, type Program } from '../../utils/__tests__/helpers/motionScenarioSim';
import type { MotionProfile } from './profiles';
import type { Rng } from './rng';
import { truthAt, type Timeline } from './truthTrack';

/** Schrittlänge aus dem Tempo (Ho 2016: 0,94 m/s → 0,60 m; 1,36 m/s → 0,69 m). */
export function stepLengthM(speedMps: number): number {
  return 0.3845 + 0.2246 * speedMps;
}

export function simulateMotion(truth: Timeline, profile: MotionProfile, rng: Rng, seed: number, t0Ms: number): MotionWindowSample[] {
  const dt = truth.dtS;
  const program: Program = {
    yawRateDps: t => (truthAt(truth, t + dt).headingDeg - truthAt(truth, t).headingDeg) / dt,
    offAxisRadS: () => 0,
    stepRate: t => { const v = truthAt(truth, t).speedMps; return v < 0.1 ? 0 : v / stepLengthM(v); },
  };
  const raw = simulate(truth.durationS, program, profile.carry === 'pocket' ? POCKET : HAND, (seed >>> 0) || 1, t0Ms);
  const biasSign = rng() < 0.5 ? -1 : 1;
  const out: MotionWindowSample[] = [];
  let pending = 0, lastRelease = t0Ms;
  for (const s of raw) {
    const v = truthAt(truth, (s.t - t0Ms) / 1000).speedMps;
    let steps = 0;
    for (let i = 0; i < s.stepDelta; i++) if (rng() >= profile.stepMissProb(v)) steps++;
    pending += steps;
    let stepDelta = 0;
    if (profile.stepBatchS <= 0 || s.t - lastRelease >= profile.stepBatchS * 1000) { stepDelta = pending; pending = 0; lastRelease = s.t; }
    out.push({ ...s, headingDelta: s.headingDelta + biasSign * profile.gyroBiasDps * 0.25, stepDelta });
  }
  return out;
}
