import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns, nearestCompatibleTurnEvidence } from '../turnFusion';
import { MotionEvidenceBuffer, type MotionWindowSample } from '../motionTurnEvidence';
import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '../endFixConfirmation';
import { stepTrackEnd, trackEndBlocker, type TrackEndState } from '../guidanceEngine';
import { advanceFinalObjectEndGrace, finalObjectEndGraceActive, INITIAL_FINAL_OBJECT_END_GRACE } from '../finalObjectEndGrace';

const fixtureDir = path.join(__dirname, 'fixtures', 'fieldV61');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));

function replay(data: any) {
  const samples: MotionWindowSample[] = data.motionSamples.map((s: any) => ({
    t: s.tMs, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude,
    accelerationMagnitude: s.accelerationMagnitude, stepDelta: s.stepDelta,
    cadence: s.cadence, movementState: s.movementState,
  }));
  const motion = new MotionEvidenceBuffer(1e9);
  samples.forEach(s => motion.push(s));
  const points = capturedDetectorBuffer(data.detectorPoints);
  return { samples, motion, points, result: fuseTurns(points, {
    turnEvidenceAt: t => t == null ? null : motion.evidenceForTrailing(t),
    turnEvidenceForDirection: (t, dir) => t == null ? null : nearestCompatibleTurnEvidence(t, dir,
      queryT => queryT == null ? null : motion.evidenceFor(queryT)), motionSamples: samples,
  }) };
}

