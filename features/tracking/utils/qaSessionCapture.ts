// QA-Mitschnitt einer gelegten Fährte — ausschliesslich für Feldtest-Analysen.
//
// ANLASS (Realdaten Teil A/B): der QA-Export konnte einen Feldlauf nicht
// reproduzieren, weil er nur die PERSISTIERTE Linie kennt (EMA 0,4 / Gate 2 m,
// ~5–7 Punkte). Der Detektor arbeitet aber auf einem eigenen, dichteren Puffer
// (EMA 0,7 / Gate 0,5 m, ~22–26 Punkte), der nach dem Stop verloren war. Auch
// die Marker-Distanzen stammen je nach Herkunft aus zwei verschiedenen
// Massstäben — ohne Kennzeichnung im Export nicht auseinanderzuhalten.
//
// Dieser Mitschnitt hält beides fest. Er ist STRIKT QA-only:
//   • wird nur befüllt, wenn der QA-Diagnosemodus aktiv ist,
//   • liegt in einem EIGENEN AsyncStorage-Bereich, getrennt von der
//     produktiven Historie (`local_training_sessions`/`local_track_points`),
//   • verändert weder Erkennung noch Aufzeichnung noch Persistenz der Fährte.
//
// Persistenz über den App-Neustart ist bewusst vorgesehen: ein Feldtest wird
// typischerweise erst später am Schreibtisch exportiert, oft nach einem
// Neustart. Ohne Ablage wäre der Mitschnitt genau dann weg, wenn man ihn
// braucht. Der Bereich ist auf die letzten Sessions begrenzt und enthält
// ausschliesslich relative Koordinaten und relative Zeiten.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MovementState } from '@/modules/anyvo-motion';
import type { FusedTurn, ImuOnlyEvent } from '@/features/tracking/utils/turnFusion';

const KEY_PREFIX = 'anyvo.qa.trackCapture.';
const INDEX_KEY = 'anyvo.qa.trackCapture.index';
/** So viele Mitschnitte werden aufbewahrt; ältere fallen heraus. */
export const QA_CAPTURE_RETENTION = 5;

/** Ein Punkt einer beliebigen Pipeline-Stufe, relativ zum ersten Rohfix. */
export interface QaCapturePoint {
  x: number;
  y: number;
  accuracy: number | null;
  tMs: number;
  /** Nur für Detektor-/Linienpunkte: kumulierte Weglänge DIESER Pipeline. */
  cumDistM?: number;
}

export type QaMarkerSource = 'auto' | 'auto_split_apex' | 'manual' | 'stop_flush' | 'build40' | 'unknown';
export type QaDistanceScale = 'detector' | 'line' | 'unknown';

/** Woher stammt die `distance_from_start` eines Markers? */
export interface QaMarkerMeta {
  /** Marker-ID, wie sie auch in der Datenbank steht. */
  markerId: string;
  source: QaMarkerSource;
  scale: QaDistanceScale;
  /** Index im Detektor-Puffer, falls der Marker von dort stammt. */
  apexIndex: number | null;
}

export interface QaAutoDiagnostic {
  apexIndex: number;
  tMs: number | null;
  bearingBefore: number | null;
  bearingAfter: number | null;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  classification: string | null;
  confidenceBeforeMotion: number | null;
  motionAdjustment: number | null;
  confidence: number;
  rejectReason: string | null;
  /** Wurde dieser Kandidat im Lauf tatsächlich als Winkel bestätigt? */
  accepted: boolean;
}

/**
 * QA v2.2 — Turn-Fusion je Ecke (T-TRACK-FUSION-QUALITY-2026-09-30, Vorgabe §17).
 * Eine Zeile pro fusionierter Ecke: woher sie stammt, wie Richtung und Schärfe
 * getrennt entschieden wurden, wie belastbar die Geometrie ist und was Motion
 * dazu sagte. Zeiten relativ zum Aufnahmebeginn.
 */
