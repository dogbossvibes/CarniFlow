import { extractTrackReplayData, isTrackReplayEligible } from '@/features/tracking/utils/trackReplayData';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import { runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';
import { computeTrackAnalyticsV3 } from '@/features/tracking/engine/trackAnalyticsV3';

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

  it('16) Version 3 erhält G-Nummer und Material im Replay nach JSON-Roundtrip', () => {
    const data = {
      runs: [{ run_points: [{ lat: 1, lng: 1, t: 0 }, { lat: 1.001, lng: 1, t: 2 }] }],
      track_data: { run: { analytics: {
        ...analyticsV2(), analyticsVersion: 3,
        objects: [{ objectId: 'g2', objectIndex: 2, material: 'leder', alongTrackPositionM: 284, status: 'likely_contact' }],
      } } },
    };
    const result = extractTrackReplayData(JSON.parse(JSON.stringify(data)));
    expect(result?.analytics.analyticsVersion).toBe(3);
    expect(result?.analytics.objects[0]).toMatchObject({ objectId: 'g2', objectIndex: 2, material: 'leder' });
  });

  it('15) Gegenstände bleiben nach lokalem Save/Reload mit stabiler ID und Material erhalten', () => {
    const analytics = computeTrackAnalyticsV3({
      samples: [0, 2, 4, 6, 8].map((distance, index) => ({ atM: distance, tSec: index * 2, devM: 0.5, confidence: 0.95, speedMps: 1 })),
      corners: [], objects: [{ atM: 4, material: 'filz', found: false, objectId: 'stable-id', objectIndex: 1, legIndex: 1 }],
      breaks: [], trackLengthM: 8, durationS: 8,
    });
    const run = buildRunResultPayload({
      runId: 'run', sessionId: 'session', startedAtMs: 0, endedAtMs: 8000,
      result: { durationS: 8, score: 0, deviationAvgM: 0.5, foundObjects: 0, totalObjects: 1, distanceM: 8, breaks: [], points: [
        { latitude: 47, longitude: 8 }, { latitude: 47.0001, longitude: 8 },
      ] },
      pointsTimeSec: [0, 8], analytics,
    });
    const loaded = runSupplementFromPayload(JSON.stringify({ run }));
    expect(loaded?.track_data.run.analytics.objects[0]).toMatchObject({ objectId: 'stable-id', objectIndex: 1, material: 'filz', legIndex: 1 });
    expect(loaded?.runs[0].run_points).toHaveLength(2);
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
