import { stepTrackEnd, trackEndBlocker } from '../guidanceEngine';
import { INITIAL_OBJECT_DWELL, stepObjectDwell, type ObjectDwellSample } from '../objectDwell';
import { classifyManualAngleGeometry } from '../manualAngleGeometry';
import { assertNoAbsoluteData, buildQaTrackExport } from '../qaTrackExport';
import { boundedPush, TRACKING_UX_QA_LIMITS } from '../trackingUxDiagnostics';
import { freshSearchRunState, sanitizeSearchRunState } from '../../store/searchRunState';
import { nextStartZonePhase } from '../../engine/startApproach';
import { isLaySessionWarmupReady, layStartBlockingReason, releaseLayStartLock } from '../layStartLock';

it('session start uses the same 15 m GPS quality gate as the UI', () => {
  expect(isLaySessionWarmupReady(null)).toBe(false);
  expect(isLaySessionWarmupReady(16)).toBe(false);
  expect(isLaySessionWarmupReady(15)).toBe(true);
});

it('good anchored movement releases immediately; poor fix cannot unlock at 12 seconds', () => {
  expect(releaseLayStartLock({ anchorReady: true, movementConfirmed: true, elapsedMs: 800,
    maximumMs: 12000 })).toBe(true);
  expect(releaseLayStartLock({ anchorReady: false, movementConfirmed: true, elapsedMs: 12000,
    maximumMs: 12000 })).toBe(false);
  expect(releaseLayStartLock({ anchorReady: true, movementConfirmed: false, elapsedMs: 12000,
    maximumMs: 12000 })).toBe(true);
});

it('startup blocker follows GPS evidence, never a minimum clock', () => {
  const maximumMs = 12000;
  expect(layStartBlockingReason({ anchorReady: false, movementConfirmed: false,
    elapsedMs: 2000, maximumMs })).toBe('waiting_for_stable_anchor');
  expect(layStartBlockingReason({ anchorReady: false, movementConfirmed: true,
    elapsedMs: 15000, maximumMs })).toBe('waiting_for_stable_anchor');
  expect(layStartBlockingReason({ anchorReady: true, movementConfirmed: false,
    elapsedMs: 400, maximumMs })).toBe('waiting_for_movement_confirmation');
  expect(layStartBlockingReason({ anchorReady: true, movementConfirmed: true,
    elapsedMs: 600, maximumMs })).toBeNull();
  expect(layStartBlockingReason({ anchorReady: true, movementConfirmed: false,
    elapsedMs: 12000, maximumMs })).toBeNull();
});

it('start zone arms on reached fixes; one lost fix cannot imply departure', () => {
  const entered = nextStartZonePhase('approaching', true, false);
  expect(entered).toBe('start_zone_entered');
  expect(nextStartZonePhase(entered, false, false)).toBe('approaching');
  expect(nextStartZonePhase(entered, true, true)).toBe('at_start');
  expect(nextStartZonePhase('at_start', false, false)).toBe('at_start');
  // The hook promotes to departed_start only after two stable away-fixes.
  const departed = 'departed_start' as const;
  expect(nextStartZonePhase(departed, true, true)).toBe('departed_start');
  expect(nextStartZonePhase(departed, false, false, true)).toBe('search_started');
});

describe('Handler-gated end', () => {
  const base = { dogProgressM: 100, handlerProgressM: 95, trackLengthM: 100,
    geomDistanceM: 0, handlerDistanceToEndM: 5, openMandatoryObjects: 0,
    activeObjectWait: true, searchActive: true };
  it('5 m DogLead alone and object wait never terminate', () => {
    expect(trackEndBlocker(base)).toBe('object_wait');
    expect(stepTrackEnd(base, 'unseen').justReached).toBe(false);
    expect(trackEndBlocker({ ...base, activeObjectWait: false })).toBe('handler_distance');
  });
  it('handler reaches end once; jitter never fires twice', () => {
    const atEnd = { ...base, handlerProgressM: 99, handlerDistanceToEndM: 1,
      activeObjectWait: false, approachSeen: true, stableEndFixCount: 2, stableEndFixSpanMs: 1000 };
    const first = stepTrackEnd(atEnd, 'unseen');
    expect(first).toEqual({ state: 'reached', justReached: true });
    expect(stepTrackEnd({ ...base, handlerDistanceToEndM: 6 }, first.state)).toEqual({ state: 'completed', justReached: false });
  });
});

