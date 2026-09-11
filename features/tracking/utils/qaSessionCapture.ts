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

export interface QaSessionCapture {
  captureVersion: 1;
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
  autoDiagnostics: QaAutoDiagnostic[];
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
    return parsed?.captureVersion === 1 ? parsed : null;
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
