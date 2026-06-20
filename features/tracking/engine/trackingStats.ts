// Live-Statistik der Aufnahme: zählt Roh-/akzeptierte/verworfene Fixes und
// liefert einen GpsStats-Snapshot für die UI. Plus computeSessionStats():
// aggregierte Kennzahlen am Session-Ende (Debug-Panel + Persistenz).
import { EMPTY_GPS_STATS, type GpsStats, type TrackPointStatus, type TrackPointQuality } from '@/features/tracking/engine/types';
import { getGpsQuality } from '@/features/tracking/engine/gpsQuality';
import { calculateDistanceMeters } from '@/features/tracking/engine/trackingMath';
import type { LatLng } from '@/lib/trackGuidance';

export class TrackingStats {
  private raw = 0;
  private filtered = 0;
  private rejected = 0;
  private best: number | null = null;

  record(accepted: boolean, accuracy: number | null): void {
    this.raw += 1;
    if (accepted) this.filtered += 1; else this.rejected += 1;
    if (accuracy != null && (this.best == null || accuracy < this.best)) this.best = accuracy;
  }

  snapshot(lastAccuracy: number | null): GpsStats {
    return {
      rawCount: this.raw,
      filteredCount: this.filtered,
      rejectedCount: this.rejected,
      rejectionRate: this.raw > 0 ? this.rejected / this.raw : 0,
      lastAccuracy,
      bestAccuracy: this.best,
    };
  }

  reset(): void {
    this.raw = 0; this.filtered = 0; this.rejected = 0; this.best = null;
  }
}

export { EMPTY_GPS_STATS };

// ── Session-Aggregat (Ende der Aufnahme) ─────────────────────

export interface StatsPoint extends LatLng {
  accuracy?: number | null;
  t?:        number;
  status?:   TrackPointStatus;
}
export interface StatsRejected { reason?: string }
export interface StatsGnssSample {
  satelliteCount?: number | null;
  usedInFixCount?: number | null;
  averageCn0DbHz?: number | null;
}
// Optionale Status-Zeitleiste (jeder verarbeitete Punkt mit Status + t) für
// Stillstandsdauer / Drift / Winkel. Fehlt sie, gibt es Fallbacks.
export interface StatusEvent { status: TrackPointStatus; t: number }

export interface SessionStatsInput {
  rawPoints:       StatsPoint[];
  filteredPoints:  StatsPoint[];
  rejectedPoints:  StatsRejected[];
  objectCount:     number;
  statusTimeline?: StatusEvent[];
  gnssSamples?:    StatsGnssSample[];   // Android optional
}

export interface SessionStatsResult {
  averageAccuracy:        number | null;
  bestAccuracy:           number | null;
  worstAccuracy:          number | null;
  rawDistanceMeters:      number;
  filteredDistanceMeters: number;
  rejectedCount:          number;
  rejectionRate:          number;        // 0..1
  stationaryDurationMs:   number;
  driftCount:             number;
  sharpTurnCount:         number;
  objectCount:            number;
  gpsQualityDistribution: Record<TrackPointQuality, number>;
  averageSatelliteCount:  number | null; // Android optional
  averageUsedInFixCount:  number | null; // Android optional
  averageCn0DbHz:         number | null; // Android optional
}

function pathLengthMeters(pts: StatsPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += calculateDistanceMeters(pts[i - 1], pts[i]);
  return d;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const round = (n: number | null, dp = 2): number | null =>
  n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp;

// Aggregierte Session-Kennzahlen aus den gesammelten Daten. Reine Funktion.
export function computeSessionStats(input: SessionStatsInput): SessionStatsResult {
  const { rawPoints, filteredPoints, rejectedPoints, objectCount, statusTimeline, gnssSamples } = input;

  const accs = filteredPoints.map(p => p.accuracy).filter((a): a is number => a != null);

  const rejectedCount = rejectedPoints.length;
  const rejectionRate = rawPoints.length > 0 ? rejectedCount / rawPoints.length : 0;

  // GPS-Qualitätsverteilung über die akzeptierten (gefilterten) Punkte.
  const gpsQualityDistribution: Record<TrackPointQuality, number> = { excellent: 0, good: 0, poor: 0, bad: 0 };
  for (const p of filteredPoints) gpsQualityDistribution[getGpsQuality(p.accuracy)] += 1;

  // Status-Kennzahlen: bevorzugt aus der Zeitleiste, sonst Fallbacks.
  let driftCount = 0, sharpTurnCount = 0, stationaryDurationMs = 0;
  if (statusTimeline && statusTimeline.length > 0) {
    for (let i = 0; i < statusTimeline.length; i++) {
      const e = statusTimeline[i];
      if (e.status === 'drift') driftCount += 1;
      if (e.status === 'sharp_turn') sharpTurnCount += 1;
      if (e.status === 'stationary' && i + 1 < statusTimeline.length) {
        stationaryDurationMs += Math.max(0, statusTimeline[i + 1].t - e.t);
      }
    }
  } else {
    driftCount = rejectedPoints.filter(r => r.reason === 'DRIFT_DETECTED').length;
    sharpTurnCount = filteredPoints.filter(p => p.status === 'sharp_turn').length;
  }

  const sat  = (gnssSamples ?? []).map(g => g.satelliteCount).filter((n): n is number => n != null);
  const used = (gnssSamples ?? []).map(g => g.usedInFixCount).filter((n): n is number => n != null);
  const cn0  = (gnssSamples ?? []).map(g => g.averageCn0DbHz).filter((n): n is number => n != null);

  return {
    averageAccuracy:        round(average(accs)),
    bestAccuracy:           accs.length ? Math.min(...accs) : null,
    worstAccuracy:          accs.length ? Math.max(...accs) : null,
    rawDistanceMeters:      round(pathLengthMeters(rawPoints), 1) ?? 0,
    filteredDistanceMeters: round(pathLengthMeters(filteredPoints), 1) ?? 0,
    rejectedCount,
    rejectionRate,
    stationaryDurationMs,
    driftCount,
    sharpTurnCount,
    objectCount,
    gpsQualityDistribution,
    averageSatelliteCount:  round(average(sat), 1),
    averageUsedInFixCount:  round(average(used), 1),
    averageCn0DbHz:         round(average(cn0), 1),
  };
}