describe('V6.1 real field regression inputs', () => {
  it('verifies originals were reduced to relative, privacy-safe fixtures', () => {
    for (const file of ['V6-F1-1FN-01.json', 'V6-F2-2FN-01.json']) {
      const value = load(file);
      const json = JSON.stringify(value);
      expect(value.sourceSchemaMinor).toBe(6);
      expect(json).not.toMatch(/"(?:lat|lng|latitude|longitude|sessionId|userId|email|createdAt|startedAt|endedAt|absoluteTimestamp)"/i);
      expect(value.detectorPoints.every((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.tMs))).toBe(true);
      expect(value.motionSamples.every((s: any) => Number.isFinite(s.tMs))).toBe(true);
    }
  });

  it('replays the field sensor evidence without injecting expected turns', () => {
    const f1 = replay(load('V6-F1-1FN-01.json'));
    const f2 = replay(load('V6-F2-2FN-01.json'));
    expect(f1.result.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(f1.result.turns[1]).toMatchObject({ direction: 'links', sharpness: 'unresolved' });
    expect(f2.result.corners.map(c => c.kind)).toEqual(['spitz_rechts', 'links', 'rechts', 'links']);
    expect(f2.result.turns.at(-1)).toMatchObject({ direction: 'links', motionAssociationSource: 'nearest_episode' });
    const associatedMotionTimes = f2.result.turns.map(t => t.motionAssociationTimeMs).filter((t): t is number => t != null);
    for (let i = 1; i < associatedMotionTimes.length; i++)
      expect(Math.abs(associatedMotionTimes[i] - associatedMotionTimes[i - 1])).toBeGreaterThan(1500);
    const apex21 = f2.result.diagnostics.find(d => d.apexIndex === 21)!;
    expect(apex21.sharpness).toBe('unresolved');
    expect(apex21.interiorAngleDeg).toBeLessThan(15);
    expect(apex21.confidence).toBeGreaterThan(0.6);
    expect(apex21.motionDirectionOverride).toBe(true);
    expect(f2.result.corners.some(c => c.apexIndex === 21 && c.kind === 'links')).toBe(true);
    expect(f2.result.turns.find(t => t.apexIndex === 21)).toMatchObject({ direction: 'links',
      directionSource: 'motion_override_low_geometry', sharpness: 'unresolved' });
    expect(f1.result.detectorPointCount).toBe(27);
    expect(f2.result.detectorPointCount).toBe(50);
  });

  it('F1 end-model replay admits the recorded approach history and exactly one end', () => {
    const data = load('V6-F1-1FN-01.json');
    let history = { ...INITIAL_END_FIX_HISTORY };
    let state: TrackEndState = 'unseen';
    let events = 0;
    for (const sample of data.search.endEligibilitySamples) {
      const ratio = sample.handlerProgressM / data.distances.recordedLineM;
      const lastSegmentReached = ratio >= 0.75 && sample.handlerDistanceToEndM <= 5;
      history = advanceEndFixHistory(history, {
        tMs: sample.tSec * 1000, distanceToEndM: sample.handlerDistanceToEndM,
        accuracyM: null, lastSegmentReached, handlerProgressRatio: ratio,
      });
      const input = { dogProgressM: sample.dogProjectedProgressM, handlerProgressM: sample.handlerProgressM,
        handlerDistanceToEndM: sample.handlerDistanceToEndM, activeObjectWait: sample.activeObjectWait,
        searchActive: true, trackLengthM: data.distances.recordedLineM, geomDistanceM: null,
        openMandatoryObjects: 0, accuracyM: null, lastSegmentReached,
        approachSeen: history.approachSeen, stableEndFixCount: history.insideCount,
        stableEndFixSpanMs: history.firstInsideMs == null ? 0 : sample.tSec * 1000 - history.firstInsideMs };
      const next = stepTrackEnd(input, state);
      state = next.state;
      if (next.justReached) events++;
    }
    expect(history.approachSeen).toBe(true);
    expect(events).toBe(1);
    expect(state).toBe('completed');
  });

  it('F2 keeps the real final object dwell ahead of end finalization', () => {
    const data = load('V6-F2-2FN-01.json');
    let history = { ...INITIAL_END_FIX_HISTORY };
    let grace = { ...INITIAL_FINAL_OBJECT_END_GRACE };
    let state: TrackEndState = 'unseen';
    let events = 0;
    let eventTime: number | null = null;
    const dwell = data.search.objectDwellDiagnostics.candidates.find((c: any) => c.referenceIndex === 4 && c.accepted);
    expect(dwell).toBeDefined();
    const foundAtSec = dwell.dwellStartedTSec + dwell.dwellDurationSec;
    const accuracyM = data.search.endConfirmationDiagnostics.effectiveEndRadiusM * 2;
    for (const sample of data.search.endEligibilitySamples) {
      const ratio = sample.handlerProgressM / data.distances.recordedLineM;
      const lastSegmentReached = ratio >= 0.75 && sample.handlerDistanceToEndM <= 5;
      history = advanceEndFixHistory(history, { tMs: sample.tSec * 1000,
        distanceToEndM: sample.handlerDistanceToEndM, accuracyM, lastSegmentReached, handlerProgressRatio: ratio });
      const endInput = { dogProgressM: sample.dogProjectedProgressM, handlerProgressM: sample.handlerProgressM,
        handlerDistanceToEndM: sample.handlerDistanceToEndM, activeObjectWait: sample.activeObjectWait,
        searchActive: true, trackLengthM: data.distances.recordedLineM, geomDistanceM: null,
        openMandatoryObjects: 4, accuracyM, lastSegmentReached, approachSeen: history.approachSeen,
        stableEndFixCount: history.insideCount, stableEndFixSpanMs: history.firstInsideMs == null ? 0
          : sample.tSec * 1000 - history.firstInsideMs };
      const eligible = trackEndBlocker({ ...endInput, activeObjectWait: false }) == null;
      const finalPending = sample.tSec < foundAtSec;
      grace = advanceFinalObjectEndGrace(grace, { nowMs: sample.tSec * 1000, eligible,
        pendingFinalObjectNearEnd: finalPending, activeObjectWait: sample.activeObjectWait });
      const next = stepTrackEnd({ ...endInput, finalObjectGraceActive: finalObjectEndGraceActive(grace) }, state);
      state = next.state;
      if (next.justReached) { events++; eventTime = sample.tSec; }
    }
    expect(events).toBe(1);
    expect(eventTime).toBeGreaterThanOrEqual(foundAtSec);
    expect(state).toBe('completed');
  });
});
