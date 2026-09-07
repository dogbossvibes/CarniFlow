// ──────────────────────────────────────────────────────────────────────────
// Track Fusion Engine — REINE, testbare Logik (kein React/Expo/Native-Import).
//
// Core Motion ERSETZT Core Location NICHT. Core Location (GPS) bleibt die
// absolute Positionsquelle. Motion dient ausschliesslich als Zusatzsignal:
//   - Plausibilisierung eines GPS-Fixes (passt die gemeldete Bewegung zur
//     Sensorik?)
//   - GPS-Outlier-Erkennung (ein GPS-Sprung ohne entsprechende Rotation/
//     Schritte ist verdächtig — die Linie wird dann NICHT blind verschoben)
//   - Stillstandserkennung (GPS-Jitter im Stand darf keine künstliche Distanz
//     erzeugen)
//   - Confidence-Bewertung (ein ANYVO-interner Qualitätsindex, KEINE
//     mathematisch-absolute Wahrscheinlichkeit)
//
// KEIN Dead-Reckoning durch doppelte Integration der Beschleunigung — IMU-
// Drift macht das nach wenigen Sekunden unbrauchbar. Diese Engine schätzt
// niemals selbst eine Position; sie bewertet/filtert ausschliesslich die von
// Core Location gelieferten Fixes.
// ──────────────────────────────────────────────────────────────────────────

export type TrackPointClassification =
  | 'accepted'
  | 'smoothed'
  | 'low_confidence'
  | 'gps_outlier'
  | 'stationary'
  | 'recovered';

export type FusionMode = 'gps_only' | 'gps_motion';
export type MovementState = 'stationary' | 'walking' | 'running' | 'automotive' | 'unknown';

export interface LocationPoint {
  latitude:            number;
  longitude:           number;
  timestamp:           number;         // ms
  horizontalAccuracy:  number | null;  // m
  verticalAccuracy?:   number | null;  // m
  speed:               number | null;  // m/s, vom GPS gemeldet
  course:              number | null;  // Grad, vom GPS gemeldet
}

export interface MotionInput {
  movementState:         MovementState | null;
  stepDelta:              number | null;
  accelerationMagnitude:  number | null;   // g, gemittelt über das Emit-Fenster
  rotationMagnitude:      number | null;   // rad/s, gemittelt über das Emit-Fenster
  headingDelta:           number | null;   // Grad, Änderung seit letztem Motion-Sample
  motionConfidence:       number | null;   // 0..1, vom nativen Modul (Sensor-Verfügbarkeit)
}

export interface FusionHistory {
  prevAccepted:   LocationPoint | null;
  prevSpeedMps:   number | null;
  prevCourseDeg:  number | null;
}

export interface FusionConfig {
  /** Jenseits dieser Genauigkeit fliesst der Fix gar nicht mehr ein (degradiert graziös, kein Hard-Stop der Fährte). */
  maxAccuracyM:            number;
  /** Bei/unter dieser Genauigkeit volle Accuracy-Teilbewertung. */
  goodAccuracyM:           number;
  /** Physikalisch plausible Höchstgeschwindigkeit für die Fährtenarbeit (m/s) — dieselbe Grössenordnung wie searchFix.ts. */
  maxPlausibleSpeedMps:    number;
  /** Fixes älter als dies gelten als nicht mehr aktuell (ms). */
  maxFixAgeMs:             number;
  /** Unterhalb dieser gemittelten Beschleunigungsmagnitude gilt Motion als "kein Ausschlag" (Stillstand-Indiz). */
  stationaryAccelThreshold: number;
  /** Unterhalb dieser gemittelten Rotationsmagnitude gilt Motion als "keine Drehung" (Stillstand-Indiz). */
  stationaryRotationThreshold: number;
  /** GPS-Wanderung bis zu diesem Wert gilt bei erkanntem Stillstand als reiner Jitter, keine echte Bewegung. */
  stationaryJitterM:       number;
  /** Ab dieser Sprungdistanz wird ein GPS-Sprung überhaupt erst als Outlier-Kandidat geprüft. */
  outlierJumpM:            number;
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  maxAccuracyM: 45,             // dieselbe Grenze wie SEARCH_MAX_ACCURACY_M (searchFix.ts) — ein Fix-Akzeptanz-Ursprung
  goodAccuracyM: 8,
  maxPlausibleSpeedMps: 12,     // dieselbe Grenze wie SEARCH_MAX_SPEED_MPS (searchFix.ts)
  maxFixAgeMs: 5000,
  stationaryAccelThreshold: 0.05,
  stationaryRotationThreshold: 0.15,
  stationaryJitterM: 3,
  outlierJumpM: 6,
};

