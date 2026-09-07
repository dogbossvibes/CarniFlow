// ──────────────────────────────────────────────────────────────────────────
// Track Replay Engine — REIN deterministisch, kein Rendering, kein React.
// Bewegt den Replay-Puck entlang der TATSÄCHLICH akzeptierten/gefilterten
// Absuche-Geometrie (run_points + pointsTimeSec, additiv aus Punkt 17 der
// Segmentanalyse-Nachbesserung) — niemals Rohes GPS, niemals ein von der
// Sensor-Fusion verworfener Outlier-Sprung (die Geometrie enthält solche
// Punkte bereits gar nicht, siehe useSearchRecorder.ts).
// ──────────────────────────────────────────────────────────────────────────

import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';

export type ReplaySpeed = 0.5 | 1 | 2 | 4;
export const REPLAY_SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 4];

export interface ReplayGeometryPoint { latitude: number; longitude: number }

export interface ReplayGeometry {
  points: ReplayGeometryPoint[];
  /** Sekunden seit Absuche-Start, gleiche Länge/Reihenfolge wie `points`. */
  pointsTimeSec: number[];
}

// Punkt 18/21: alte Fährten ohne Zeitstempel (Analytics v1, Resume-Sessions,
// Sessions von vor dieser Erweiterung) bieten kein Replay an — kein Crash,
// einfach `false`.
export function isReplayAvailable(geometry: ReplayGeometry | null | undefined): boolean {
  if (!geometry) return false;
  const { points, pointsTimeSec } = geometry;
  return points.length >= 2 && pointsTimeSec.length === points.length;
}

export interface ReplayState {
  playing: boolean;
  elapsedSec: number;
  speed: ReplaySpeed;
}

export function initialReplayState(): ReplayState {
  return { playing: false, elapsedSec: 0, speed: 1 };
}

function totalDurationSec(geometry: ReplayGeometry): number {
  const t = geometry.pointsTimeSec;
  return t.length ? t[t.length - 1] : 0;
}

function clampElapsed(sec: number, geometry: ReplayGeometry): number {
  return Math.max(0, Math.min(sec, totalDurationSec(geometry)));
}

// Ein "Tick" des Replays: `deltaRealSec` sind ECHT vergangene Sekunden
// (typischerweise aus requestAnimationFrame-Deltas) — die Replay-Zeit
// schreitet um `deltaRealSec * speed` fort. Stoppt automatisch am Ende
// (kein Loop, kein Überlaufen).
export function tickReplay(state: ReplayState, deltaRealSec: number, geometry: ReplayGeometry): ReplayState {
  if (!state.playing || deltaRealSec <= 0) return state;
  const next = clampElapsed(state.elapsedSec + deltaRealSec * state.speed, geometry);
  const reachedEnd = next >= totalDurationSec(geometry);
  return { ...state, elapsedSec: next, playing: !reachedEnd };
}

export function playReplay(state: ReplayState, geometry: ReplayGeometry): ReplayState {
  // Am Ende erneut "Play" → von vorne starten (erwartetes Verhalten, kein Stillstand).
  if (state.elapsedSec >= totalDurationSec(geometry)) return { ...state, elapsedSec: 0, playing: true };
  return { ...state, playing: true };
}

export function pauseReplay(state: ReplayState): ReplayState {
  return { ...state, playing: false };
}

export function seekReplay(state: ReplayState, targetSec: number, geometry: ReplayGeometry): ReplayState {
  return { ...state, elapsedSec: clampElapsed(targetSec, geometry) };
}

export function setReplaySpeed(state: ReplayState, speed: ReplaySpeed): ReplayState {
  return { ...state, speed };
}

// Fortschritt 0..1 — für Slider/Progress-Anzeigen.
export function replayProgress(state: ReplayState, geometry: ReplayGeometry): number {
  const total = totalDurationSec(geometry);
  return total > 0 ? Math.max(0, Math.min(1, state.elapsedSec / total)) : 0;
}

