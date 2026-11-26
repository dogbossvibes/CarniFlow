// Feldfehler 26.11. (Android 53/54, OTA 5f565210): In der Absuche stand dauerhaft
// «GPS wird gesucht…». Die Absuche hängt auf Android allein an der nativen Engine
// (nur GPS_PROVIDER). Kommt dort kein brauchbarer Fix (kein Fix oder Messzeit in der
// Zukunft → von der Live-Zeitordnung verworfen), muss die Quelle auf expo-location
// (Fused) wechseln — den Anbieter, der beim Legen auf Android die Aufnahme trägt.
import { Platform } from 'react-native';
import { startPositionSource } from '@/features/tracking/utils/positionSource';
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
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const expoFix = (t: number) => ({ coords: { latitude: 47.1, longitude: 8.1, accuracy: 6, altitude: null, heading: null, speed: null }, timestamp: t });

const handles: { stop: () => void }[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-26T10:00:00Z'));
  mockWatchPositionAsync.mockClear(); mockExpoRemove.mockClear();
  mockStartPositionStream.mockClear(); mockNativeStop.mockClear();
  setOS('android');
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  handles.splice(0).forEach(h => h.stop());
  setOS(originalOS);
  setExternalMode(false);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function start(onSample: (s: any) => void, timeoutMs: number | null = 10_000) {
  const h = await startPositionSource(onSample, { timeInterval: 1000 },
    { allowBackground: true, ...(timeoutMs != null ? { androidNativeFixTimeoutMs: timeoutMs } : {}) });
  handles.push(h);
  return h;
}

describe('positionSource — Android-Absuche ohne nativen Fix', () => {
  it('wechselt nach 10 s ohne nativen Fix auf expo-location und liefert dessen Fixes', async () => {
    const received: any[] = [];
    const handle = await start(s => received.push(s));
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(9_999); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); await flush();

    expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    expect(mockWatchPositionAsync.mock.calls[0][0]).toEqual({ accuracy: 6, timeInterval: 1000, distanceInterval: 0 });
    expect(mockNativeStop).toHaveBeenCalledTimes(1);   // keine Doppelquelle
    const [, cb] = mockWatchPositionAsync.mock.calls[0];
    cb(expoFix(Date.now()));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ lat: 47.1, lng: 8.1, source: 'expo', provider: 'expo-location-android-fallback' });
    expect(handle.info).toMatchObject({ source: 'expo', provider: 'expo-location-android-fallback' });

    // Späte native Fixes werden nach dem Wechsel ignoriert.
    const [nativeEmit] = mockStartPositionStream.mock.calls[0];
    nativeEmit({ lat: 1, lng: 2, accuracy: 4, t: Date.now(), source: 'native', provider: 'gps' });
    expect(received).toHaveLength(1);

    handle.stop();
    expect(mockExpoRemove).toHaveBeenCalledTimes(1);
  });

  it('wechselt auch, wenn native Fixes nur mit Zukunfts-Messzeit kommen (Live-Zeitordnung verwirft sie)', async () => {
    await start(() => {});
    const [nativeEmit] = mockStartPositionStream.mock.calls[0];
    nativeEmit({ lat: 1, lng: 2, accuracy: 4, t: Date.now() + 18_000, source: 'native', provider: 'gps' });
    jest.advanceTimersByTime(10_000); await flush();
    expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('bleibt bei der nativen Quelle, sobald ein brauchbarer nativer Fix kommt', async () => {
    const received: any[] = [];
    const handle = await start(s => received.push(s));
    const [nativeEmit] = mockStartPositionStream.mock.calls[0];
    jest.advanceTimersByTime(4_000);
    nativeEmit({ lat: 1, lng: 2, accuracy: 4, t: Date.now(), source: 'native', provider: 'gps' });
    jest.advanceTimersByTime(60_000); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
    expect(mockNativeStop).not.toHaveBeenCalled();
    expect(received[0]).toMatchObject({ source: 'native', provider: 'gps' });
    handle.stop();
    expect(mockNativeStop).toHaveBeenCalledTimes(1);
  });

  it('Stopp vor Ablauf startet keinen Fallback', async () => {
    const handle = await start(() => {});
    handle.stop();
    jest.advanceTimersByTime(30_000); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
    expect(mockNativeStop).toHaveBeenCalledTimes(1);
  });

  it('ohne Option (Legen) und auf iOS unverändert: kein Watchdog', async () => {
    await start(() => {}, null);
    jest.advanceTimersByTime(60_000); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();

    setOS('ios');
    await start(() => {});
    jest.advanceTimersByTime(60_000); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
  });

  it('externes BLE-GPS: kein Fallback auf Telefon-GPS', async () => {
    setExternalMode(true);
    await start(() => {});
    jest.advanceTimersByTime(60_000); await flush();
    expect(mockWatchPositionAsync).not.toHaveBeenCalled();
  });
});