describe('Conservative object dwell', () => {
  const sample: ObjectDwellSample = { tMs: 1000, speedMps: 0.1, accuracyM: 5,
    progressM: 20, trackLengthM: 50, distanceToReferenceM: 1,
    driftFromStartM: 0.2, nearAngle: false, searchActive: true, gpsOutlier: false };
  it('accepts only a sustained stationary visit near the reference', () => {
    const first = stepObjectDwell(INITIAL_OBJECT_DWELL, sample);
    expect(first.acceptedNow).toBe(false);
    let state = first.state;
    for (const tMs of [3000, 5000, 7000]) state = stepObjectDwell(state, { ...sample, tMs }).state;
    expect(state.accepted).toBe(true);
  });
  it.each([
    ['moving', { speedMps: 1 }], ['start', { progressM: 1 }],
    ['GPS outage', { gpsOutlier: true }], ['far', { distanceToReferenceM: 8 }],
  ])('rejects %s', (_label, change) => {
    expect(stepObjectDwell(INITIAL_OBJECT_DWELL, { ...sample, ...change }).rejectReason).not.toBeNull();
  });
  it.each([{ nearAngle: true }, { progressM: 49 }])('allows a real reference object at angle or end', change => {
    expect(stepObjectDwell(INITIAL_OBJECT_DWELL, { ...sample, ...change }).rejectReason).toBeNull();
  });
  it('short pause and long GPS gap reset the dwell', () => {
    const first = stepObjectDwell(INITIAL_OBJECT_DWELL, sample).state;
    expect(stepObjectDwell(first, { ...sample, tMs: 4000, speedMps: 1 }).state).toEqual(INITIAL_OBJECT_DWELL);
    expect(stepObjectDwell(first, { ...sample, tMs: 7001 }).rejectReason).toBe('gps_gap');
  });
});

describe('Manual OW/BW/GW geometry remains a separate classification', () => {
  const detector = [
    { lat: 0, lng: 0, cumDist: 0, accuracy: 5, t: 1 },
    { lat: 0, lng: 0.0001, cumDist: 10, accuracy: 5, t: 2 },
  ];
  const makeTurn = (direction: 'links' | 'rechts', sharpness: 'normal' | 'spitz') => ({
    apexIndex: 1, direction, sharpness, source: 'gps', confidence: 0.8,
    geometryQuality: 0.9, motion: { direction, directionAgrees: true },
  }) as never;
  it.each(['ow', 'bw', 'gw'] as const)('%s keeps its manual type for L/R/SL/SR', manualMarkerType => {
    for (const [direction, sharpness] of [['links', 'normal'], ['rechts', 'normal'], ['links', 'spitz'], ['rechts', 'spitz']] as const) {
      const output = classifyManualAngleGeometry([{ angleKind: manualMarkerType, lat: 0, lng: 0.0001 }], detector, [makeTurn(direction, sharpness)]);
      expect(output.markers[0]).toMatchObject({ manualMarkerType, geometryDirection: direction,
        geometrySharpness: sharpness === 'spitz' ? 'sharp' : 'normal' });
    }
  });
  it('does not guess when the geometry is unresolved', () => {
    expect(classifyManualAngleGeometry([{ angleKind: 'ow', lat: 1, lng: 1 }], detector, [makeTurn('links', 'normal')]).markers[0])
      .toMatchObject({ manualMarkerType: 'ow', geometryDirection: 'unresolved', geometrySharpness: 'unresolved' });
  });
});

describe('QA v5 legacy compatibility', () => {
  it('keeps old 0–4 exports and promotes additive UX only to 5', () => {
    expect(buildQaTrackExport('id', [], []).schemaMinor).toBe(0);
    const search = { cursor: { referenceGeometryLengthM: 20 } } as never;
    expect(buildQaTrackExport('id', [], [], null, search).schemaMinor).toBe(4);
    const v5 = { cursor: { referenceGeometryLengthM: 20 }, voiceDiagnostics: { events: [], truncated: false } } as never;
    expect(buildQaTrackExport('id', [], [], null, v5).schemaMinor).toBe(5);
    expect(sanitizeSearchRunState({ foundObjectIds: ['legacy'] })).toEqual({ ...freshSearchRunState(), foundObjectIds: ['legacy'] });
  });
  it('rejects absolute timestamps in the new diagnostics', () => {
    const clean = buildQaTrackExport('id', [], [], {
      distances: {},
      counts: {},
      startupDiagnostics: { firstRawFixTSec: 2 },
      voiceDiagnostics: { events: [], truncated: false },
    } as never);
    expect(clean.schemaMinor).toBe(5);
    expect(() => assertNoAbsoluteData(clean)).not.toThrow();
    const unsafe = { ...clean, startupDiagnostics: { firstRawFixTSec: Date.now() / 1000 } };
    expect(() => assertNoAbsoluteData(unsafe as never)).toThrow(/absoluten Startup-Zeitstempel/);
  });
  it('caps diagnostic rows without changing their order', () => {
    const rows: number[] = [];
    for (let i = 0; i <= TRACKING_UX_QA_LIMITS.voice; i++) boundedPush(rows, i, TRACKING_UX_QA_LIMITS.voice);
    expect(rows).toHaveLength(TRACKING_UX_QA_LIMITS.voice);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(TRACKING_UX_QA_LIMITS.voice - 1);
  });
});

