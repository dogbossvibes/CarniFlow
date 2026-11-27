// Feldfehler 26.11. (Android 53/54, OTA 5f565210): In der Absuche stand dauerhaft
// «GPS wird gesucht…». Die native Engine nutzt auf Android nur GPS_PROVIDER. Die
// Absuche nutzt auf Android deshalb von Anfang an expo-location (Fused) — denselben
// Anbieter, der beim Legen auf Android die Aufnahme trägt.
import { Platform } from 'react-native';
import { startPositionSource, ANDROID_FUSED_PROVIDER } from '@/features/tracking/utils/positionSource';
import { setExternalMode } from '@/lib/trackRecorder';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockExpoRemove = jest.fn();
const mockWatchPositionAsync = jest.fn(async (_opts: any, _cb: any) => ({ remove: mockExpoRemove }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  watchPositionAsync: (opts: any, cb: any) => mockWatchPositionAsync(opts, cb),
}));

const mockNativeStop = jest.fn();
const mockStartPositionStream = jest.fn(async (_cb: any, _opts: any, _extras: any) => mockNativeStop);
jest.mock('@/features/tracking/utils/positionStream', () => ({
  startPositionStream: (cb: any, opts: any, extras: any) => mockStartPositionStream(cb, opts, extras),
}));

jest.mock('@/features/tracking/native/precisionLocationClient', () => ({
  precisionLocationClient: {
    isNativeAvailable: () => true,
    isRawGnssSupported: () => ({ supported: false }),
  },
}));

const originalOS = Platform.OS;
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
const expoFix = (t: number) => ({ coords: { latitude: 47.1, longitude: 8.1, accuracy: 6, altitude: null, heading: null, speed: null }, timestamp: t });

const handles: { stop: () => void }[] = [];
beforeEach(() => {
  mockWatchPositionAsync.mockClear(); mockExpoRemove.mockClear();
  mockStartPositionStream.mockClear(); mockNativeStop.mockClear();
  setOS('android');
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  handles.splice(0).forEach(h => h.stop());
  setOS(originalOS);
  setExternalMode(false);
  jest.restoreAllMocks();
});

async function start(onSample: (s: any) => void, fused = true) {
  const h = await startPositionSource(onSample, { timeInterval: 1000 },
    { allowBackground: true, ...(fused ? { androidUseFusedLocation: true } : {}) });
  handles.push(h);
  return h;
}

describe('positionSource — Android-Absuche mit Fused-Ortung', () => {
  it('startet sofort expo-location (keine Wartezeit), nicht die native Engine', async () => {
    const received: any[] = [];
    const handle = await start(s => received.push(s));
    expect(mockStartPositionStream).not.toHaveBeenCalled();
    expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    expect(mockWatchPositionAsync.mock.calls[0][0]).toEqual({ accuracy: 6, timeInterval: 1000, distanceInterval: 0 });
    const [, cb] = mockWatchPositionAsync.mock.calls[0];
    cb(expoFix(1234));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ lat: 47.1, lng: 8.1, accuracy: 6, t: 1234, source: 'expo', provider: ANDROID_FUSED_PROVIDER });
    expect(handle.info).toMatchObject({ source: 'expo', provider: ANDROID_FUSED_PROVIDER });
    handle.stop();
    expect(mockExpoRemove).toHaveBeenCalledTimes(1);
    expect(mockNativeStop).not.toHaveBeenCalled();
  });

  it('nach dem Stopp kommen keine Fixes mehr an', async () => {
    const received: any[] = [];
    const handle = await start(s => received.push(s));
    const [, cb] = mockWatchPositionAsync.mock.calls[0];
    handle.stop();
    cb(expoFix(1234));
    expect(received).toHaveLength(0);
  });

  it('schlägt der expo-Start fehl, läuft die native Quelle als Ausweichweg', async () => {
    mockWatchPositionAsync.mockRejectedValueOnce(new Error('boom'));
    const handle = await start(() => {});
    expect(mockStartPositionStream).toHaveBeenCalledTimes(1);
    expect(handle.info.source).toBe('native');
  });

  it('ohne Option (Legen, Verleitungen) und auf iOS unverändert: native Quelle', async () => {
    await start(() => {}, false);
    expect(mockStartPositionStream).toHaveBeenCalledTimes(1);
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();

    setOS('ios');
    await start(() => {});
    expect(mockStartPositionStream).toHaveBeenCalledTimes(2);
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
  });

  it('externes BLE-GPS hat Vorrang vor der Telefon-Ortung', async () => {
    setExternalMode(true);
    await start(() => {});
    expect(mockStartPositionStream).toHaveBeenCalledTimes(1);
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
  });
});