export interface QaTurnFusion {
  apexIndex: number;
  atM: number;
  tMs: number | null;
  source: 'gps' | 'gps_split_apex';
  direction: 'links' | 'rechts';
  directionSource?: 'gps' | 'motion_override_low_geometry';
  motionAssociationSource?: 'live_cached' | 'accepted_live_turn' | 'current_ring' | 'none';
  signedNetYawDeg?: number | null;
  motionDirection?: 'links' | 'rechts' | null;
  motionEvidence?: number | null;
  sharpnessSource?: 'geometry';
  sharpness: 'normal' | 'spitz' | 'unresolved';
  /** Persistierter angleKind. */
  kind: string;
  confidence: number;
  confidenceBeforeMotion: number | null;
  motionAdjustment: number | null;
  sharpnessConfidence: number;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  accuracyM: number | null;
  legBeforeM: number | null;
  legAfterM: number | null;
  geometryQuality: number | null;
  geometryQualityLevel: 'high' | 'medium' | 'low' | null;
  accuracyToLegRatio: number | null;
  motion: {
    available: boolean;
    signedNetYawDeg: number | null;
    netYawDeg: number | null;
    evidence: number | null;
    direction: 'links' | 'rechts' | null;
    directionAgrees: boolean | null;
    magnitudeRatio: number | null;
  };
  flags: string[];
}

/** QA v2.2 — gerichtete Drehung ohne GPS-Ecke: nur protokolliert, nie persistiert. */
export interface QaImuOnlyEvent {
  tMs: number;
  direction: 'links' | 'rechts' | null;
  signedNetYawDeg: number;
  evidence: number;
  persisted: false;
  reason: 'imu_only_no_gps_corner';
}

/** Fusionierte Ecke → QA-Zeile (Zeiten relativ zu `originMs`). */
export function toQaTurnFusion(t: FusedTurn, originMs: number): QaTurnFusion {
  return {
    apexIndex: t.apexIndex, atM: Math.round(t.atM * 100) / 100,
    tMs: t.t == null ? null : Math.round(t.t - originMs),
    source: t.source, direction: t.direction, directionSource: t.directionSource,
    motionAssociationSource: t.motionAssociationSource,
    signedNetYawDeg: t.motion.signedNetYawDeg, motionDirection: t.motion.direction,
    motionEvidence: t.motion.evidence, sharpnessSource: 'geometry',
    sharpness: t.sharpness, kind: t.kind,
    confidence: t.confidence, confidenceBeforeMotion: t.confidenceBeforeMotion, motionAdjustment: t.motionAdjustment,
    sharpnessConfidence: t.sharpnessConfidence, headingDeltaDeg: t.headingDeltaDeg, interiorAngleDeg: t.interiorAngleDeg,
    accuracyM: t.accuracyM, legBeforeM: t.legBeforeM, legAfterM: t.legAfterM,
    geometryQuality: t.geometryQuality, geometryQualityLevel: t.geometryQualityLevel, accuracyToLegRatio: t.accuracyToLegRatio,
    motion: { ...t.motion }, flags: [...t.flags],
  };
}

export function toQaImuOnlyEvent(e: ImuOnlyEvent, originMs: number): QaImuOnlyEvent {
  return { tMs: Math.round(e.t - originMs), direction: e.direction, signedNetYawDeg: e.signedNetYawDeg, evidence: e.evidence, persisted: false, reason: e.reason };
}

/**
 * QA v2.1 — EIN Motion-Rohsample, wie es LIVE im Puffer lag.
 * Zeiten relativ zum Kandidaten-Zeitpunkt, damit nichts Absolutes exportiert
 * wird und jedes Auswertefenster (±1 s oder anders) nachrechenbar bleibt.
 */
export interface QaMotionSample {
  /** ms relativ zum Kandidaten-Zeitpunkt. Negativ = davor. */
  dtMs: number;
  headingDelta: number;
  rotationMagnitude: number;
  accelerationMagnitude: number;
  stepDelta: number;
  cadence: number | null;
  movementState: MovementState;
}

