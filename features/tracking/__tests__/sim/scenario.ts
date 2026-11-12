// Fährten-Simulator (T-192) — reiner Testcode.
// Ein Szenario = Fährte × Gehweise × Gerät × Umgebung × Trageweise × Zustellung × Seed.
import { simulateGps, type DeliverySpec, type GpsProfile, type SimFix } from './gpsModel';
import { runLay, SIM_T0_MS, type LayRunResult } from './layRunner';
import { simulateMotion } from './motionModel';
import {
  gpsProfile, motionProfile, IDEAL_GPS, LIVE_DELIVERY,
  type CarryMode, type DeviceClass, type Environment, type Platform,
} from './profiles';
import { makeRng, seedFrom } from './rng';
import { scoreLay, type LayScore } from './scoring';
import { buildTruthTrack, DEFAULT_WALK, type TrackSpec, type TruthTrack, type WalkSpec } from './truthTrack';
import type { MotionWindowSample } from '../../utils/motionTurnEvidence';

export interface Scenario {
  track: TrackSpec;
  walk?: Partial<WalkSpec>;
  /** 'ideal' = fehlerfreies GPS (Kontrollgruppe). */
  device: DeviceClass | 'ideal';
  env: Environment;
  carry: CarryMode;
  platform: Platform;
  delivery?: DeliverySpec;
  /** false = Gerät liefert keine Bewegungsdaten (nur GPS). */
  motion?: boolean;
  /** Überschreibt einzelne Werte des GPS-Profils (z. B. veraltete erste Position). */
  gpsOverride?: Partial<GpsProfile>;
  seed: number;
}

export interface ScenarioOutcome {
  scenario: Scenario;
  truth: TruthTrack;
  fixes: SimFix[];
  motion: MotionWindowSample[];
  run: LayRunResult;
  score: LayScore;
}

export function scenarioKey(s: Scenario): string {
  return [s.track.name, s.walk?.speedMps ?? DEFAULT_WALK.speedMps, s.device, s.env, s.carry, s.platform,
    s.delivery?.name ?? 'live', s.motion === false ? 'nomotion' : 'motion', s.seed].join('|');
}

export function runScenario(s: Scenario): ScenarioOutcome {
  const key = scenarioKey(s);
  const walk: WalkSpec = { ...DEFAULT_WALK, ...s.walk };
  const truth = buildTruthTrack(s.track, walk, makeRng(seedFrom(key, 'walk')));
  const base = s.device === 'ideal' ? IDEAL_GPS : gpsProfile(s.device, s.env, s.carry);
  const profile: GpsProfile = { ...base, ...s.gpsOverride };
  const fixes = simulateGps(truth, profile, s.delivery ?? LIVE_DELIVERY, makeRng(seedFrom(key, 'gps')), SIM_T0_MS);
  const motion = s.motion === false ? [] : simulateMotion(
    truth, motionProfile(s.platform, s.carry, s.device === 'ideal' ? 'dual' : s.device),
    makeRng(seedFrom(key, 'motion')), seedFrom(key, 'motion-chain'), SIM_T0_MS);
  const run = runLay({ fixes, motion, motionActive: s.motion !== false, t0Ms: SIM_T0_MS });
  return { scenario: s, truth, fixes, motion, run, score: scoreLay(truth, run, SIM_T0_MS) };
}
