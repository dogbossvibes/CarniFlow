import { QaMotionCapture, QA_MOTION_CANDIDATE_LIMIT, QA_MOTION_SAMPLE_LIMIT } from '../qaMotionCapture';
import { MotionEvidenceBuffer } from '../motionTurnEvidence';
import { motionSampleDiagnostics } from '../motionSampleDiagnostics';
import { buildQaTrackExport, assertNoAbsoluteData } from '../qaTrackExport';
import type { QaSessionCapture } from '../qaSessionCapture';
import type { ShortLegRejectReason } from '../shortLegCornerDetection';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

const T = 1_800_000_000_000;
function authorize(user = 'personal-qa') {
  setDiagnosticsSession(user);
  resolveDiagnosticsAccess(user, getDiagnosticsAccessSnapshot().generation, true);
}
function candidate(apexIndex = 1, rejectReason: ShortLegRejectReason | null = 'no_window_before', t = T + 3000) {
  return { apexIndex, t, headingDeltaDeg: null, rejectReason, motionAdjustment: null };
}
function add(buffer: MotionEvidenceBuffer, from = 0, to = 6000, step = 250) {
  for (let dt = from; dt <= to; dt += step) buffer.push({ t: T + dt,
    headingDelta: 3, rotationMagnitude: 0.2, accelerationMagnitude: 0.1,
    stepDelta: 1, cadence: 100, movementState: 'walking' });
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(T); authorize(); });
afterEach(() => { revokeDiagnosticsAccess(); setDiagnosticsSession(null); jest.useRealTimers(); });

it.each<ShortLegRejectReason>(['no_window_before', 'no_window_after', 'too_close_to_previous', 'no_turn',
  'turn_below_noise', 'turn_not_concentrated', 'angle_unclear', 'low_evidence'])('captures rejected %s without a GPS heading', reason => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  const before = buffer.samplesIn(T, T + 6000);
  capture.observe([candidate(1, reason)], buffer, T, new Set());
  const row = capture.snapshot().candidateMotionEvidence![0];
  expect(row.geometryAtLastEvaluation).toEqual({ rejectReason: reason, headingMeasured: false, accepted: false });
  expect(row.motionAvailable).toBe(true); expect(row.samples.length).toBeGreaterThan(0);
  expect(row.evaluatedAtMs).toBe(3000); expect(row.samples[0].dtMs).toBe(-3000);
  expect(buffer.samplesIn(T, T + 6000)).toEqual(before);
  expect(JSON.stringify(capture.snapshot())).not.toMatch(/personal-qa|latitude|longitude|"t":|1800000/);
});

it('distinguishes absent motion from a rejection and enriches tied evidence with later context', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer();
  capture.observe([candidate()], buffer, T, new Set());
  expect(capture.snapshot().candidateMotionEvidence![0]).toMatchObject({ motionAvailable: false, samples: [], turnEvidence: null });
  add(buffer, 0, 3000); capture.observe([candidate()], buffer, T, new Set());
  const evidence = capture.snapshot().candidateMotionEvidence![0].turnEvidence;
  const prior = buffer.evidenceForTrailing(T + 3000);
  const lookup = jest.spyOn(buffer, 'evidenceForTrailing').mockReturnValue(prior);
  add(buffer, 3250, 6000); capture.observe([candidate(1, null)], buffer, T, new Set([1]));
  const row = capture.snapshot().candidateMotionEvidence![0];
  expect(row.lastSampleAgeMs).toBe(3000); expect(row.turnEvidence).toBe(evidence);
  lookup.mockRestore();
  expect(row.geometryAtLastEvaluation).toMatchObject({ accepted: true, rejectReason: null });
  // Ring eviction does not erase the captured context/strongest evidence.
  add(buffer, 40_000, 41_000); capture.observe([candidate()], buffer, T, new Set());
  expect(capture.snapshot().candidateMotionEvidence![0].samples).toEqual(row.samples);
  expect(capture.snapshot().candidateMotionEvidence![0].turnEvidence).toBe(row.turnEvidence);
});

