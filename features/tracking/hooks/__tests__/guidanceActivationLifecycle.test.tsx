/**
 * Search-Guidance Activation Guard — Lifecycle-Integration mit dem ECHTEN
 * useSearchRecorder (Search-Start-Acquisition SEEKING → CANDIDATE → START_LOCKED)
 * und den echten Guidance-Hooks, verdrahtet mit exakt dem run.tsx-Guard:
 *   searchGuidanceActive = s.recording && s.searchStartState === 'START_LOCKED'
 * Harness/Mocks wie useSearchRecorder.searchStart.test.tsx.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng, type SearchObject } from '@/features/tracking/hooks/useSearchRecorder';
import { useTrackVoiceGuidance, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { useTrackHapticGuidance, type GuidanceObject } from '@/features/tracking/hooks/useTrackHapticGuidance';
import { useTrackEndGuidance } from '@/features/tracking/hooks/useTrackEndGuidance';
import { freshSearchRunState, type SearchRunState } from '@/features/tracking/store/searchRunState';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Heavy: 'heavy' } }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
const speak = jest.requireMock('expo-speech').speak as jest.Mock;
const impact = jest.requireMock('expo-haptics').impactAsync as jest.Mock;

let feedSample: ((s: { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }) => void) | null = null;
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: null, altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    feedSample = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: jest.fn(), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));

const M_PER_DEG = 111320;
const toLL = (xE: number, yN: number): LatLng => ({ latitude: yN / M_PER_DEG, longitude: xE / M_PER_DEG });
// Gerade 30-m-Fährte nach Norden (2-m-Raster). Winkel bei 5 m, Dübel bei 4 m — beide in
// der Voice-(10 m)/Haptik-(6/4 m)-Zone, sobald der Hund (Handler + 5 m) bei ≥ 0 m steht.
const LINE: LatLng[] = [];
for (let y = 0; y <= 30; y += 2) LINE.push(toLL(0, y));
const NO_OBJECTS: SearchObject[] = [];
const ANGLES: GuidanceAngle[] = [{ id: 'angle-5-rechts', arcM: 5, angleKind: 'rechts' }];
const OBJECTS: GuidanceObject[] = [{ id: 'gegenstand-4', arcM: 4, material: 'duebel' }];

const voiceFired: string[] = [];
const hapticFired: string[] = [];
const endFiredCb = jest.fn();
const seen: string[] = [];   // Folge der beobachteten (recording, searchStartState, active)

function Harness({ onReady, voiceSeed, hapticSeed, endSeed }: {
  onReady: (s: SearchRecorder) => void; voiceSeed?: readonly string[]; hapticSeed?: readonly string[]; endSeed?: boolean;
}) {
  const s = useSearchRecorder({ laidPoints: LINE, laidObjects: NO_OBJECTS, level: 'training', handlerDistanceM: 5 });
  // EXAKT der run.tsx-Guard:
  const searchGuidanceActive = s.recording && s.searchStartState === 'START_LOCKED';
  const key = `${s.recording}|${s.searchStartState}|${searchGuidanceActive}`;
  if (seen[seen.length - 1] !== key) seen.push(key);
  useTrackVoiceGuidance(s.dogProgressM, ANGLES, true, 0.75, OBJECTS, { initialAnnouncedIds: voiceSeed, onAnnounced: id => voiceFired.push(id), enabled: searchGuidanceActive });
  useTrackHapticGuidance(s.dogProgressM, ANGLES, OBJECTS, searchGuidanceActive, { initialFiredIds: hapticSeed, onFired: id => hapticFired.push(id) });
  const endPoint = LINE[LINE.length - 1];
  useTrackEndGuidance({
    recording: searchGuidanceActive, dogProgressM: s.dogProgressM, trackLengthM: s.trackLengthM,
    // Endbedingungen künstlich erfüllbar: virtuelle Hundeposition = Endpunkt, keine offenen Objekte.
    estimatedDogPosition: endPoint, endPoint, openMandatoryObjects: 0, voiceOn: true,
    initialFired: endSeed ?? false, onFired: endFiredCb,
  });
  onReady(s);
  return null;
}

let renderer: ReactTestRenderer | null = null;
function mount(seeds: { voiceSeed?: readonly string[]; hapticSeed?: readonly string[]; endSeed?: boolean } = {}): () => SearchRecorder {
  let latest!: SearchRecorder;
  act(() => { renderer = TestRenderer.create(<Harness onReady={(s) => { latest = s; }} {...seeds} />); });
  return () => latest;
}
let simClockMs = 0;
function feed(yNorthM: number, accuracy = 4) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += 1000;
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: 0.2 / M_PER_DEG, accuracy, speed: 0, course: null, t: simClockMs }); });
}
const flushMicrotasks = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => { feedSample = null; simClockMs = 0; voiceFired.length = 0; hapticFired.length = 0; seen.length = 0; endFiredCb.mockClear(); speak.mockClear(); impact.mockClear(); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

describe('Lifecycle: Arming/SEEKING/CANDIDATE → AUS, START_LOCKED → AN', () => {
  it('1.–5./6./9./10. Voice/Haptik/Ende bleiben in SEEKING und CANDIDATE aus und verbrauchen nichts; ab START_LOCKED normal', async () => {
    const get = mount();
    await flushMicrotasks();
    // Vor Start (Arming/Snapshot): recording=false → AUS, obwohl dogProgressM ≥ 0.
    expect(seen).toEqual(['false|SEEKING_START|false']);
    expect(speak).not.toHaveBeenCalled();

    act(() => { get().start(); });   // beginSearchNow: recording=true, Acquisition beginnt (SEEKING)
    expect(get().recording).toBe(true);
    expect(get().searchStartState).toBe('SEEKING_START');
    expect(seen[seen.length - 1]).toBe('true|SEEKING_START|false');

    feed(0.3);   // 1. Fix am Ansatz → START_CANDIDATE
    expect(get().searchStartState).toBe('START_CANDIDATE');
    expect(seen[seen.length - 1]).toBe('true|START_CANDIDATE|false');
    feed(0.3);   // 2. Fix → weiterhin CANDIDATE
    expect(get().searchStartState).toBe('START_CANDIDATE');
    // SEEKING/CANDIDATE: nichts angesagt, nichts vibriert, nichts verbraucht, kein Ende.
    expect(speak).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(voiceFired).toEqual([]);
    expect(hapticFired).toEqual([]);
    expect(endFiredCb).not.toHaveBeenCalled();

    feed(0.3);   // 3. Fix → START_LOCKED (bestehende Acquisition, unverändert)
    expect(get().searchStartState).toBe('START_LOCKED');
    expect(seen[seen.length - 1]).toBe('true|START_LOCKED|true');
    // Jetzt darf derselbe Winkel nach bestehender Guidance-Logik angesagt/vibriert werden:
    // dogProgressM = 0 + 5 m → Winkel 5 m: Voice-Distanz 0 ≤ 10 ✓, Haptik 0 ≤ 6 ✓; Dübel 4 m liegt hinter dem Hund.
    expect(voiceFired).toEqual(['angle-5-rechts']);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(hapticFired).toEqual(['angle-5-rechts']);
    // Ende: bei 5/30 m Fortschritt ratio < 0,97 → unverändert kein Ende (Bedingungen, nicht Guard).
    expect(endFiredCb).not.toHaveBeenCalled();
    // Lifecycle-Sequenz vollständig:
    expect(seen).toEqual(['false|SEEKING_START|false', 'true|SEEKING_START|false', 'true|START_CANDIDATE|false', 'true|START_LOCKED|true']);
  });

  it('Stop → AUS (recording=false), Guard fällt sofort', async () => {
    const get = mount();
    await flushMicrotasks();
    act(() => { get().start(undefined, { forceLocked: true }); });
    expect(seen[seen.length - 1]).toBe('true|START_LOCKED|true');
    act(() => { get().stop(); });
    expect(seen[seen.length - 1]).toBe('false|START_LOCKED|false');
  });
});

describe('Recovery (4eeb361) mit korrigiertem Guard', () => {
  it('11./12. Resume stellt START_LOCKED her → Guidance sofort aktiv; Seeds verhindern Doppeltrigger, Nicht-Geseedetes feuert normal', async () => {
    const get = mount({ voiceSeed: ['angle-5-rechts'], hapticSeed: [], endSeed: false });
    await flushMicrotasks();
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 0, voiceFiredIds: ['angle-5-rechts'] };
    act(() => { get().start({ points: [toLL(0.2, 0)], startedAtMs: 1, runState }); });
    expect(get().searchStartState).toBe('START_LOCKED');
    expect(seen[seen.length - 1]).toBe('true|START_LOCKED|true');
    // Voice: Winkel bereits vor dem Kill angesagt → kein Doppeltrigger. Haptik (nicht geseedet) feuert normal.
    expect(voiceFired).toEqual([]);
    expect(speak).not.toHaveBeenCalled();
    expect(hapticFired).toEqual(['angle-5-rechts']);
  });

  it('14. Resume mit endFired=true am Ende → keine Ende-Wiederholung', async () => {
    const get = mount({ endSeed: true });
    await flushMicrotasks();
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 30, endFired: true, voiceFiredIds: ['angle-5-rechts'], hapticFiredIds: ['angle-5-rechts', 'gegenstand-4'] };
    act(() => { get().start({ points: [toLL(0.2, 30)], startedAtMs: 1, runState }); });
    expect(seen[seen.length - 1]).toBe('true|START_LOCKED|true');
    expect(endFiredCb).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});
