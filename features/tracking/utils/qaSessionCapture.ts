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

export type QaMarkerSource = 'auto' | 'manual' | 'stop_flush' | 'build40' | 'unknown';
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
