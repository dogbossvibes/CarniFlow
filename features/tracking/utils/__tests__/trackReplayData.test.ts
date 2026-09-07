import { extractTrackReplayData, isTrackReplayEligible } from '@/features/tracking/utils/trackReplayData';

const baseSegments = [{ id: 's0', index: 0, type: 'straight', startDistanceM: 0, endDistanceM: 10, lengthM: 10, startTimeSec: 0, endTimeSec: 8, durationSec: 8, meanDeviationM: 0.5, medianDeviationM: 0.5, p95DeviationM: 0.5, maxDeviationM: 0.5, timeWithinM15S: 8, timeWithinM2S: 8, timeOutsideM3S: 0, timeOutsideM5S: 0, averageSpeedMps: 1, speedConsistency: 1, analysisConfidence: 1, analysisConfidenceBand: 'excellent', score: 90 }];

function analyticsV2() {
  return {
    analyticsVersion: 2, analysisConfidence: 1, analysisConfidenceBand: 'excellent', analysisConfidenceHint: null,
    deviation: {}, corners: [], objects: [], reacquisition: { count: 0, completedCount: 0, meanSec: null, maxSec: null, medianSec: null },
    pace: {}, trackScore: 90, segments: baseSegments, segmentHighlights: [],
  };
}
function analyticsV1() {
  return {
    analyticsVersion: 1, analysisConfidence: 1, analysisConfidenceBand: 'excellent', analysisConfidenceHint: null,
    deviation: {}, corners: [], objects: [], reacquisition: { count: 0, meanSec: null, maxSec: null }, pace: {}, trackScore: 90,
  };
}

describe('trackReplayData — Kompatibilität (Punkt 18/21)', () => {
  it('Analytics v2 + vollständige Zeitstempel → Replay verfügbar', () => {
    const data = {
      runs: [{ run_points: [{ lat: 1, lng: 1, t: 0 }, { lat: 1.001, lng: 1, t: 2 }, { lat: 1.002, lng: 1, t: 4 }] }],
      track_data: { run: { analytics: analyticsV2() } },
    };
    const result = extractTrackReplayData(data);
    expect(result).not.toBeNull();
    expect(result!.geometry.points).toHaveLength(3);
    expect(isTrackReplayEligible(data)).toBe(true);
  });

  it('Analytics v1 (alt) → kein Replay, kein Crash', () => {
    const data = {
      runs: [{ run_points: [{ lat: 1, lng: 1, t: 0 }, { lat: 1.001, lng: 1, t: 2 }] }],
      track_data: { run: { analytics: analyticsV1() } },
    };
    expect(extractTrackReplayData(data)).toBeNull();
    expect(isTrackReplayEligible(data)).toBe(false);
  });

  it('alter Track komplett ohne analytics → kein Replay, kein Crash', () => {
    const data = { runs: [{ run_points: [{ lat: 1, lng: 1 }, { lat: 1.001, lng: 1 }] }], track_data: { run: {} } };
    expect(extractTrackReplayData(data)).toBeNull();
  });

  it('Analytics v2, aber run_points ohne Zeitstempel (alte Session, additive Erweiterung kam erst später) → kein Replay', () => {
    const data = {
      runs: [{ run_points: [{ lat: 1, lng: 1 }, { lat: 1.001, lng: 1 }] }],
      track_data: { run: { analytics: analyticsV2() } },
    };
    expect(extractTrackReplayData(data)).toBeNull();
  });

  it('Analytics v2, aber Resume-Session (Zeitstempel-Länge passt nicht zu run_points) → kein Replay', () => {
    const data = {
      runs: [{ run_points: [{ lat: 1, lng: 1, t: 0 }, { lat: 1.001, lng: 1 }, { lat: 1.002, lng: 1, t: 4 }] }],
      track_data: { run: { analytics: analyticsV2() } },
    };
    expect(extractTrackReplayData(data)).toBeNull();
  });

  it('komplett leere/fehlende Daten → kein Crash, kein Replay', () => {
    expect(extractTrackReplayData(null)).toBeNull();
    expect(extractTrackReplayData(undefined)).toBeNull();
    expect(extractTrackReplayData({})).toBeNull();
  });
});
