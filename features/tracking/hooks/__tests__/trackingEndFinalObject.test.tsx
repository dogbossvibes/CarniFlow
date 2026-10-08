/** Synthetic regressions through the real recorder and end hook, wired as in run.tsx. */
import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type SearchObject } from '../useSearchRecorder';
import { useTrackEndGuidance } from '../useTrackEndGuidance';
import { freshSearchRunState, type SearchRunState } from '../../store/searchRunState';
import { haversineM } from '../../utils/searchGeometry';
import { hapticSuccess } from '../../utils/haptics';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));
jest.mock('@/i18n/config', () => ({ __esModule: true, default: { t: () => 'end', language: 'de-CH' } }));
jest.mock('../useTrackVoiceGuidance', () => ({ speechLanguage: () => 'de-DE' }));
jest.mock('../../utils/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('../../utils/voiceEvents', () => ({ requestVoice: jest.fn() }));
jest.mock('@/features/tracking/native/motionClient', () => ({ motionClient: {
  start: jest.fn(async () => true), stop: jest.fn(async () => {}),
  onSample: () => ({ remove: jest.fn() }), onError: () => ({ remove: jest.fn() }),
} }));
type Sample = { lat: number; lng: number; accuracy: number; speed: number; t: number };
let feedSample: ((sample: Sample) => void) | null = null;
jest.mock('../../utils/positionSource', () => ({
  sampleToLocationObject: (s: Sample) => ({ coords: {
    latitude: s.lat, longitude: s.lng, accuracy: s.accuracy, speed: s.speed,
    altitude: null, altitudeAccuracy: null, heading: null,
  }, timestamp: s.t }),
  startPositionSource: jest.fn(async (cb: (s: Sample) => void) => {
    feedSample = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo' } };
  }),
}));
const mockNoteAutoDwell = jest.fn();
const mockNoteManualFound = jest.fn();
jest.mock('../../store/trackingStore', () => ({ useTrackingStore: { getState: () => ({
  addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(), noteSearchRunProgress: jest.fn(),
  noteSearchObjectFound: mockNoteManualFound, noteSearchAutoDwell: mockNoteAutoDwell,
  dismissSearchAutoDwell: jest.fn(), noteSearchOffTrackState: jest.fn(),
  searchRunState: { offTrackState: 'on_track' },
}) } }));
jest.mock('../../store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));

const ll = (y: number) => ({ latitude: y / 111320, longitude: 0 });
const LINE = Array.from({ length: 31 }, (_, i) => ll(i * 2));
const END = LINE[LINE.length - 1];
const OBJECTS: SearchObject[] = [
  { id: 'earlier', at: ll(20), atM: 20, index: 0, material: 'stoff' },
  { id: 'final', at: END, atM: 60, index: 1, material: 'stoff' },
];
const NONE: SearchObject[] = [];
let rec: SearchRecorder;
let renderer: ReactTestRenderer | null = null;
const endFired = jest.fn();
function Harness({ guidance = false, objects = OBJECTS, initialFired = false }: {
  guidance?: boolean; objects?: SearchObject[]; initialFired?: boolean;
}) {
  rec = useSearchRecorder({ laidPoints: LINE, laidObjects: objects, level: 'training', sessionId: 'session-a' });
  const distance = rec.endHandlerFix ? haversineM(rec.endHandlerFix.position, END) : null;
  useTrackEndGuidance({
    recording: guidance && rec.recording && rec.searchStartState === 'START_LOCKED',
    dogProgressM: rec.dogProgressM, handlerProgressM: rec.progressM,
    handlerPosition: rec.position, endHandlerFix: rec.endHandlerFix,
    lastSegmentReached: rec.progressM / rec.trackLengthM >= 0.75 && distance != null && distance <= 5,
    trackLengthM: rec.trackLengthM, estimatedDogPosition: rec.estimatedDogPosition, endPoint: END,
    openMandatoryObjects: rec.totalObjects - rec.foundObjects, activeObjectWait: rec.activeObjectWait,
    finalObjectPendingNearEnd: objects.length > 0 && rec.objectStatuses[objects.length - 1] === 'pending',
    voiceOn: false, initialFired,
    onFired: () => { endFired(); rec.confirmEnd(); },
  });
  return null;
}
async function mount(props: React.ComponentProps<typeof Harness> = {}) {
  await act(async () => { renderer = TestRenderer.create(<Harness {...props} />); });
}
function resume(y = 60, runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: y }) {
  act(() => { rec.start({ points: [ll(y)], startedAtMs: Date.now(), runState }); });
}
function feed(y: number, speed = 0) {
  jest.setSystemTime(Date.now() + 1000);
  act(() => { feedSample!({ lat: ll(y).latitude, lng: 0, accuracy: 4, speed, t: Date.now() }); });
}

describe.each(['ios', 'android'] as const)('End/final object shared lifecycle (%s platform mock)', platform => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000 });
    jest.replaceProperty(Platform, 'OS', platform);
    jest.clearAllMocks(); feedSample = null;
  });
  afterEach(() => {
    act(() => { renderer?.unmount(); }); renderer = null;
    jest.restoreAllMocks(); jest.useRealTimers();
  });

  it('releases the end blocker in the same fix that confirms the final dwell', async () => {
    await mount({ guidance: true }); resume(55);
    feed(55, 1); feed(57, 1); feed(59, 1); feed(59.5);
    expect(rec.activeObjectWait).toBe(true);
    expect(endFired).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) feed(58.2);
    expect(rec.objectStatuses[1]).toBe('pending');
    expect(endFired).not.toHaveBeenCalled();
    feed(58.2); // Six seconds of actual dwell evidence, not a proximity-only find.
    expect(rec.objectStatuses[1]).toBe('auto_dwell_found');
    expect(mockNoteAutoDwell).toHaveBeenCalledTimes(1);
    expect(rec.activeObjectWait).toBe(false);
    expect(endFired).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(rec.recording).toBe(true); // Detection never stops or finalizes the run.
    feed(60);
    expect(endFired).toHaveBeenCalledTimes(1);
  });

  it('manual confirmation releases the final-object wait without needing another fix', async () => {
    await mount(); resume(); feed(60);
    expect(rec.activeObjectWait).toBe(true);
    act(() => { rec.markObject(); });
    // The new section now admits its first point immediately (no cross-gap EMA).
    // The earlier object is already behind the persisted pre-pause cursor.
    expect(rec.objectStatuses).toEqual(['missed', 'manual_found']);
    expect(mockNoteManualFound).toHaveBeenCalledWith('final');
    expect(rec.activeObjectWait).toBe(false);
  });

  it('a fresh run cannot inherit the old final-object wait', async () => {
    await mount(); resume(); feed(60);
    expect(rec.activeObjectWait).toBe(true);
    act(() => { rec.stop(); });
    act(() => { rec.start(undefined, { forceLocked: true }); });
    expect(rec.activeObjectWait).toBe(false);
    expect(rec.objectStatuses).toEqual(['pending', 'pending']);
  });

  it('publishes missed statuses at confirmed end immediately without changing geometry or score', async () => {
    await mount(); resume();
    const before = { points: rec.points, distanceM: rec.distanceM, progressM: rec.progressM, score: rec.score };
    act(() => { rec.confirmEnd(); });
    expect(rec.objectStatuses).toEqual(['missed', 'missed']);
    expect(rec.foundObjects).toBe(0);
    expect({ points: rec.points, distanceM: rec.distanceM, progressM: rec.progressM, score: rec.score }).toEqual(before);
    expect(rec.stop().objectStatuses).toEqual(['missed', 'missed']);
  });

  it('reconstructs the confirmed-end object statuses from existing recovery evidence', async () => {
    const objects = [...OBJECTS, { id: 'removed', at: END, atM: 60, index: 2, material: 'stoff' }];
    await mount({ objects, guidance: true, initialFired: true });
    resume(60, { ...freshSearchRunState(), maxCursorM: 60, endFired: true,
      foundObjectIds: ['final'], autoDwellObjectIds: ['final'], dismissedAutoDwellIds: ['removed'] });
    expect(rec.objectStatuses).toEqual(['missed', 'auto_dwell_found', 'user_removed']);
    expect(rec.foundObjects).toBe(1);
    expect(endFired).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('a track without objects detects the endpoint once and remains recording', async () => {
    await mount({ guidance: true, objects: NONE }); resume(55);
    feed(55, 1); feed(57, 1); feed(59, 1); feed(60, 1); feed(60, 1);
    expect(endFired).toHaveBeenCalledTimes(1);
    expect(rec.foundObjects).toBe(0);
    expect(rec.recording).toBe(true);
    feed(60, 1);
    expect(endFired).toHaveBeenCalledTimes(1);
  });
});
