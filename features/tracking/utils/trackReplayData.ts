// Reine, testbare Extraktion der Replay-Grundlage aus bereits geladenen
// Detail-Daten — DIESELBE Quelle wie app/track/[id].tsx (data.runs[0].
// run_points + data.track_data.run.analytics), keine zweite Datenquelle. Wird
// sowohl für die Sichtbarkeit des "Fährte wiedergeben"-Buttons als auch im
// Replay-Screen selbst verwendet, damit beide exakt denselben Massstab
// anlegen (Punkt 18: alte Fährten ohne Core Motion/Analytics v2/Zeitstempel
// dürfen nicht crashen — Replay wird für sie schlicht nicht angeboten).

import { isTrackAnalyticsV2, type TrackAnalyticsV2 } from '@/features/tracking/engine/trackSegmentAnalysis';
import { isReplayAvailable, type ReplayGeometry } from '@/features/tracking/engine/trackReplay';

export interface TrackReplayData {
  geometry: ReplayGeometry;
  analytics: TrackAnalyticsV2;
}

interface RawRunPoint { lat: number; lng: number; t?: number }

export function extractTrackReplayData(data: unknown): TrackReplayData | null {
  const d = (data ?? {}) as {
    runs?: { run_points?: RawRunPoint[] }[];
    track_data?: { run?: { analytics?: unknown } };
  };
  const analytics = d.track_data?.run?.analytics;
  if (!isTrackAnalyticsV2(analytics as never)) return null;

  const rawPoints = d.runs?.[0]?.run_points ?? [];
  const hasAllTimestamps = rawPoints.length > 0 && rawPoints.every(p => typeof p.t === 'number');
  const geometry: ReplayGeometry = {
    points: rawPoints.map(p => ({ latitude: p.lat, longitude: p.lng })),
    pointsTimeSec: hasAllTimestamps ? rawPoints.map(p => p.t as number) : [],
  };
  if (!isReplayAvailable(geometry)) return null;

  return { geometry, analytics: analytics as TrackAnalyticsV2 };
}

export function isTrackReplayEligible(data: unknown): boolean {
  return extractTrackReplayData(data) != null;
}