it('bounds rows/samples, reports omissions and does not resurrect older discarded candidates', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer, 0, 6000, 10);
  const all = Array.from({ length: 150 }, (_, i) => candidate(i));
  const lookup = jest.spyOn(buffer, 'evidenceForTrailing');
  capture.observe(all, buffer, T, new Set());
  expect(lookup).toHaveBeenCalledTimes(QA_MOTION_CANDIDATE_LIMIT);
  const s = capture.snapshot();
  expect(s.candidateMotionEvidence).toHaveLength(QA_MOTION_CANDIDATE_LIMIT);
  expect(s.candidateMotionEvidence![0].apexIndex).toBe(22);
  expect(s.motionCaptureDiagnostics).toMatchObject({ evaluatedCandidateCount: 150, omittedCandidateCount: 22, truncated: true });
  for (const row of s.candidateMotionEvidence!) {
    expect(row.samples).toHaveLength(QA_MOTION_SAMPLE_LIMIT);
    expect(row.contextSamplesTruncated).toBe(true);
    expect(row.firstSampleAgeMs).toBe(-3000); expect(row.lastSampleAgeMs).toBe(3000);
  }
  capture.observe([...all, candidate(150)], buffer, T, new Set());
  expect(capture.snapshot().candidateMotionEvidence![0].apexIndex).toBe(23);
});

it('does not collect without authority and clears on revoke, account change, expiry or a new session', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  revokeDiagnosticsAccess(); capture.observe([candidate()], buffer, T, new Set()); expect(capture.snapshot()).toEqual({});
  authorize(); capture.observe([candidate()], buffer, T, new Set());
  setDiagnosticsSession('other'); expect(capture.snapshot()).toEqual({});
  authorize('other'); capture.observe([candidate(2)], buffer, T, new Set());
  jest.advanceTimersByTime(60_001); expect(capture.snapshot()).toEqual({});
  authorize(); capture.observe([candidate(3)], buffer, T, new Set());
  capture.observe([candidate(4, null, T + 8000)], buffer, T + 7000, new Set());
  expect(capture.snapshot().candidateMotionEvidence!.map(r => r.apexIndex)).toEqual([4]);
  expect(capture.snapshot().candidateMotionEvidence![0].evaluatedAtMs).toBe(1000);
  capture.clear(); expect(capture.snapshot()).toEqual({});
});

it('uses independent snapshots and excludes malformed candidate times', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  capture.observe([candidate(), candidate(2, null, NaN), candidate(3, null, Infinity)], buffer, T, new Set());
  const s = capture.snapshot(); expect(s.candidateMotionEvidence).toHaveLength(1);
  s.candidateMotionEvidence![0].samples[0].headingDelta = 999;
  s.candidateMotionEvidence![0].geometryAtLastEvaluation!.accepted = true;
  expect(capture.snapshot().candidateMotionEvidence![0].samples[0].headingDelta).toBe(3);
  expect(capture.snapshot().candidateMotionEvidence![0].geometryAtLastEvaluation!.accepted).toBe(false);
});

it('passes relative-only export and advertises schema 2.11 with retention metadata', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  capture.observe([candidate()], buffer, T, new Set());
  const stored: QaSessionCapture = { captureVersion: 2, sessionLocalId: 'local', durationMs: 6000,
    counts: { rawFixes: 0, acceptedFixes: 0, rejectedFixes: 0, detectorPoints: 0, linePoints: 0 },
    distances: { rawPathM: 0, detectorPathM: 0, recordedLineM: 0, storeDistanceM: 0 },
    rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [], ...capture.snapshot() };
  const exported = buildQaTrackExport('local', [], [], stored);
  expect(exported.schemaMinor).toBe(11);
  expect(exported.motionCaptureDiagnostics).toEqual(stored.motionCaptureDiagnostics);
  expect(() => assertNoAbsoluteData(exported)).not.toThrow();
  exported.candidateMotionEvidence![0].samples[0].dtMs = Infinity;
  expect(() => assertNoAbsoluteData(exported)).toThrow();
});


