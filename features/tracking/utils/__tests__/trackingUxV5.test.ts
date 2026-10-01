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

it('start zone speaks on first eligible entry, then arms and departs only once', () => {
  const entered = nextStartZonePhase('approaching', true, false);
  expect(entered).toBe('start_zone_entered');
  expect(nextStartZonePhase(entered, true, true)).toBe('at_start');
  const departed = nextStartZonePhase('at_start', false, false);
  expect(departed).toBe('departed_start');
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
    expect(trackEndBlocker({ ...base, activeObjectWait: false })).toBe('handler_progress');
  });
  it('handler reaches end once; jitter never fires twice', () => {
    const atEnd = { ...base, handlerProgressM: 99, handlerDistanceToEndM: 1,
      activeObjectWait: false };
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
    ['moving', { speedMps: 1 }], ['angle', { nearAngle: true }],
    ['start', { progressM: 1 }], ['end', { progressM: 49 }],
    ['GPS outage', { gpsOutlier: true }], ['far', { distanceToReferenceM: 8 }],
  ])('rejects %s', (_label, change) => {
    expect(stepObjectDwell(INITIAL_OBJECT_DWELL, { ...sample, ...change }).rejectReason).not.toBeNull();
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