describe('QA v6 additive compatibility', () => {
  it('exports bounded relative movement, approach and end diagnostics under schema 6', () => {
    const movement = { samples: [{ tSec: 1.25, accuracyM: 5, acceptedFix: true,
      displacementFromAnchorM: 2, cumulativeStepDelta: 2, motionState: 'walking',
      locomotionEvidence: 'steps', accelerationEvidence: 0.8, candidateSource: 'pedometer', confirmed: true }],
      confirmationTSec: 1.25, confirmationSource: 'pedometer', confirmationConfidence: 0.9,
      fallbackUsed: false, truncated: false };
    const search = { cursor: { referenceGeometryLengthM: 20, samples: [] },
      end: { manualStopTSec: null, eventFired: null },
      geometry: { run: [], replay: [], raw: [], filtered: [] },
      approachFixDiagnostics: { samples: [{ tSec: 2, distanceToStartM: 2.1, accuracyM: 4,
        stable: true, stableCount: 2, zone: 'reached', transition: 'entered_reached' }], truncated: false },
      endConfirmationDiagnostics: { candidateStartedTSec: 40, stableFixCount: 2,
        requiredStableFixCount: 2, handlerDistanceM: 0.8, effectiveEndRadiusM: 2,
        lastSegmentReached: true, activeObjectWait: false, confirmationTSec: 41, rejectionReason: null } };
    const v6 = buildQaTrackExport('id', [], [], { distances: {}, counts: {},
      startupMovementDiagnostics: movement } as never, search as never);
    expect(v6.schemaMinor).toBe(6);
    expect(buildQaTrackExport('id', [], [], { distances: {}, counts: {},
      startupMovementDiagnostics: movement } as never, {
      cursor: { referenceGeometryLengthM: 20 }, voiceDiagnostics: { events: [], truncated: false },
    } as never).schemaMinor).toBe(6);
    expect(v6.startupMovementDiagnostics).toEqual(movement);
    expect(v6.searchDiagnostics?.approachFixDiagnostics).toEqual(search.approachFixDiagnostics);
    expect(v6.searchDiagnostics?.endConfirmationDiagnostics).toEqual(search.endConfirmationDiagnostics);
    expect(() => assertNoAbsoluteData(v6)).not.toThrow();
    expect(JSON.stringify(v6)).not.toMatch(/"(?:lat|lng|latitude|longitude|timestamp|startedAt|endedAt)"/);
    expect(() => assertNoAbsoluteData({ ...v6, startupMovementDiagnostics: {
      ...movement, samples: [{ ...movement.samples[0], tSec: Date.now() / 1000 }],
    } } as never)).toThrow(/Startup-Movement-Zeitstempel/);
    expect(() => assertNoAbsoluteData({ ...v6, searchDiagnostics: { ...v6.searchDiagnostics!,
      approachFixDiagnostics: { samples: [{ ...search.approachFixDiagnostics.samples[0], tSec: Date.now() / 1000 }], truncated: false },
    } } as never)).toThrow(/Search-Zeitstempel/);
  });
  it('uses schemaMinor 6 only for V6 startup or replay/object diagnostics', () => {
    const v5 = buildQaTrackExport('id', [], [], { distances: {}, counts: {},
      startupDiagnostics: { firstRawFixTSec: 2 } } as never);
    expect(v5.schemaMinor).toBe(5);
    const v6 = buildQaTrackExport('id', [], [], { distances: {}, counts: {},
      startupDiagnostics: { firstRawFixTSec: 2, movementConfirmationSource: 'pedometer',
        movementConfirmedTSec: 3, movementStepDelta: 2 } } as never);
    expect(v6.schemaMinor).toBe(6);
    expect(() => assertNoAbsoluteData(v6)).not.toThrow();
    expect(JSON.stringify(v6)).not.toContain('latitude');
    const search = { cursor: { referenceGeometryLengthM: 20 }, replayInsertedForGapCount: 1,
      replayInsertedForGap: [{ sourceIndex: 4, reason: 'spatial_gap' }] } as never;
    expect(buildQaTrackExport('id', [], [], null, search).schemaMinor).toBe(6);
    const preserved = buildQaTrackExport('id', [], [], { distances: {}, counts: {},
      startupDiagnostics: { firstRawFixTSec: 2, movementConfirmationSource: 'fallback' },
      manualAngleGeometryDiagnostics: { markers: [], truncated: false },
      voiceDiagnostics: { events: [], truncated: false } } as never, {
      cursor: { referenceGeometryLengthM: 20 },
      voiceDiagnostics: { events: [], truncated: false },
      startApproachDiagnostics: { reason: null },
      endEligibilityDiagnostics: { samples: [], truncated: false },
      objectDwellDiagnostics: { candidates: [], truncated: false },
      replayUnfillableGapCount: 1,
      replayUnfillableGaps: [{ startSourceIndex: 1, endSourceIndex: 2,
        spatialGapM: 0, temporalGapSec: 8, reason: 'no_observed_intermediate_sample' }],
    } as never);
    expect(preserved.schemaMinor).toBe(6);
    expect(preserved).toHaveProperty('voiceDiagnostics');
    expect(preserved).toHaveProperty('startupDiagnostics');
    expect(preserved).toHaveProperty('manualAngleGeometryDiagnostics');
    for (const key of ['voiceDiagnostics', 'startApproachDiagnostics', 'endEligibilityDiagnostics', 'objectDwellDiagnostics'])
      expect(preserved.searchDiagnostics).toHaveProperty(key);
  });
});
