// T-209: Die Absuche startet den Android-Wachhalter nur während der laufenden Aufnahme.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';

const mockKeepaliveStart = jest.fn(async () => {});
const mockKeepaliveStop = jest.fn(async () => {});
jest.mock('@/features/tracking/native/searchKeepalive', () => ({
  startSearchKeepalive: () => mockKeepaliveStart(),
  stopSearchKeepalive: () => mockKeepaliveStop(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

const mockStop = jest.fn();
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: {
      latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: s.altitude ?? null,
      altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null,
    },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async () => {
    return { stop: mockStop, info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));

jest.mock('@/features/tracking/store/trackingStore', () => ({
  // Search-Recovery-State: der Recorder spiegelt Fortschritt/Funde/Off-Track in den Store.
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: jest.fn(), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => false, isAvailable: () => false,
    getStatus: jest.fn(async () => ({ deviceMotionAvailable: false, stepCountingAvailable: false, activityAvailable: false, pedometerAuthorized: false, running: false })),
    start: jest.fn(async () => false), stop: jest.fn(async () => {}),
    onSample: () => ({ remove: () => {} }), onError: () => ({ remove: () => {} }),
  },
}));

const M_PER_DEG = 111320;
function toLL(xEastM: number, yNorthM: number): LatLng {
  return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG };
}
function denseLeg(fromM: number, toM: number, x: number): LatLng[] {
  const pts: LatLng[] = [];
  const steps = Math.max(1, Math.round(Math.abs(toM - fromM) / 2));
  for (let i = 0; i <= steps; i++) pts.push(toLL(x, fromM + ((toM - fromM) * i) / steps));
  return pts;
}
const NO_OBJECTS: readonly [] = [];

function Harness({ onReady, laidPoints }: { onReady: (s: SearchRecorder) => void; laidPoints: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints, laidObjects: NO_OBJECTS as any, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
function mount(laidPoints: LatLng[]): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness laidPoints={laidPoints} onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}

describe('useSearchRecorder — Android-Wachhalter (T-209)', () => {
  beforeEach(() => { mockStop.mockClear(); activeRenderer = null;
    mockKeepaliveStart.mockClear(); mockKeepaliveStop.mockClear(); });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('erst der Start der Absuche schaltet den Wachhalter ein, stop() schaltet ihn aus', async () => {
    const { getRecorder } = mount(denseLeg(0, 60, 0));
    await act(async () => { await Promise.resolve(); });
    expect(mockKeepaliveStart).not.toHaveBeenCalled();   // Vorbereitung am Start: noch kein Dienst
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    expect(mockKeepaliveStart).toHaveBeenCalledTimes(1);
    act(() => { getRecorder().setPaused(true); });
    expect(mockKeepaliveStop).not.toHaveBeenCalled();     // Pause hält den Dienst
    act(() => { getRecorder().stop(); });
    expect(mockKeepaliveStop).toHaveBeenCalledTimes(1);
  });

  it('auch das Fortsetzen nach Neustart schaltet ihn ein', async () => {
    const { getRecorder } = mount(denseLeg(0, 60, 0));
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start({ points: [toLL(0, 0), toLL(0, 4)], startedAtMs: Date.now() - 10_000 }); });
    expect(mockKeepaliveStart).toHaveBeenCalledTimes(1);
  });

  it('Verlassen des Laufbildschirms ohne stop() schaltet ihn aus', async () => {
    const { getRecorder } = mount(denseLeg(0, 60, 0));
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    act(() => { activeRenderer?.unmount(); activeRenderer = null; });
    expect(mockKeepaliveStop).toHaveBeenCalled();
  });
});