/**
 * QA v2.1 — was zum Zeitpunkt EINES Kandidaten an Motion-Evidenz vorlag.
 *
 * DREI EBENEN, strikt getrennt:
 *
 *   LIVE RECORDED       `samples` — die Rohsamples, die WÄHREND der Session im
 *                       Ringpuffer lagen. Nicht nachgerechnet, nicht ergänzt.
 *   DERIVED             `netYawDeg` … `turnEvidence` — Aggregate, die die
 *                       bestehende Variante-E-Logik daraus berechnet hat.
 *                       Unverändert übernommen, nicht neu gebildet.
 *   FINISH RECONSTRUCTED  gibt es hier NICHT. Der Block wird ausschliesslich
 *                       live geschrieben; `source` ist deshalb fest 'live'.
 *                       Der finish-Sweep in `autoDiagnostics` bleibt getrennt
 *                       und ist als Rekonstruktion gekennzeichnet.
 */
export interface QaCandidateMotion {
  // ── Zuordnung ────────────────────────────────────────────────────────────
  apexIndex: number;
  /** ms relativ zum Aufnahmebeginn — der Zeitpunkt, für den ausgewertet wurde. */
  evaluatedAtMs: number;
  /** Auswertefenster, relativ zum Kandidaten (ms). */
  windowStartMs: number;
  windowEndMs: number;

  // ── LIVE RECORDED: Verfügbarkeit ─────────────────────────────────────────
  sampleCount: number;
  /** Alter des ältesten/jüngsten Samples im Fenster, relativ zum Kandidaten. */
  firstSampleAgeMs: number | null;
  lastSampleAgeMs: number | null;
  /** false = im Fenster lag gar nichts. Unterscheidet „keine Evidenz" von
   *  „Evidenz sagt: keine Drehung". */
  motionAvailable: boolean;

  // ── DERIVED: Aggregate der bestehenden Variante-E-Logik ──────────────────
  netYawDeg: number;
  signedNetYawDeg?: number;
  direction?: 'links' | 'rechts' | null;
  grossYawDeg: number;
  monotonicity: number;
  yawShare: number;
  accelerationEvidence: number;
  stepDelta: number;
  cadence: number | null;
  movementState: MovementState | null;
  locomotionEvidence: 'steps' | 'gait_accel' | 'steps+gait_accel' | 'none';
  /** 0..1 oder null, wenn keine Daten. */
  turnEvidence: number | null;
  /** Was die ±0,12-Kopplung tatsächlich auf die Confidence gelegt hat. */
  adjustmentApplied: number;

  // ── LIVE RECORDED: die Rohsamples ────────────────────────────────────────
  /** Mit Kontext über das Auswertefenster hinaus (s. QA_MOTION_CONTEXT_MS). */
  samples: QaMotionSample[];

  /** Immer 'live'. Feld existiert, damit eine spätere Rekonstruktionsquelle
   *  unterscheidbar wäre, ohne das Schema erneut zu brechen. */
  source: 'live';
}

/** Kontext vor/nach dem Auswertefenster, damit auch grössere Fenster
 *  nachrechenbar sind. */
export const QA_MOTION_CONTEXT_MS = 2000;

