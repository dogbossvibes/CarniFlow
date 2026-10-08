import { setLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { startPositionSource, sampleToLocationObject } from '@/features/tracking/utils/positionSource';
import { getPositionDiagnostics } from '@/features/tracking/utils/positionDiagnostics';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockExternal = false;
let mockRecorderEmit: () => void;
const mockRecorderRemove = jest.fn();
jest.mock('@/lib/trackRecorder', () => ({ isExternalMode: () => mockExternal, resetRecorder: () => {},
  subscribeRecorder: (fn: () => void) => { mockRecorderEmit = fn; return mockRecorderRemove; },
  getRecordedPoints: () => [{ lat: 47, lng: 8, accuracy_m: 7, altitude_m: null, timestamp: '2026-10-08T00:00:00Z' }],
}));
const mockNative = { isNativeAvailable: jest.fn(() => true), isRawGnssSupported: () => ({ supported: false }),
  onLocation: jest.fn(), onGnssStatus: jest.fn(), start: jest.fn(), stop: jest.fn() };
jest.mock('@/features/tracking/native/precisionLocationClient', () => ({ precisionLocationClient: {
  isNativeAvailable: () => mockNative.isNativeAvailable(), isRawGnssSupported: () => mockNative.isRawGnssSupported(),
  onLocation: (fn: unknown) => mockNative.onLocation(fn), onGnssStatus: (fn: unknown) => mockNative.onGnssStatus(fn),
  start: (opts: unknown) => mockNative.start(opts), stop: () => mockNative.stop(),
} }));
const mockWatch = jest.fn();
jest.mock('expo-location', () => ({ Accuracy: { BestForNavigation: 6 }, watchPositionAsync: (...args: unknown[]) => mockWatch(...args) }));
let nativeEmit: (value: unknown) => void, gnssEmit: (value: unknown) => void;
const nativeRemove = jest.fn(), gnssRemove = jest.fn(), expoRemove = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); mockExternal = false; setLocationSourceMode('precision');
  mockNative.isNativeAvailable.mockReturnValue(true);
  mockNative.onLocation.mockImplementation(fn => { nativeEmit = fn; return { remove: nativeRemove }; });
  mockNative.onGnssStatus.mockImplementation(fn => { gnssEmit = fn; return { remove: gnssRemove }; });
  mockNative.start.mockResolvedValue(undefined); mockNative.stop.mockResolvedValue(undefined);
  mockWatch.mockResolvedValue({ remove: expoRemove });
});
const fix = { latitude: 47, longitude: 8, timestamp: 1234, accuracy: 6, altitude: 500, speed: 1, heading: 90, provider: 'gps' };
it('preserves native quality through stream, source and adapter without changing coordinates or enabling raw GNSS', async () => {
  const samples: Parameters<typeof sampleToLocationObject>[0][] = [];
  const handle = await startPositionSource(s => samples.push(s), {});
  nativeEmit({ ...fix, altitudeAccuracy: 0, speedAccuracy: .2, headingAccuracy: 3 });
  const location = sampleToLocationObject(samples[0]);
  expect(location).toEqual({ timestamp: 1234, coords: { latitude: 47, longitude: 8, accuracy: 6, altitude: 500, speed: 1, heading: 90, altitudeAccuracy: 0, speedAccuracy: .2, courseAccuracy: 3 } });
  expect(getPositionDiagnostics().fix).toMatchObject({ altitudeAccuracy: 0, speedAccuracy: .2, courseAccuracy: 3, source: 'native' });
  expect(mockNative.start.mock.calls[0][0]).toMatchObject({ enableGnssStatusAndroid: true, allowBackground: false });
  expect(mockNative.start.mock.calls[0][0].enableRawGnssAndroid).toBeUndefined();
  handle.stop(); handle.stop(); expect(nativeRemove).toHaveBeenCalledTimes(1); expect(gnssRemove).toHaveBeenCalledTimes(1);
});
it.each([{}, { altitudeAccuracy: -1, speedAccuracy: NaN, headingAccuracy: Infinity }, { altitudeAccuracy: null, speedAccuracy: null, headingAccuracy: null }])('old or invalid quality stays unknown: %j', async quality => {
  const received = jest.fn(); const handle = await startPositionSource(received, {});
  nativeEmit({ ...fix, ...quality });
  expect(sampleToLocationObject(received.mock.calls[0][0]).coords).toMatchObject({ altitudeAccuracy: null, speedAccuracy: null, courseAccuracy: null }); handle.stop();
});
it('cleans failed native subscription before Expo fallback and ignores late callbacks after stop', async () => {
  mockNative.start.mockRejectedValue(new Error('native unavailable')); const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const received = jest.fn(); const handle = await startPositionSource(received, {});
  expect(nativeRemove).toHaveBeenCalledTimes(1); expect(gnssRemove).toHaveBeenCalledTimes(1);
  nativeEmit({ ...fix, altitudeAccuracy: 1 }); expect(received).not.toHaveBeenCalled();
  mockWatch.mock.calls[0][1]({ coords: { latitude: 47, longitude: 8, accuracy: 5, altitudeAccuracy: 2 }, timestamp: 1234 });
  expect(received.mock.calls[0][0]).toMatchObject({ source: 'expo', altitudeAccuracy: 2, speedAccuracy: null, courseAccuracy: null });
  handle.stop(); const count = received.mock.calls.length;
  mockWatch.mock.calls[0][1]({ coords: {}, timestamp: 1240 });
  gnssEmit({ satelliteCount: 20, usedInFixCount: 8, timestamp: 1234 });
  expect(received).toHaveBeenCalledTimes(count); expect(getPositionDiagnostics().active).toBe(false); expect(expoRemove).toHaveBeenCalledTimes(1); warn.mockRestore();
});
it('cleans diagnostics if legacy startup fails', async () => {
  setLocationSourceMode('legacy'); mockWatch.mockRejectedValue(new Error('permission'));
  await expect(startPositionSource(jest.fn(), {})).rejects.toThrow('permission');
  expect(getPositionDiagnostics().active).toBe(false); expect(mockNative.start).not.toHaveBeenCalled();
});

