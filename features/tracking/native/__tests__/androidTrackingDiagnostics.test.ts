import { Platform } from 'react-native';
import { parseAndroidTrackingDiagnostics, readAndroidTrackingDiagnostics } from '../androidTrackingDiagnostics';

const mockOptionalNative = jest.fn();
jest.mock('expo', () => ({ requireOptionalNativeModule: (...args: unknown[]) => mockOptionalNative(...args) }));

const originalPlatform = Platform.OS;
afterEach(() => { Platform.OS = originalPlatform; mockOptionalNative.mockReset(); });

it('preserves zero, false and unavailable separately, excluding coordinates and unapproved fields', () => {
  const result = parseAndroidTrackingDiagnostics({
    schemaVersion: 1, scope: 'application_snapshot', screenInteractive: false,
    fineLocationGranted: false, coarseLocationGranted: true, locationServiceCount: 0,
    latitude: 47, email: 'private@example.com', locationForegroundServiceObserved: false,
    precisionListener: { receivedFixCount: 0, lastFixAgeAtReceiptMs: 0, stopReason: 'private native error' },
  });
  expect(result).toMatchObject({ screenInteractive: false, fineLocationGranted: false, coarseLocationGranted: true,
    locationServiceCount: 0, backgroundLocationGranted: null, locationForegroundServiceObserved: false,
    precisionListener: { receivedFixCount: 0, lastFixAgeAtReceiptMs: 0, stopReason: null } });
  expect(JSON.stringify(result)).not.toMatch(/latitude|private/);
});

it('does not promote malformed or future schema values into confirmed diagnostic state', () => {
  expect(parseAndroidTrackingDiagnostics({ schemaVersion: 2, scope: 'application_snapshot' })).toBeNull();
  const result = parseAndroidTrackingDiagnostics({ schemaVersion: 1, scope: 'application_snapshot',
    deviceIdleMode: 'false', locationServiceCount: -1, observedElapsedMs: Infinity,
    precisionListener: { lastFixAgeAtReceiptMs: NaN } });
  expect(result).toMatchObject({ deviceIdleMode: null, locationServiceCount: null, observedElapsedMs: null,
    precisionListener: { lastFixAgeAtReceiptMs: null } });
});

it('queries only the optional read API, and treats an older binary as unavailable', async () => {
  Platform.OS = 'android';
  const start = jest.fn();
  mockOptionalNative.mockReturnValue({ startPrecisionTracking: start });
  expect(await readAndroidTrackingDiagnostics()).toBeNull();
  expect(start).not.toHaveBeenCalled();
  const read = jest.fn().mockResolvedValue({ schemaVersion: 1, scope: 'application_snapshot' });
  mockOptionalNative.mockReturnValue({ getAndroidTrackingDiagnostics: read, startPrecisionTracking: start });
  expect(await readAndroidTrackingDiagnostics()).toMatchObject({ schemaVersion: 1 });
  expect(read).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
});

it('fails closed on native errors and does not invoke Android APIs on iOS', async () => {
  Platform.OS = 'android';
  mockOptionalNative.mockReturnValue({ getAndroidTrackingDiagnostics: jest.fn().mockRejectedValue(new Error('native')) });
  expect(await readAndroidTrackingDiagnostics()).toBeNull();
  mockOptionalNative.mockClear();
  Platform.OS = 'ios';
  expect(await readAndroidTrackingDiagnostics()).toBeNull();
  expect(mockOptionalNative).not.toHaveBeenCalled();
});
