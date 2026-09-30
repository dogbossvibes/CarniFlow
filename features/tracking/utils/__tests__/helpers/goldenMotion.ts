// Test-Helfer (kein Test-Suite-Modul): Core-Motion-Strom passend zur
// verbindlichen Golden-Field-Route.
//
// Die Drehungen liegen exakt auf den wahren Eckzeitpunkten der Route
// (Weglänge / Gehtempo). Vorzeichen-Konvention wie am realen Gerät gemessen
// (9/9 Feldereignisse, siehe motionTurnEvidence.MOTION_YAW_LEFT_SIGN):
// LINKS = positive Yaw-Summe, RECHTS = negative. Die Turn-Evidenz (`evidence`)
// bleibt vorzeichenfrei; nur die Fusion liest `signedNetYawDeg`.

import { FIELD_LEG_M } from './goldenRoute';
import { simulate, pulse, ZERO, WALK, HAND, type Program } from './motionScenarioSim';
import type { MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';

export const SPEED_MPS = 1.3;
export const TURN_DUR_S = 1.2;

/** L, R, SR, SL — Sensor-Konvention: links positiv, rechts negativ. */
const TURNS_DEG = [+90, -90, -135, +135];

/** Wahre Eckzeitpunkte der Golden-Route (Sekunden seit Start). */
export function cornerTimesS(): number[] {
  return [1, 2, 3, 4].map(k => (k * FIELD_LEG_M) / SPEED_MPS);
}

/** Motion-Strom für die Golden-Route. */
export function routeMotion(seed: number, tailM: number, extra?: Partial<Program>): MotionWindowSample[] {
  const cs = cornerTimesS();
  const prog: Program = {
    yawRateDps: (t) => cs.reduce((acc, c, i) => acc + pulse(t, c - TURN_DUR_S / 2, c + TURN_DUR_S / 2, TURNS_DEG[i]), 0)
      + (extra?.yawRateDps?.(t) ?? 0),
    offAxisRadS: extra?.offAxisRadS ?? ZERO,
    stepRate: extra?.stepRate ?? WALK,
  };
  return simulate(cs[cs.length - 1] + tailM / SPEED_MPS + 4, prog, HAND, seed);
}

/** Motion-Strom ohne Richtungswechsel — Basis der Negativfälle. */
export function straightMotion(durationS: number, seed: number, extra?: Partial<Program>): MotionWindowSample[] {
  return simulate(durationS, {
    yawRateDps: extra?.yawRateDps ?? ZERO,
    offAxisRadS: extra?.offAxisRadS ?? ZERO,
    stepRate: extra?.stepRate ?? WALK,
  }, HAND, seed);
}
