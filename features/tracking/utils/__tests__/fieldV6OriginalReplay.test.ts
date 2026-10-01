import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns } from '../turnFusion';
import { toQaTurnFusion } from '../qaSessionCapture';
import { MotionEvidenceBuffer, motionTurnDirection, type MotionWindowSample } from '../motionTurnEvidence';
import { buildReplayGeometryDetailed } from '../searchReplayGeometry';
import { confirmLayMovement, type LayMovementFix } from '../layMovementConfirmation';
import { calculateAverageAccuracy, calculateDistance, medianLatLng } from '../gpsFilter';
import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '../endFixConfirmation';
import { stepTrackEnd, trackEndBlocker, type TrackEndState } from '../guidanceEngine';
import { statusAfterProgress, statusAtConfirmedEnd } from '../referenceObjectStatus';
import { DEFAULT_APPROACH_CONFIG, isStableReachedFix } from '@/features/tracking/engine/startApproach';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const fixtureDir = path.join(__dirname, 'fixtures', 'fieldV6');
const M = 111_320;
type RelativePoint = { x: number; y: number; tSec: number };

function load(name: 'F1.1.10' | 'F2.1.10') {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, `${name}.json`), 'utf8'));
}

function replayTurns(data: ReturnType<typeof load>) {
  const byTime = new Map<number, MotionWindowSample>();
  for (const candidate of data.candidateMotionEvidence) {
    for (const sample of candidate.samples) {
      const t = Math.round(candidate.evaluatedAtMs + sample.dtMs);
      byTime.set(t, { t, headingDelta: sample.headingDelta,
        rotationMagnitude: sample.rotationMagnitude,
        accelerationMagnitude: sample.accelerationMagnitude,
        stepDelta: sample.stepDelta, cadence: sample.cadence,
        movementState: sample.movementState });
    }
  }
  const motion = new MotionEvidenceBuffer(1e9);
  const stopRing = new MotionEvidenceBuffer(20);
  const samples = [...byTime.values()].sort((a, b) => a.t - b.t);
  samples.forEach(sample => {
    motion.push(sample); stopRing.push(sample);
  });
  const points = capturedDetectorBuffer(data.detectorPoints);
  return {
    gps: fuseTurns(points),
    withMotion: fuseTurns(points, { turnEvidenceAt: t => t == null ? null : motion.evidenceForTrailing(t),
      motionSamples: samples }),
    motion, stopRing,
  };
}