export interface FusionResult {
  confidence:        number;               // 0..1 — ANYVO-interner Qualitätsindex, keine Wahrscheinlichkeit
  classification:    TrackPointClassification;
  acceptedLocation:   LocationPoint;         // die Position, die die Fährtenlogik tatsächlich verwenden soll
  rawLocation:        LocationPoint;         // der unveränderte GPS-Rohfix (Diagnose/Nachvollziehbarkeit)
  reasonFlags:        string[];
  fusionMode:         FusionMode;
  distanceSinceLastM: number;               // vorgeschlagene Distanz seit dem letzten akzeptierten Punkt (bei stationary/outlier ggf. 0)
}

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineM(a: LocationPoint, b: LocationPoint): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Grad → Qualitätsstufe, ausschliesslich für Anzeige/Diagnose (Punkt 8).
export type ConfidenceBand = 'excellent' | 'good' | 'limited' | 'unreliable';
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.90) return 'excellent';
  if (confidence >= 0.75) return 'good';
  if (confidence >= 0.50) return 'limited';
  return 'unreliable';
}

// Ist Motion (laut den gelieferten Werten) mit "kein Ausschlag" vereinbar?
//
// Root-Cause-Fix (echtes iPhone, Build 42 — "Ist-Suchspur fehlt komplett"):
// `movementState === 'stationary'` durfte hier bisher ALLEIN genügen (sofortiges
// return true, ohne jede Rücksicht auf accel/rotation/Schritte). Apples
// CMMotionActivityManager (AnyvoMotionManager.swift) klassifiziert nach dem
// tatsächlichen Bewegungsbeginn real bekanntermassen noch mehrere Sekunden
// (teils deutlich länger) als 'stationary' nach, UND `lastActivity` dort hat
// keinerlei Staleness-Timeout — eine einzige frühe, längst überholte
// Klassifikation blieb so für die gesamte Session massgebend. Kombiniert mit
// dem harten `return true` bei movementState==='stationary' hat das jeden
// nachfolgenden, tatsächlich laufenden Fix als 'stationary' eingestuft →
// fusionBlocksGeometry in useSearchRecorder blieb dauerhaft true → die Ist-
// Suchspur wuchs nie (siehe SEARCH-LINE-REGRESSION im Abschlussbericht).
// Fix: movementState ist wie überall sonst im Modul (vgl. motionCorroboratesTurn,
// searchStartAcquisition) NIE mehr alleiniger Beweis — nur die schnellen,
// echtzeitnahen Signale (Beschleunigung/Rotation/Schritte) entscheiden. Liegen
// GAR KEINE Echtzeit-Signale vor (alle drei null), ist "stationary" NICHT der
// sichere Default mehr (das wäre derselbe Fehler nur anders verpackt) —
// fehlende Evidenz darf eine laufende Fährte nie einfrieren.
function motionLooksStationary(motion: MotionInput | null, cfg: FusionConfig): boolean {
  if (!motion) return false;
  const accelHasData = motion.accelerationMagnitude != null;
  const rotHasData = motion.rotationMagnitude != null;
  const stepHasData = motion.stepDelta != null;
  if (!accelHasData && !rotHasData && !stepHasData) return false;   // keine Echtzeit-Evidenz → nicht stationär annehmen
  const accelOk = !accelHasData || (motion.accelerationMagnitude as number) < cfg.stationaryAccelThreshold;
  const rotOk = !rotHasData || (motion.rotationMagnitude as number) < cfg.stationaryRotationThreshold;
  const noSteps = !stepHasData || motion.stepDelta === 0;
  return accelOk && rotOk && noSteps;
}

