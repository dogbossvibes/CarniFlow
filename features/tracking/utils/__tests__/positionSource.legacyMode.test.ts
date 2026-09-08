// Build-43-Feldtest-Audit: QA-A/B-Schalter LEGACY/PRECISION. Beweist, dass
// LEGACY tatsächlich AnyvoPrecisionLocation/positionStream komplett umgeht
// und exakt den alten expo-location-Pfad (Build 40, 82bd17c) nimmt — mit
// denselben Optionen ({accuracy: BestForNavigation, distanceInterval: 0}) —
// während PRECISION (Default) weiterhin über positionStream läuft.
import { setLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { startPositionSource } from '@/features/tracking/utils/positionSource';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockWatchPositionAsync = jest.fn(async (_opts: any, _cb: any) => ({ remove: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  watchPositionAsync: (opts: any, cb: any) => mockWatchPositionAsync(opts, cb),
}));

const mockStartPositionStream = jest.fn(async (_cb: any, _opts: any) => jest.fn());
jest.mock('@/features/tracking/utils/positionStream', () => ({
  startPositionStream: (cb: any, opts: any) => mockStartPositionStream(cb, opts),
}));

jest.mock('@/features/tracking/native/precisionLocationClient', () => ({
  precisionLocationClient: {
    isNativeAvailable: () => true,
    isRawGnssSupported: () => ({ supported: false }),
  },
}));

describe('positionSource — LEGACY/PRECISION-QA-Schalter', () => {
  beforeEach(() => {
    mockWatchPositionAsync.mockClear();
    mockStartPositionStream.mockClear();
    setLocationSourceMode('precision');
  });

  it('PRECISION (Default): startPositionStream läuft, watchPositionAsync wird NICHT direkt aufgerufen', async () => {
    const handle = await startPositionSource(() => {}, { timeInterval: 1000 });
    expect(mockStartPositionStream).toHaveBeenCalledTimes(1);
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
    expect(handle.info.isNativeAvailable).toBe(true);
  });

  it('LEGACY: startPositionStream/AnyvoPrecisionLocation wird komplett umgangen, reines expo-location mit den alten Optionen', async () => {
    setLocationSourceMode('legacy');
    const handle = await startPositionSource(() => {}, { timeInterval: 1000 });
    expect(mockStartPositionStream).not.toHaveBeenCalled();
    expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    const [opts] = mockWatchPositionAsync.mock.calls[0];
    // Exakt die alten Build-40-Optionen (82bd17c) — kein neu erfundener Wert.
    expect(opts).toEqual({ accuracy: 6, timeInterval: 1000, distanceInterval: 0 });
    expect(handle.info.source).toBe('expo');
    expect(handle.info.provider).toBe('expo-location-legacy');
    expect(handle.info.isNativeAvailable).toBe(false);
  });

  it('LEGACY liefert Samples mit source="expo" an den Aufrufer weiter', async () => {
    setLocationSourceMode('legacy');
    const received: any[] = [];
    await startPositionSource((s: any) => received.push(s), {});
    const [, cb] = mockWatchPositionAsync.mock.calls[0];
    cb({ coords: { latitude: 1, longitude: 2, accuracy: 5, altitude: null, heading: null, speed: null }, timestamp: 1234 });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ lat: 1, lng: 2, source: 'expo', provider: 'expo-location-legacy' });
  });
});