function maxGaps(points: readonly RelativePoint[]) {
  let spatial = 0, temporal = 0;
  for (let i = 1; i < points.length; i++) {
    spatial = Math.max(spatial, Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    temporal = Math.max(temporal, points[i].tSec - points[i - 1].tSec);
  }
  return { spatial, temporal };
}

function replayStart(data: ReturnType<typeof load>) {
  const sessionStartedMs = (data.startup.recordingSessionStartedTSec - data.startup.firstRawFixTSec) * 1000;
  const accepted: LayMovementFix[] = [];
  let anchor: { lat: number; lng: number } | null = null;
  let anchorAccuracyM: number | null = null;
  for (const raw of data.rawFixes) {
    if (raw.tMs < sessionStartedMs) continue;
    const fix: LayMovementFix = { lat: raw.y / M, lng: raw.x / M, accuracy: raw.accuracy, t: raw.tMs };
    const previous = accepted[accepted.length - 1];
    if (fix.accuracy <= 20 && (!previous ||
      (fix.t > previous.t && calculateDistance(previous, fix) / ((fix.t - previous.t) / 1000) <= 12)))
      accepted.push(fix);
    if (!anchor && accepted.length >= 4) {
      anchor = medianLatLng(accepted);
      anchorAccuracyM = calculateAverageAccuracy(accepted.map(f => f.accuracy));
    }
    const movement = confirmLayMovement({ anchor, anchorAccuracyM, acceptedFixes: accepted,
      gaitSamples: [], sessionStartedMs, nowMs: raw.tMs, fallbackAfterMs: 12_000 });
    if (movement.confirmed) return { tSec: raw.tMs / 1000 + data.startup.firstRawFixTSec,
      ...movement };
  }
  return null;
}

function replayEnd(data: ReturnType<typeof load>) {
  const end = data.search.end.referencePosition;
  const length = data.geometryLengthM;
  let history = INITIAL_END_FIX_HISTORY;
  let firstEvent: number | null = null;
  let state: TrackEndState = 'unseen';
  let eventCount = 0;
  for (const fix of data.search.filtered as RelativePoint[]) {
    const sample = data.search.endEligibility
      .filter((s: { tSec: number }) => s.tSec <= fix.tSec + 0.5)
      .at(-1);
    if (!sample) continue;
    const distance = Math.hypot(fix.x - end.x, fix.y - end.y);
    const lastSegmentReached = sample.handlerProgressM / length >= 0.75 && distance <= 5;
    history = advanceEndFixHistory(history, { tMs: fix.tSec * 1000,
      distanceToEndM: distance, accuracyM: null, lastSegmentReached,
      handlerProgressRatio: sample.handlerProgressM / length });
    const input = { dogProgressM: sample.dogProjectedProgressM,
      handlerProgressM: sample.handlerProgressM, handlerDistanceToEndM: distance,
      activeObjectWait: sample.activeObjectWait, searchActive: true,
      trackLengthM: length, geomDistanceM: sample.dogDistanceToEndM,
      openMandatoryObjects: 0, accuracyM: null, lastSegmentReached,
      approachSeen: history.approachSeen, stableEndFixCount: history.insideCount,
      stableEndFixSpanMs: history.firstInsideMs == null ? 0 : fix.tSec * 1000 - history.firstInsideMs };
    const blocker = trackEndBlocker(input);
    const stepped = stepTrackEnd(input, state);
    state = stepped.state;
    if (stepped.justReached) eventCount++;
    if (blocker == null && firstEvent == null) firstEvent = fix.tSec;
  }
  return { history, firstEvent, eventCount };
}

describe('V6 reduced original field exports', () => {
  it('F1 preserves exactly R → L with no additional GPS or IMU-only corner', () => {
    const data = load('F1.1.10');
    const result = replayTurns(data);
    expect(data.schemaMinor).toBe(5);
    expect(result.gps.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(result.withMotion.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(result.withMotion.imuOnly.every(e => e.persisted === false)).toBe(true);
    expect(result.withMotion.turns.map(t => t.geometryQualityLevel)).toEqual(['high', 'medium']);
    expect(result.withMotion.turns.map(t => t.confidence)).toEqual([0.717, 0.788]);
    expect(result.withMotion.turns.map(t => t.geometryQuality)).toEqual([0.699, 0.641]);
  });

  it('F2 apex 15 has a GPS corner and positive signed motion yaw while production fusion lost Motion', () => {
    const data = load('F2.1.10');
    const candidate = data.candidateMotionEvidence.find((c: { apexIndex: number }) => c.apexIndex === 15);
    const production = data.productionTurns.find((t: { apexIndex: number }) => t.apexIndex === 15);
    expect(data.schemaMinor).toBe(5);
    expect(production.motion.available).toBe(false);
    expect(candidate.motionAvailable).toBe(true);
    expect(candidate.turnEvidence).toBe(1);
    const signedYaw = candidate.samples
      .filter((s: { dtMs: number }) => s.dtMs >= candidate.windowStartMs && s.dtMs <= candidate.windowEndMs)
      .reduce((sum: number, s: { headingDelta: number }) => sum + s.headingDelta, 0);
    expect(signedYaw).toBeGreaterThan(100);
    expect(motionTurnDirection({ available: true, signedNetYawDeg: signedYaw })).toBe('links');
    const result = replayTurns(data);
    // The original export includes Motion samples through ~59.9 s. A 20 s
    // stop-time ring therefore begins after the 34.1–35.9 s apex window.
    expect(result.stopRing.span!.firstMs).toBeGreaterThan(35_899);
    expect(result.stopRing.evidenceForTrailing(35_000).available).toBe(false);
    expect(result.motion.evidenceForTrailing(35_000).available).toBe(true);
    const apex = result.withMotion.turns.find(t => t.apexIndex === 15);
    expect(apex).toBeDefined();
    expect(apex?.motion.available).toBe(true);
    expect(apex?.motion.direction).toBe('links');
    expect(apex?.directionSource).toBe('motion_override_low_geometry');
    expect(apex?.motion.signedNetYawDeg).toBeCloseTo(102.7, 1);
    expect(apex?.geometryQuality).toBeCloseTo(0.354, 3);
    expect(apex?.sharpness).toBe('spitz');
    expect(result.withMotion.turns[0].sharpness).toBe('unresolved');
    expect(result.withMotion.turns[0]).toMatchObject({ direction: 'rechts', sharpness: 'unresolved' });
    expect(result.withMotion.corners.map(c => c.kind)).toEqual(['rechts', 'spitz_links', 'rechts', 'links']);
    const exported = toQaTurnFusion({ ...apex!, motionAssociationSource: 'live_cached' }, 0);
    expect(exported).toMatchObject({ direction: 'links', directionSource: 'motion_override_low_geometry',
      sharpness: 'spitz', sharpnessSource: 'geometry', motionAssociationSource: 'live_cached',
      motionDirection: 'links', motionEvidence: apex!.motion.evidence });
    expect(exported.signedNetYawDeg).toBeCloseTo(102.7, 1);
    expect(result.withMotion.imuOnly.every(e => e.persisted === false)).toBe(true);
  });

  it('F2 keeps moving dwell rejected, accepts stationary dwell, and preserves missed objects', () => {
    const data = load('F2.1.10');
    const dwell = data.search.objectDwell;
    expect(dwell).toHaveLength(2);
    expect(dwell.map((c: { accepted: boolean; rejectReason: string | null }) =>
      [c.accepted, c.rejectReason])).toEqual([[false, 'moving'], [true, null]]);
    const objects = data.search.objects;
    expect(statusAfterProgress({ status: 'pending', referenceArcM: objects[0].referenceAtM,
      handlerProgressM: dwell[1].progressM, accuracyM: 4, isFinalObject: false })).toBe('missed');
    expect(statusAfterProgress({ status: 'pending', referenceArcM: objects[2].referenceAtM,
      handlerProgressM: 34.65, accuracyM: 4, isFinalObject: true })).toBe('pending');
    expect(statusAtConfirmedEnd('pending')).toBe('missed');
    expect(statusAtConfirmedEnd('auto_dwell_found')).toBe('auto_dwell_found');
  });

  it('F2 initial ~8.49 m approach cannot be START_REACHED', () => {
    const data = load('F2.1.10');
    expect(isStableReachedFix({ distanceM: data.approach.startDistanceM,
      accuracy: 4, t: 0 }, DEFAULT_APPROACH_CONFIG)).toBe(false);
  });

  for (const name of ['F1.1.10', 'F2.1.10'] as const) {
    it(`${name} fixture contains only relative coordinates and keeps V5 diagnostics`, () => {
      const data = load(name);
      const json = JSON.stringify(data);
      expect(json).not.toMatch(/"(?:lat|lng|latitude|longitude|sessionId|userId|email|startedAt|endedAt)"/);
      expect(data).not.toHaveProperty('sessionId');
      expect(data.schemaMinor).toBe(5);
      expect(Object.values(data.v5DiagnosticsPresent).every(Boolean)).toBe(true);
    });
    it(`${name} start and accepted search fixes replay without invented Motion samples`, () => {
      const data = load(name);
      const start = replayStart(data);
      const end = replayEnd(data);
      expect(start?.source).toBe('fallback');
      expect(start?.stepDelta).toBe(0);
      expect(start?.displacementM).toBeLessThan(1);
      expect(start?.tSec).toBeGreaterThan(16);
      expect(start?.tSec).toBeLessThan(17);
      expect(end.history.approachSeen).toBe(true);
      expect(end.history.insideCount).toBeGreaterThanOrEqual(2);
      expect(end.firstEvent).not.toBeNull();
      expect(end.eventCount).toBe(1);
    });
    it(`${name} replay inserts only observed display samples`, () => {
      const data = load(name);
      const source: RelativePoint[] = data.search.filtered;
      const dense = source.map(p => ({ lat: p.y / M, lng: p.x / M, t: p.tSec }));
      const detail = buildReplayGeometryDetailed(dense)!;
      const points = detail.points.map(p => ({ x: p.lng * M, y: p.lat * M, tSec: p.t }));
      expect(detail.insertedForGap.every(i => source[i.sourceIndex] != null)).toBe(true);
      expect(detail.unfillableGaps.every(g => g.reason === 'no_observed_intermediate_sample'
        && g.endSourceIndex === g.startSourceIndex + 1 && g.temporalGapSec > 5)).toBe(true);
      expect(detail.unfillableGaps.length).toBeGreaterThan(0);
      expect(maxGaps(points).spatial).toBeLessThanOrEqual(2.5);
      expect(maxGaps(points).temporal).toBeGreaterThan(5);
      for (const point of detail.points) expect(dense).toContainEqual(point);
      expect(maxGaps(points).spatial).toBeLessThanOrEqual(data.search.oldMaxReplayGapM);
      expect(maxGaps(points).temporal).toBeLessThanOrEqual(data.search.oldMaxReplayGapSec);
    });
  }
});