// Passt eine gemeldete Bewegungsrichtungsänderung (headingDelta aus Motion)
// GROB zu einem seitlichen GPS-Sprung? Nur weiche Evidenz — niemals harte
// Bedingung (Punkt 5/16-Prinzip aus der Start-Acquisition wird hier
// fortgeführt).
function motionCorroboratesTurn(motion: MotionInput | null, courseDeltaDeg: number | null): boolean {
  if (!motion || courseDeltaDeg == null) return true;   // keine Evidenz → nicht widersprechen
  if (motion.headingDelta == null) return true;
  // Ein deutlicher GPS-Kursschwenk sollte MIT einer gewissen Rotation
  // einhergehen — nicht exakt gleich (Rauschen/Verzögerung), nur GROBE
  // Plausibilität.
  const absTurn = Math.abs(courseDeltaDeg);
  if (absTurn < 20) return true;   // kleine Kursänderung: nichts zu widerlegen
  return Math.abs(motion.headingDelta) > 3 || (motion.rotationMagnitude ?? 0) > 0.05;
}

// Hauptfunktion: ein GPS-Fix + optionales Motion-Sample + Historie → FusionResult.
export function evaluateFusion(
  raw: LocationPoint,
  motion: MotionInput | null,
  history: FusionHistory,
  cfg: FusionConfig = DEFAULT_FUSION_CONFIG,
): FusionResult {
  const fusionMode: FusionMode = motion ? 'gps_motion' : 'gps_only';
  const reasonFlags: string[] = [];
  const prev = history.prevAccepted;

  // ── Basisgrössen ggü. dem letzten akzeptierten Punkt ──
  const jumpM = prev ? haversineM(prev, raw) : 0;
  const dtS = prev ? Math.max(0.001, (raw.timestamp - prev.timestamp) / 1000) : null;
  const impliedSpeedMps = dtS != null ? jumpM / dtS : null;
  const courseDeltaDeg = raw.course != null && history.prevCourseDeg != null
    ? angleDiffDeg(raw.course, history.prevCourseDeg) : null;

  // ── Fix-Alter ──
  const ageMs = Date.now() - raw.timestamp;
  const fresh = ageMs <= cfg.maxFixAgeMs;
  if (!fresh) reasonFlags.push('stale_fix');

  // ── Accuracy jenseits der Nutzbarkeitsgrenze: degradiert graziös, gar
  //    nicht erst versuchen, den Fix sinnvoll zu bewerten (Punkt 7: kein
  //    Zwang auf perfektes GPS, aber jenseits von maxAccuracyM ist selbst ein
  //    grosszügiger Toleranzwert nicht mehr aussagekräftig). ──
  const accOk = raw.horizontalAccuracy == null || raw.horizontalAccuracy <= cfg.maxAccuracyM;
  if (!accOk) reasonFlags.push('accuracy_too_poor');

  // ── Stillstand-Erkennung (Punkt 6, "Stationary Jitter") ──
  const looksStationary = motionLooksStationary(motion, cfg);
  if (looksStationary && jumpM > 0 && jumpM <= cfg.stationaryJitterM * 2.5) {
    reasonFlags.push('stationary_jitter_suppressed');
    return {
      confidence: clamp01(0.55 + (motion?.motionConfidence ?? 0) * 0.35),
      classification: 'stationary',
      acceptedLocation: prev ?? raw,   // Position bleibt am letzten akzeptierten Punkt — keine künstliche Distanz.
      rawLocation: raw,
      reasonFlags,
      fusionMode,
      distanceSinceLastM: 0,
    };
  }

  // ── GPS-Outlier-Erkennung (Punkt 6, "GPS-Sprung bei gleichbleibender Bewegung") ──
  // Mehrere Signale kombiniert, nicht nur horizontalAccuracy:
  //   - deutlicher Sprung
  //   - UND (schlechte Accuracy ODER physikalisch unplausible implizite Geschwindigkeit)
  //   - UND Motion widerspricht (keine passende Rotation/Schritte für einen
  //     scharfen Kursschwenk, oder Motion zeigt praktisch Stillstand während
  //     GPS eine grosse Bewegung behauptet).
  const speedImplausible = impliedSpeedMps != null && impliedSpeedMps > cfg.maxPlausibleSpeedMps;
  const accPoor = raw.horizontalAccuracy != null && raw.horizontalAccuracy > cfg.goodAccuracyM * 2;
  const bigJump = jumpM >= cfg.outlierJumpM;
  const motionContradicts = motion != null && (
    motionLooksStationary(motion, cfg)
    || !motionCorroboratesTurn(motion, courseDeltaDeg)
  );

  if (bigJump && (speedImplausible || accPoor) && motionContradicts) {
    reasonFlags.push('gps_outlier_motion_mismatch');
    if (speedImplausible) reasonFlags.push('speed_implausible');
    if (accPoor) reasonFlags.push('accuracy_poor');
    return {
      // Nicht einfach blind die Linie verschieben: der akzeptierte Punkt
      // bleibt am letzten guten Fix, bis ein nachfolgender Fix konsistent ist.
      confidence: 0.2,
      classification: 'gps_outlier',
      acceptedLocation: prev ?? raw,
      rawLocation: raw,
      reasonFlags,
      fusionMode,
      distanceSinceLastM: 0,
    };
  }

  // ── Ohne Motion-Widerspruch, aber trotzdem physikalisch unplausibel oder
  //    schlechte Genauigkeit ohne Motion-Daten zur Gegenprobe → vorsichtig
  //    (low_confidence), aber NICHT verworfen (Motion war keine Evidenz da). ──
  if (!accOk || (speedImplausible && !motion)) {
    reasonFlags.push(!accOk ? 'accuracy_too_poor' : 'speed_implausible_no_motion_evidence');
    return {
      confidence: 0.35,
      classification: 'low_confidence',
      acceptedLocation: raw,
      rawLocation: raw,
      reasonFlags,
      fusionMode,
      distanceSinceLastM: jumpM,
    };
  }

  // ── Confidence-Berechnung (Punkt 8) — gewichtete Kombination, EIN
  //    ANYVO-interner Qualitätsindex, KEINE mathematische Wahrscheinlichkeit. ──
  const accScore = raw.horizontalAccuracy == null
    ? 0.6
    : clamp01(1 - (raw.horizontalAccuracy - cfg.goodAccuracyM) / (cfg.maxAccuracyM - cfg.goodAccuracyM));
  const ageScore = fresh ? 1 : clamp01(1 - (ageMs - cfg.maxFixAgeMs) / cfg.maxFixAgeMs);
  const speedScore = impliedSpeedMps == null
    ? 1
    : clamp01(1 - Math.max(0, impliedSpeedMps - cfg.maxPlausibleSpeedMps) / cfg.maxPlausibleSpeedMps);
  const courseScore = courseDeltaDeg == null ? 1 : clamp01(1 - courseDeltaDeg / 180);
  const motionScore = motion ? clamp01(motion.motionConfidence ?? 0.5) : 0.5;
  const stepScore = motion?.stepDelta != null && motion.stepDelta > 0 ? 1 : 0.8;

  const confidence = clamp01(
    accScore * 0.35
    + ageScore * 0.15
    + speedScore * 0.15
    + courseScore * 0.10
    + motionScore * 0.15
    + stepScore * 0.10,
  );

  const classification: TrackPointClassification = confidence < 0.5 ? 'low_confidence' : 'accepted';

  return {
    confidence,
    classification,
    acceptedLocation: raw,
    rawLocation: raw,
    reasonFlags,
    fusionMode,
    distanceSinceLastM: jumpM,
  };
}
