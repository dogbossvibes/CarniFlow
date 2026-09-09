// Test-Helfer (kein Test-Suite-Modul): simuliert die native Core-Motion-Kette
// aus AnyvoMotionManager.swift, damit die Testdaten dieselben Verluste erben
// wie die Realität.
//
//   • intern 20 Hz  (deviceMotionUpdateInterval = 1/20)
//   • Emit alle 250 ms (Default emitIntervalMs)
//   • rotationMagnitude = MITTELWERT von |rotationRate| über das Fenster
//   • headingDelta      = yaw(letztes Tick) − yaw(erstes Tick) des Fensters
//   • stepDelta         = ganzzahlige Schrittdifferenz seit dem letzten Emit
//
// Die Bewegungsprogramme (Drehdauern, Rotationsamplituden beim Handy-Heben,
// Gait-Yaw-Wobble) sind physikalisch plausible ANNAHMEN, keine Gerätemessungen.

import type { MovementState } from '@/modules/anyvo-motion';
import type { MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';

export const DEG = 180 / Math.PI;
export const TICK_HZ = 20;
export const TICK_S = 1 / TICK_HZ;
export const EMIT_MS = 250;
export const STRIDE_HZ = 0.9;          // Doppelschritt-Frequenz
export const NORMAL_STEP_RATE = 1.8;   // 108 Schritte/min
export const T0 = 1_000_000;

export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function gauss(rnd: () => number): number {
  return (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) / 0.7071;
}

export interface Program {
  /** zusätzliche Yaw-Rate um die Vertikale (°/s) — Körper- ODER Gerätedrehung */
  yawRateDps: (t: number) => number;
  /** zusätzliche Pitch/Roll-Rate (rad/s) — Heben, Bücken, Verstauen */
  offAxisRadS: (t: number) => number;
  /** Schritte/s */
  stepRate: (t: number) => number;
}

export interface Carry {
  /** Yaw-Wobble-Amplitude des Gangs (Grad) — in der Hand klein, in der Tasche gross */
  gaitYawAmpDeg: number;
  /** Grundrauschen der 3-Achsen-Rotation im Gehen (rad/s) */
  gaitOffAxisRadS: number;
}
export const HAND: Carry = { gaitYawAmpDeg: 3.0, gaitOffAxisRadS: 0.35 };
export const POCKET: Carry = { gaitYawAmpDeg: 8.0, gaitOffAxisRadS: 0.90 };

export const ZERO = () => 0;
export const WALK = () => NORMAL_STEP_RATE;

export function pulse(t: number, from: number, to: number, amp: number): number {
  return t >= from && t < to ? amp / (to - from) : 0;
}
export function box(t: number, from: number, to: number, v: number): number {
  return t >= from && t < to ? v : 0;
}

export function simulate(durationS: number, prog: Program, carry: Carry, seed: number, t0 = T0): MotionWindowSample[] {
  const rnd = lcg(seed);
  const out: MotionWindowSample[] = [];
  const ticks = Math.round(durationS * TICK_HZ);
  const ticksPerEmit = Math.round((EMIT_MS / 1000) * TICK_HZ);

  let yaw = 0;
  let stepsFloat = 0;
  let stepsEmitted = 0;

  let winFirstYaw: number | null = null;
  let winRot: number[] = [];
  let winAcc: number[] = [];
  let winStates: MovementState[] = [];

  for (let i = 0; i < ticks; i++) {
    const t = i * TICK_S;
    const gaitYawRate = carry.gaitYawAmpDeg * 2 * Math.PI * STRIDE_HZ * Math.cos(2 * Math.PI * STRIDE_HZ * t);
    const sr = prog.stepRate(t);
    const moving = sr > 0.2;
    const yawRate = (moving ? gaitYawRate : 0) + prog.yawRateDps(t) + gauss(rnd) * 1.5;
    yaw += yawRate * TICK_S;

    const offAxis = (moving ? carry.gaitOffAxisRadS : 0.05) + prog.offAxisRadS(t) + Math.abs(gauss(rnd)) * 0.06;
    const omega = Math.hypot(yawRate / DEG, offAxis);
    const accel = (moving ? 0.18 : 0.02) + prog.offAxisRadS(t) * 0.15 + Math.abs(gauss(rnd)) * 0.02;

    stepsFloat += sr * TICK_S;

    if (winFirstYaw == null) winFirstYaw = yaw;
    winRot.push(omega);
    winAcc.push(accel);
    winStates.push(moving ? 'walking' : 'stationary');

    if ((i + 1) % ticksPerEmit === 0) {
      const totalSteps = Math.floor(stepsFloat);
      const stepDelta = totalSteps - stepsEmitted;
      stepsEmitted = totalSteps;
      const walkingTicks = winStates.filter(s => s === 'walking').length;
      const walkingMajority = walkingTicks > winStates.length / 2;
      out.push({
        t: t0 + Math.round((t + TICK_S) * 1000),
        headingDelta: yaw - winFirstYaw,
        rotationMagnitude: winRot.reduce((a, b) => a + b, 0) / winRot.length,
        accelerationMagnitude: winAcc.reduce((a, b) => a + b, 0) / winAcc.length,
        stepDelta,
        cadence: walkingMajority ? NORMAL_STEP_RATE * 60 : null,
        movementState: walkingMajority ? 'walking' : 'stationary',
      });
      winFirstYaw = null; winRot = []; winAcc = []; winStates = [];
    }
  }
  return out;
}
