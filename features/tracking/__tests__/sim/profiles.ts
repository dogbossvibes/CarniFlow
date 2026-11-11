// Fährten-Simulator (T-192) — reiner Testcode.
// Geräteklassen, Umgebungen, Trageweisen und Zustellarten. Die Zahlen stammen aus
// der Literaturrecherche vom 2026-11-10 (README.md) und sind überwiegend
// begründete ANNAHMEN, keine Messungen an den Geräten unserer Nutzer.
import { IDEAL_GPS, LIVE_DELIVERY, type DeliverySpec, type GpsProfile } from './gpsModel';

export type DeviceClass = 'dual' | 'single' | 'weak';
export type Environment = 'open' | 'edge' | 'forest' | 'dense';
export type CarryMode = 'hand' | 'pocket';
export type Platform = 'ios' | 'android';

export const DEVICE_LABEL: Record<DeviceClass, string> = {
  dual: 'Neueres Handy (Zweifrequenz-GPS)', single: 'Mittelklasse (Einfrequenz-GPS)', weak: 'Schwaches/älteres Handy',
};
export const ENV_LABEL: Record<Environment, string> = {
  open: 'Offenes Feld', edge: 'Feldrand/Baumreihe', forest: 'Lichter Wald', dense: 'Dichtes Laubdach',
};
export const CARRY_LABEL: Record<CarryMode, string> = { hand: 'In der Hand', pocket: 'Hosentasche' };

interface EnvRow {
  slow: [number, number]; fast: [number, number]; white: number;
  burstFraction: number; jumpProb: number; dropout: number; accuracyBias: number;
}
// [Zweifrequenz, Einfrequenz] je Achse in Metern.
const ENV: Record<Environment, EnvRow> = {
  open:   { slow: [1.0, 1.5], fast: [0.7, 1.2], white: 0.2, burstFraction: 0.02, jumpProb: 0,      dropout: 0,    accuracyBias: 1.15 },
  edge:   { slow: [1.2, 1.5], fast: [2.2, 3.2], white: 0.3, burstFraction: 0.06, jumpProb: 0.0005, dropout: 0.01, accuracyBias: 0.9 },
  forest: { slow: [1.5, 2.0], fast: [3.3, 4.6], white: 0.4, burstFraction: 0.10, jumpProb: 0.001,  dropout: 0.03, accuracyBias: 0.75 },
  dense:  { slow: [2.5, 2.5], fast: [6.0, 8.0], white: 0.5, burstFraction: 0.15, jumpProb: 0.003,  dropout: 0.08, accuracyBias: 0.6 },
};

/** Körperabschattung in der Hosentasche: grösserer schneller Fehler (Annahme, dünne Datenlage). */
const POCKET_FAST_FACTOR = 1.5;
/** Schwaches Gerät: alle Fehler grösser, deutlich mehr Lücken (Purfürst 2022: ein Gerät nur 77 % Verfügbarkeit im Wald). */
const WEAK_SIGMA_FACTOR = 1.4;

export function gpsProfile(device: DeviceClass, env: Environment, carry: CarryMode = 'hand'): GpsProfile {
  const row = ENV[env];
  const col = device === 'dual' ? 0 : 1;
  const k = device === 'weak' ? WEAK_SIGMA_FACTOR : 1;
  const pocket = carry === 'pocket' ? POCKET_FAST_FACTOR : 1;
  return {
    name: `${device}/${env}/${carry}`,
    slowSigmaM: row.slow[col] * k, slowTauS: 900,
    fastSigmaM: row.fast[col] * k * pocket, fastTauS: 30,
    whiteSigmaM: row.white * k,
    burstFraction: row.burstFraction, burstFactor: 3, burstMeanS: 12,
    jumpProbPerFix: row.jumpProb * (device === 'weak' ? 2 : 1),
    dropoutFraction: device === 'weak' ? Math.min(0.25, row.dropout * 4 + (env === 'open' ? 0 : 0.03)) : row.dropout,
    dropoutMeanS: 6,
    accuracyBias: row.accuracyBias, accuracyFloorM: 3,
    intervalS: 1, intervalJitterS: 0.15,
    settleM: 0,
  };
}

export { IDEAL_GPS, LIVE_DELIVERY };

/** Android im Hintergrund: Positionen kommen gebündelt alle 30 s (deferredUpdatesInterval der App). */
export const ANDROID_BATCH_30S: DeliverySpec = { name: 'batch30', mode: 'batch', latencyMs: 150, batchPeriodS: 30, batchAfterS: 20 };

export interface MotionProfile {
  carry: CarryMode;
  platform: Platform;
  /** Anteil nicht gezählter Schritte, abhängig vom Tempo. */
  stepMissProb: (speedMps: number) => number;
  /** Schritte kommen gebündelt alle so viele Sekunden (iOS ~2,5 s), 0 = fortlaufend. */
  stepBatchS: number;
  /** Rest-Drift des Drehratensensors (°/s). */
  gyroBiasDps: number;
}

/** Schrittzähler-Unterzählung beim langsamen Gehen (Major 2016, Höchsmann 2018, Duncan 2017; grobe Stufen). */
export function stepMissByspeed(speedMps: number, weak: boolean): number {
  const base = speedMps >= 1.2 ? 0.02 : speedMps >= 0.9 ? 0.06 : 0.18;
  return Math.min(0.6, base * (weak ? 1.5 : 1));
}

export function motionProfile(platform: Platform, carry: CarryMode, device: DeviceClass): MotionProfile {
  return {
    carry, platform,
    stepMissProb: v => stepMissByspeed(v, device === 'weak') + (carry === 'pocket' ? 0.03 : 0),
    stepBatchS: platform === 'ios' ? 2.5 : 1,
    gyroBiasDps: device === 'weak' ? 0.08 : 0.03,
  };
}