export interface QaSessionCapture {
  /** 1 = Schema v2.0 (ohne Motion), 2 = v2.1 (mit candidateMotionEvidence). */
  captureVersion: 1 | 2;
  sessionLocalId: string;
  /** Dauer der Aufzeichnung (ms), relativ. */
  durationMs: number;
  counts: {
    rawFixes: number;
    acceptedFixes: number;
    rejectedFixes: number;
    detectorPoints: number;
    linePoints: number;
  };
  distances: {
    rawPathM: number;
    detectorPathM: number;
    recordedLineM: number;
    storeDistanceM: number;
  };
  rawFixes: QaCapturePoint[];
  detectorPoints: QaCapturePoint[];
  linePoints: QaCapturePoint[];
  markers: QaMarkerMeta[];
  /** FINISH RECONSTRUCTED — Neuberechnung beim Stop, OHNE Motion. */
  autoDiagnostics: QaAutoDiagnostic[];
  /** LIVE RECORDED + DERIVED — QA v2.1. Fehlt bei captureVersion 1. */
  candidateMotionEvidence?: QaCandidateMotion[];
  /** QA v2.2 — Turn-Fusion je Ecke (FINISH RECONSTRUCTED, mit Motion, falls sie lief). */
  turnFusion?: QaTurnFusion[];
  /** QA v2.2 — IMU-only-Ereignisse (nie persistiert). */
  imuOnlyEvents?: QaImuOnlyEvent[];
  startupDiagnostics?: {
    userTapStartTSec: number | null; permissionStartTSec: number | null; permissionEndTSec: number | null;
    warmupStartTSec: number | null; firstRawFixTSec: number | null; firstStableFixTSec: number | null;
    firstAcceptedFixTSec: number | null; motionReadyTSec: number | null;
    recorderArmedTSec: number | null; actualRecordingStartTSec: number | null;
    startupDelayMs: number | null; blockingReason: string | null; accuracyAtStartM: number | null;
    recordingSessionStartedTSec: number | null; geometryStartedTSec: number | null;
    startupUiDelayMs: number | null; geometryLockDelayMs: number | null;
    movementConfirmedTSec: number | null; fallbackUsed: boolean;
    movementConfirmationSource?: 'pedometer' | 'gps_displacement' | 'motion_gps' | 'fallback' | null;
    movementConfirmationConfidence?: number | null;
    movementGpsDisplacementM?: number | null;
    movementStepDelta?: number;
    movementMotionState?: string | null;
  };
  startupMovementDiagnostics?: {
    samples: { tSec: number; accuracyM: number | null; acceptedFix: boolean;
      displacementFromAnchorM: number | null; cumulativeStepDelta: number;
      motionState: string | null; locomotionEvidence: 'steps' | 'gait_accel' | 'none';
      accelerationEvidence: number; candidateSource: 'pedometer' | 'gps_displacement' | 'motion_gps' | 'fallback' | null;
      confirmed: boolean; rejectionReason: string | null }[];
    confirmationTSec: number | null;
    confirmationSource: 'pedometer' | 'gps_displacement' | 'motion_gps' | 'fallback' | null;
    confirmationConfidence: number | null;
    fallbackUsed: boolean;
    truncated: boolean;
  };
  manualAngleGeometryDiagnostics?: {
    markers: { manualMarkerType: 'ow' | 'bw' | 'gw'; geometryDirection: 'links' | 'rechts' | 'unresolved';
      geometrySharpness: 'normal' | 'sharp' | 'unresolved'; geometryQuality: number | null;
      confidence: number | null; motionDirection: 'links' | 'rechts' | null;
      directionAgrees: boolean | null; classificationSource: string | null }[];
    truncated: boolean;
  };
  voiceDiagnostics?: { events: import('./trackingUxDiagnostics').VoiceDiagnostic[]; truncated: boolean };
}

const keyFor = (sessionLocalId: string) => `${KEY_PREFIX}${sessionLocalId}`;

/** Mitschnitt ablegen und den Index auf die jüngsten Einträge begrenzen. */
export async function saveQaSessionCapture(capture: QaSessionCapture): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(capture.sessionLocalId), JSON.stringify(capture));
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const next = [capture.sessionLocalId, ...ids.filter(id => id !== capture.sessionLocalId)];
    const keep = next.slice(0, QA_CAPTURE_RETENTION);
    const drop = next.slice(QA_CAPTURE_RETENTION);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(keep));
    for (const id of drop) await AsyncStorage.removeItem(keyFor(id)).catch(() => {});
  } catch {
    // QA-Mitschnitt ist best-effort — ein Fehler darf den Abschluss der
    // Fährte niemals beeinträchtigen.
  }
}

export async function loadQaSessionCapture(sessionLocalId: string): Promise<QaSessionCapture | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(sessionLocalId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QaSessionCapture;
    // v2.0-Mitschnitte (captureVersion 1) bleiben lesbar.
    return parsed?.captureVersion === 1 || parsed?.captureVersion === 2 ? parsed : null;
  } catch {
    return null;
  }
}

export async function listQaSessionCaptureIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function clearQaSessionCaptures(): Promise<void> {
  try {
    const ids = await listQaSessionCaptureIds();
    for (const id of ids) await AsyncStorage.removeItem(keyFor(id)).catch(() => {});
    await AsyncStorage.removeItem(INDEX_KEY);
  } catch { /* best-effort */ }
}

// ── Hilfen für den Recorder ───────────────────────────────────────────────

/** Kumulierte Weglänge einer Punktfolge (m). */
export function pathLength(points: readonly { x: number; y: number }[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return Math.round(d * 100) / 100;
}
