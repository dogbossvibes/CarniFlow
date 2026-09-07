// anyvo-motion — Typen (Phase 1: iOS Core Motion).
//
// Bewusst nur AGGREGIERTE Werte pro Emit-Fenster (Default 250 ms) — keine
// 100-Hz-Rohdaten über die Bridge (Akku/CPU, siehe README).

export type MovementState = 'stationary' | 'walking' | 'running' | 'automotive' | 'unknown';
export type ActivityConfidenceLevel = 'low' | 'medium' | 'high';

export interface MotionSample {
  timestamp:              number;   // ms (Unix)
  accelerationMagnitude:  number;   // gemittelte |userAcceleration| im Fenster (g)
  rotationMagnitude:      number;   // gemittelte |rotationRate| im Fenster (rad/s)
  headingDelta:           number;   // Änderung des Yaw im Fenster (Grad, -180..180)
  stepDelta:              number;   // Schritte seit dem letzten Sample
  cadence:                number | null;   // Schritte/Minute, falls verfügbar
  movementState:          MovementState;
  motionConfidence:       number;   // 0..1 — wie viele Sensor-Quellen liefern gerade Daten
  activityConfidence:     ActivityConfidenceLevel;   // CMMotionActivity-eigene Confidence (oder 'low' als Fallback)
  // Alter der zugrundeliegenden CMMotionActivity-Klassifikation in ms (Punkt 9
  // des Audits, rein diagnostisch — NICHT Teil der Fusion-Entscheidungslogik,
  // die nutzt intern bereits ihre eigene Staleness-Prüfung). `null` = noch nie
  // eine Activity empfangen (kein CMMotionActivityManager verfügbar/erlaubt).
  activityAgeMs?:         number | null;
}

export interface MotionStatus {
  deviceMotionAvailable: boolean;
  stepCountingAvailable: boolean;
  activityAvailable:     boolean;
  pedometerAuthorized:   boolean;
  running:               boolean;
}

export interface MotionError {
  code:    string;
  message: string;
}

export interface MotionUpdateOptions {
  /** Wie oft aggregierte Samples an JS gehen (ms). Default 250 (4 Hz). */
  emitIntervalMs?: number;
}

export type AnyvoMotionModuleEvents = {
  onMotionSample: (sample: MotionSample) => void;
  onMotionError:  (error: MotionError) => void;
};
