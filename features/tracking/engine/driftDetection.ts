// Drift-Erkennung: GPS „springt", obwohl Sensorik/GPS Stillstand meldet.
// Typisch im Wald/an Gebäuden. Reine Funktionen → testbar.
import { distanceM } from '@/lib/trackGuidance';
import { PRECISION } from '@/features/tracking/engine/gpsQuality';
import type { RawFix, MotionState } from '@/features/tracking/engine/types';
import type { HeadingPoint, GnssStatusAndroid } from '@/features/tracking/native/types';

export interface DriftInput {
  hasLast:       boolean;
  dist:          number;          // Meter zum letzten akzeptierten Punkt
  speed:         number | null;   // m/s
  sensorMotion:  MotionState;     // 'unknown' = keine Sensorik
  gpsStationary: boolean;         // aus stationaryDetection
}

export function isDrift({ hasLast, dist, speed, sensorMotion, gpsStationary }: DriftInput): boolean {
  if (!hasLast) return false;
  // Stillstand laut Sensorik ODER (ohne Sensorik) laut GPS-Cluster.
  const sensorSaysStill = sensorMotion === 'stationary' || (sensorMotion === 'unknown' && gpsStationary);
  return sensorSaysStill && dist > PRECISION.STATIONARY_RADIUS_M && (speed == null || speed > 0.5);
}

// --- Gewichtete Drift-Bewertung (mehrere Signale → Confidence) ---

// Schwellen für die Drift-Heuristik.
const DRIFT_ACCURACY_M = 20;   // schlechter als 20 m
const DRIFT_JUMP_M     = 5;    // Distanzsprung > 5 m
const DRIFT_DT_S       = 2;    // sehr kurze Zeitdifferenz
const MIN_USED_IN_FIX  = 4;    // Android: zu wenige Satelliten im Fix
const DRIFT_THRESHOLD  = 0.5;  // ab dieser Confidence gilt es als Drift
const HEADING_MOTION_EPS = 0.05; // ~0 → Sensoren sehen keine Bewegung

export interface StationaryState {
  isStationary: boolean;
}

export interface DetectDriftInput {
  previousAcceptedPoint: RawFix | null;
  currentPoint:          RawFix;
  headingPoint?:         HeadingPoint | null;
  stationaryState?:      StationaryState | boolean | null;
  gnssStatus?:           GnssStatusAndroid | null;
}

export interface DriftResult {
  isDrift:    boolean;
  reason:     string | null;
  confidence: number;        // 0..1
}

// Einzelnes Drift-Signal mit Gewicht.
interface Signal { hit: boolean; weight: number; reason: string }

function isStationaryState(s: StationaryState | boolean | null | undefined): boolean {
  return typeof s === 'boolean' ? s : !!s?.isStationary;
}

// Heading-/Bewegungssensoren melden praktisch keine Bewegung.
function headingShowsNoMotion(h: HeadingPoint | null | undefined): boolean {
  if (!h) return false;
  const { x, y, z } = h;
  if (x == null || y == null || z == null) return false;
  const magnitude = Math.hypot(x, y, z);
  return Number.isFinite(magnitude) && magnitude < HEADING_MOTION_EPS;
}

export function detectDrift({
  previousAcceptedPoint: prev,
  currentPoint: cur,
  headingPoint,
  stationaryState,
  gnssStatus,
}: DetectDriftInput): DriftResult {
  const acc   = cur.accuracy;
  const dist  = prev ? distanceM(prev, cur) : 0;
  const dtSec = prev ? (cur.t - prev.t) / 1000 : 0;
  const speed = prev && dtSec > 0 ? dist / dtSec : (cur.speed ?? null);

  const stationary  = isStationaryState(stationaryState);
  const jumped      = !!prev && dist > DRIFT_JUMP_M;
  const shortGap    = !!prev && dtSec > 0 && dtSec < DRIFT_DT_S;
  const noSensorMotion = headingShowsNoMotion(headingPoint);

  const signals: Signal[] = [
    // Wir „stehen", aber die Position wandert → stärkstes Drift-Indiz.
    { hit: stationary && !!prev && dist > PRECISION.STATIONARY_RADIUS_M, weight: 0.35, reason: 'STATIONARY_BUT_MOVED' },
    // Großer Sprung in sehr kurzer Zeit → Teleport.
    { hit: jumped && shortGap,                                          weight: 0.25, reason: 'GPS_TELEPORT' },
    // Unplausibles Tempo fürs Fährtenlegen.
    { hit: speed != null && speed > PRECISION.MAX_SPEED_MPS,            weight: 0.20, reason: 'SPEED_IMPLAUSIBLE' },
    // Reiner Distanzsprung (auch ohne kurzes Intervall).
    { hit: jumped,                                                      weight: 0.20, reason: 'DISTANCE_JUMP' },
    // Schlechte Genauigkeit begünstigt Drift.
    { hit: acc == null || acc > DRIFT_ACCURACY_M,                       weight: 0.20, reason: 'LOW_ACCURACY' },
    // Sensoren sehen keine echte Bewegung, GPS aber schon.
    { hit: noSensorMotion && !!prev && dist > PRECISION.STATIONARY_RADIUS_M, weight: 0.20, reason: 'NO_SENSOR_MOTION' },
    // Android: zu wenige Satelliten im Fix → unzuverlässig.
    { hit: gnssStatus != null && gnssStatus.usedInFixCount < MIN_USED_IN_FIX, weight: 0.25, reason: 'WEAK_GNSS' },
  ];

  const hits = signals.filter(s => s.hit);
  const confidence = Math.min(1, hits.reduce((sum, s) => sum + s.weight, 0));

  // Dominantes Signal als Grund melden.
  const dominant = hits.reduce<Signal | null>((best, s) => (best && best.weight >= s.weight ? best : s), null);

  const isDriftResult = confidence >= DRIFT_THRESHOLD;
  return {
    isDrift: isDriftResult,
    reason: isDriftResult ? dominant?.reason ?? null : null,
    confidence,
  };
}