// mm:ss-Anzeige ("03:42"), robust gegen negative/NaN-Eingaben.
export function formatReplayClock(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Puck-Position zu einem Zeitpunkt: lineare Interpolation zwischen den beiden
// umgebenden Geometriepunkten. `null` nur, wenn kein Replay möglich ist
// (isReplayAvailable false) — Aufrufer prüft das vorher.
export function replayPositionAt(geometry: ReplayGeometry, elapsedSec: number): ReplayGeometryPoint | null {
  if (!isReplayAvailable(geometry)) return null;
  const { points, pointsTimeSec } = geometry;
  if (elapsedSec <= pointsTimeSec[0]) return points[0];
  if (elapsedSec >= pointsTimeSec[pointsTimeSec.length - 1]) return points[points.length - 1];
  for (let i = 1; i < pointsTimeSec.length; i++) {
    if (pointsTimeSec[i] >= elapsedSec) {
      const t0 = pointsTimeSec[i - 1], t1 = pointsTimeSec[i];
      const span = t1 - t0;
      const t = span > 0 ? (elapsedSec - t0) / span : 0;
      const a = points[i - 1], b = points[i];
      return { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t };
    }
  }
  return points[points.length - 1];
}

// Wie viele Geometriepunkte bis einschliesslich elapsedSec bereits "gelaufen"
// sind — für eine wachsende Ist-Spur-Polyline während des Replays (Punkt 8).
export function replayTraveledPoints(geometry: ReplayGeometry, elapsedSec: number): ReplayGeometryPoint[] {
  if (!isReplayAvailable(geometry)) return [];
  const { points, pointsTimeSec } = geometry;
  const out: ReplayGeometryPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (pointsTimeSec[i] > elapsedSec) break;
    out.push(points[i]);
  }
  const puck = replayPositionAt(geometry, elapsedSec);
  if (puck && out.length < points.length) out.push(puck);
  return out;
}

// ── Timeline-Events (Punkt 9) ─────────────────────────────────────────────

export type ReplayEventType = 'corner' | 'object' | 'reacquisition' | 'high_deviation';

export interface ReplayEvent {
  type: ReplayEventType;
  timeSec: number;
  segmentId: string;
  segmentIndex: number;
}

/** Ab dieser mittleren Segment-Abweichung gilt ein Geraden-Segment als "stärkere Abweichung" für die Timeline (Punkt 9). */
export const HIGH_DEVIATION_TIMELINE_THRESHOLD_M = 3;

export function replayEventsFromSegments(segments: AnalyticsSegment[]): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  for (const seg of segments) {
    if (seg.startTimeSec == null) continue;
    if (seg.type === 'corner') events.push({ type: 'corner', timeSec: seg.startTimeSec, segmentId: seg.id, segmentIndex: seg.index });
    else if (seg.type === 'object_zone') events.push({ type: 'object', timeSec: seg.startTimeSec, segmentId: seg.id, segmentIndex: seg.index });
    else if (seg.type === 'reacquisition') events.push({ type: 'reacquisition', timeSec: seg.startTimeSec, segmentId: seg.id, segmentIndex: seg.index });
    else if (seg.type === 'straight' && seg.meanDeviationM != null && seg.meanDeviationM >= HIGH_DEVIATION_TIMELINE_THRESHOLD_M) {
      events.push({ type: 'high_deviation', timeSec: seg.startTimeSec, segmentId: seg.id, segmentIndex: seg.index });
    }
  }
  return events.sort((a, b) => a.timeSec - b.timeSec);
}

// Welches Segment ist zu einem gegebenen Zeitpunkt aktiv (Tap-Highlight in
// der Timeline, Segment-Detailkarte beim Antippen eines Events)?
export function segmentAtTime(segments: AnalyticsSegment[], elapsedSec: number): AnalyticsSegment | null {
  for (const seg of segments) {
    if (seg.startTimeSec == null || seg.endTimeSec == null) continue;
    if (elapsedSec >= seg.startTimeSec && elapsedSec <= seg.endTimeSec) return seg;
  }
  return null;
}
