// ──────────────────────────────────────────────────────────────────────────
// Track Heatmap — zerlegt die abgesuchte Ist-Linie in kurze, eingefärbte
// Polyline-Teile statt einer echten Flächen-Heatmap (Punkt 10/11). Die
// "kurzen Segmente" sind bewusst dieselben Segmente wie die Segmentanalyse
// (trackSegmentAnalysis.ts, typischerweise wenige bis wenige Dutzend Meter
// lang) — KEINE zweite, feinere Datenquelle pro GPS-Punkt: die bereits
// berechneten Segment-Aggregate (meanDeviationM/analysisConfidenceBand/
// averageSpeedMps) reichen für eine aussagekräftige Einfärbung, ohne
// zusätzliche hochfrequente Rohdaten zu speichern (Punkt 17).
//
// WICHTIG (Punkt 10): Farben sind NIE pauschal "grün = gut / rot = schlecht"
// formuliert, wenn es um reine Sensor-/GPS-Datenqualität geht (Confidence-
// Modus) — nur beim Abweichungs-Modus geht es tatsächlich um Spurtreue.
// ──────────────────────────────────────────────────────────────────────────

import { FULL_DEV_M, ON_TRACK_M, confidenceBand, type ConfidenceBand } from '@/features/tracking/engine/trackAnalytics';
import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';
import type { ReplayGeometry, ReplayGeometryPoint } from '@/features/tracking/engine/trackReplay';

export type HeatmapMetric = 'deviation' | 'confidence' | 'pace';

export type DeviationBand = 'very_low' | 'low' | 'medium' | 'high';
export type PaceBand = 'slow' | 'normal' | 'fast';
export type HeatmapBand = DeviationBand | ConfidenceBand | PaceBand;

/** 5 m — dieselbe Grenze wie DeviationStats.timeOutsideM5S, eine Quelle der Wahrheit. */
export const DEVIATION_BAND_HIGH_M = 5;

export function deviationBand(meanDeviationM: number): DeviationBand {
  if (meanDeviationM <= FULL_DEV_M) return 'very_low';       // ≤1.5 m
  if (meanDeviationM <= ON_TRACK_M) return 'low';             // ≤3 m
  if (meanDeviationM <= DEVIATION_BAND_HIGH_M) return 'medium'; // ≤5 m
  return 'high';
}

// Perzentil-basiert relativ zur EIGENEN Session (Punkt 14) — kein globaler,
// über alle Nutzer geltender Schwellenwert.
export function pacePercentiles(segments: AnalyticsSegment[]): { p33: number; p66: number } {
  const speeds = segments.map(s => s.averageSpeedMps).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!speeds.length) return { p33: 0, p66: 0 };
  const at = (p: number) => speeds[Math.min(speeds.length - 1, Math.floor(speeds.length * p))];
  return { p33: at(0.33), p66: at(0.66) };
}

export function paceBand(speedMps: number, percentiles: { p33: number; p66: number }): PaceBand {
  if (speedMps <= percentiles.p33) return 'slow';
  if (speedMps >= percentiles.p66) return 'fast';
  return 'normal';
}

// Feste Farbpalette je Band — bewusst NICHT "rot=schlecht" für Confidence
// (siehe Modulkommentar); Confidence nutzt eine neutrale Grausättigung statt
// Ampelfarben, Abweichung/Tempo dürfen eine echte Bewertungsskala zeigen.
export const DEVIATION_BAND_COLORS: Record<DeviationBand, string> = {
  very_low: '#15E6C3', low: '#8FE6C9', medium: '#F5C043', high: '#E5484D',
};
export const CONFIDENCE_BAND_COLORS: Record<ConfidenceBand, string> = {
  excellent: '#8FD8FF', good: '#5FB8E0', limited: '#8A93A6', unreliable: '#5A6070',
};
export const PACE_BAND_COLORS: Record<PaceBand, string> = {
  slow: '#8FE6C9', normal: '#15E6C3', fast: '#3FA8E0',
};

export interface HeatmapPart {
  segmentId: string;
  segmentIndex: number;
  coordinates: ReplayGeometryPoint[];
  color: string;
  band: HeatmapBand;
}

export function heatmapColorForSegment(seg: AnalyticsSegment, metric: HeatmapMetric, percentiles: { p33: number; p66: number }): { color: string; band: HeatmapBand } | null {
  if (metric === 'deviation') {
    if (seg.meanDeviationM == null) return null;
    const band = deviationBand(seg.meanDeviationM);
    return { color: DEVIATION_BAND_COLORS[band], band };
  }
  if (metric === 'confidence') {
    const band = confidenceBand(seg.analysisConfidence);
    return { color: CONFIDENCE_BAND_COLORS[band], band };
  }
  // pace
  if (seg.averageSpeedMps == null) return null;
  const band = paceBand(seg.averageSpeedMps, percentiles);
  return { color: PACE_BAND_COLORS[band], band };
}

// Schneidet die Replay-Geometrie (points/pointsTimeSec) anhand der
// Segment-Zeitfenster in kurze, farbige Teile. Segmente ohne anwendbare
// Metrik (z. B. 0 Samples) werden übersprungen (kein erfundener Wert).
export function buildHeatmapParts(geometry: ReplayGeometry, segments: AnalyticsSegment[], metric: HeatmapMetric): HeatmapPart[] {
  if (geometry.points.length !== geometry.pointsTimeSec.length || geometry.points.length < 2) return [];
  const percentiles = metric === 'pace' ? pacePercentiles(segments) : { p33: 0, p66: 0 };
  const parts: HeatmapPart[] = [];

  for (const seg of segments) {
    if (seg.startTimeSec == null || seg.endTimeSec == null) continue;
    const colorInfo = heatmapColorForSegment(seg, metric, percentiles);
    if (!colorInfo) continue;
    const coords: ReplayGeometryPoint[] = [];
    for (let i = 0; i < geometry.points.length; i++) {
      const t = geometry.pointsTimeSec[i];
      if (t >= seg.startTimeSec && t <= seg.endTimeSec) coords.push(geometry.points[i]);
    }
    if (coords.length < 2) continue;   // zu kurz für eine sichtbare Teilstrecke
    parts.push({ segmentId: seg.id, segmentIndex: seg.index, coordinates: coords, color: colorInfo.color, band: colorInfo.band });
  }
  return parts;
}