it('external BLE samples retain source/coordinates and explicitly unknown quality', async () => {
  mockExternal = true; const received = jest.fn(); const handle = await startPositionSource(received, {});
  mockRecorderEmit(); expect(sampleToLocationObject(received.mock.calls[0][0]).coords).toMatchObject({ latitude: 47, longitude: 8, accuracy: 7, altitudeAccuracy: null, speedAccuracy: null, courseAccuracy: null });
  expect(getPositionDiagnostics().fix?.source).toBe('external'); expect(mockNative.start).not.toHaveBeenCalled(); handle.stop(); expect(mockRecorderRemove).toHaveBeenCalledTimes(1);
});
it('an older binary using the Precision-client Expo fallback keeps actual altitude quality only', async () => {
  mockNative.isNativeAvailable.mockReturnValue(false); const received = jest.fn(); const handle = await startPositionSource(received, {});
  nativeEmit({ ...fix, altitudeAccuracy: 4, provider: 'expo-location' });
  expect(received.mock.calls[0][0]).toMatchObject({ source: 'expo', altitudeAccuracy: 4, speedAccuracy: null, courseAccuracy: null }); expect(mockNative.onGnssStatus).not.toHaveBeenCalled(); handle.stop();
});

it('missing GNSS diagnostics never replaces the native position source with Expo', async () => {
  mockNative.onGnssStatus.mockImplementation(() => { throw new Error('unsupported diagnostic event'); });
  const received = jest.fn(); const handle = await startPositionSource(received, {});
  nativeEmit({ ...fix, altitudeAccuracy: 2 });
  expect(received.mock.calls[0][0]).toMatchObject({ source: 'native', altitudeAccuracy: 2 });
  expect(mockWatch).not.toHaveBeenCalled(); handle.stop();
});
it('failed GNSS subscription cleanup cannot prevent recorder source stop', async () => {
  const handle = await startPositionSource(jest.fn(), {});
  gnssRemove.mockImplementationOnce(() => { throw new Error('subscription cleanup'); });
  expect(() => handle.stop()).not.toThrow();
  expect(nativeRemove).toHaveBeenCalledTimes(1); expect(mockNative.stop).toHaveBeenCalledTimes(1);
  expect(getPositionDiagnostics().active).toBe(false);
});