it('keeps section indices and motion contexts isolated while retaining earlier bounded evidence', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  capture.observe([candidate(1)], buffer, T, new Set());
  const first = capture.snapshot().candidateMotionEvidence![0];
  buffer.clear(); add(buffer, 20_000, 26_000);
  capture.observe([candidate(1, null, T + 23_000)], buffer, T, new Set([1]), 10);
  const rows = capture.snapshot().candidateMotionEvidence!;
  expect(rows.map(row => row.apexIndex)).toEqual([1, 11]);
  expect(rows[0]).toEqual(first);
  expect(rows[1].evaluatedAtMs).toBe(23_000);
  expect(rows[1].geometryAtLastEvaluation?.accepted).toBe(true);
  expect(rows[1].samples.every(sample => Math.abs(sample.dtMs) <= 6000)).toBe(true);
  expect(capture.snapshot().motionCaptureDiagnostics).toMatchObject({ evaluatedCandidateCount: 2, omittedCandidateCount: 0 });
  capture.observe([], buffer, T, new Set(), 20);
  expect(capture.snapshot().candidateMotionEvidence).toEqual(rows);
});

it('enforces the session-wide candidate limit across multiple sections', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer(); add(buffer);
  capture.observe(Array.from({ length: 100 }, (_, i) => candidate(i)), buffer, T, new Set());
  capture.observe(Array.from({ length: 70 }, (_, i) => candidate(i)), buffer, T, new Set(), 200);
  const snapshot = capture.snapshot();
  expect(snapshot.candidateMotionEvidence).toHaveLength(128);
  expect(snapshot.candidateMotionEvidence![0].apexIndex).toBe(42);
  expect(snapshot.candidateMotionEvidence!.at(-1)!.apexIndex).toBe(269);
  expect(snapshot.motionCaptureDiagnostics).toMatchObject({ evaluatedCandidateCount: 170, omittedCandidateCount: 42, truncated: true });
});

it('retains relative native quality through capture and export without changing derived evidence', () => {
  const capture = new QaMotionCapture(); const buffer = new MotionEvidenceBuffer();
  const diagnostics = motionSampleDiagnostics({ timestamp: T + 3000, qualityVersion: 3,
    headingDelta: 3, accelerationMagnitude: 0.1, rotationMagnitude: 0.2, stepDelta: 2,
    cadence: 90, movementState: 'walking', motionConfidence: 1, activityConfidence: 'high',
    runId: 'private-native-run', windowStartTimestamp: T + 2800, windowEndTimestamp: T + 3000,
    emittedAtTimestamp: T + 3050, deviceMotionSampleCount: 5, deviceMotionAgeMs: 50,
    pedometerAgeMs: 100, pedometerIntervalMs: 1000, discardedWindowCount: 2,
    pedometerCumulativeSteps: 4, pedometerPublishedStepCount: 2, pedometerPendingStepCount: 0,
    pedometerDiscardedStepCount: 2, pedometerStepWindowStartTimestamp: T + 1900,
    pedometerStepWindowEndTimestamp: T + 2900 });
  buffer.push({ t: T + 3000, headingDelta: 3, rotationMagnitude: 0.2, accelerationMagnitude: 0.1,
    stepDelta: 2, cadence: 90, movementState: 'walking', diagnostics });
  const before = buffer.evidenceForTrailing(T + 3000);
  capture.observe([candidate()], buffer, T, new Set());
  const snapshot = capture.snapshot();
  expect(snapshot.candidateMotionEvidence![0].samples[0].diagnostics).toEqual(diagnostics);
  snapshot.candidateMotionEvidence![0].samples[0].diagnostics!.discardedWindowCount = 99;
  expect(capture.snapshot().candidateMotionEvidence![0].samples[0].diagnostics!.discardedWindowCount).toBe(2);
  expect(buffer.evidenceForTrailing(T + 3000)).toEqual(before);
  const stored: QaSessionCapture = { captureVersion: 2, sessionLocalId: 'local', durationMs: 6000,
    counts: { rawFixes: 0, acceptedFixes: 0, rejectedFixes: 0, detectorPoints: 0, linePoints: 0 },
    distances: { rawPathM: 0, detectorPathM: 0, recordedLineM: 0, storeDistanceM: 0 },
    rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [], ...capture.snapshot() };
  const exported = buildQaTrackExport('local', [], [], stored);
  expect(exported.schemaMinor).toBe(13);
  expect(() => assertNoAbsoluteData(exported)).not.toThrow();
  expect(JSON.stringify(exported)).not.toMatch(/private-native-run|1800000000000|runId|Timestamp/);
  exported.candidateMotionEvidence![0].samples[0].diagnostics!.emittedAtOffsetMs = T;
  expect(() => assertNoAbsoluteData(exported)).toThrow('native Motion-Diagnosedaten');
});
