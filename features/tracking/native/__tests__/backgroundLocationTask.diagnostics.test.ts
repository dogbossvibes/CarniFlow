import { setTrackFixHandler, startBackgroundUpdates, stopBackgroundUpdates, TRACK_LOCATION_TASK } from '../backgroundLocationTask';
import * as TaskManager from 'expo-task-manager';

const mockRecord = jest.fn(async (..._args: unknown[]) => {});
const mockEnd = jest.fn(async (..._args: unknown[]) => {});
const mockStart = jest.fn(async (..._args: unknown[]) => {});
const mockStop = jest.fn(async (..._args: unknown[]) => {});
const mockHasStarted = jest.fn(async (..._args: unknown[]) => true);

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 }, ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: (...args: unknown[]) => mockStart(args[0], args[1]),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStop(args[0]),
  hasStartedLocationUpdatesAsync: (...args: unknown[]) => mockHasStarted(args[0]),
}));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({
  activeBackgroundLaySessionId: jest.fn(async () => 'session-a'),
  diagnosticReason: jest.fn((_error, fallback) => fallback),
  endBackgroundLayDiagnostics: (...args: unknown[]) => mockEnd(...args),
  recordBackgroundLayEvent: (...args: unknown[]) => mockRecord(...args),
}));

const invoke = (body: any): Promise<void> | void => (TaskManager.defineTask as jest.Mock).mock.calls[0][1](body);

beforeEach(() => {
  mockRecord.mockClear(); mockEnd.mockClear(); mockStart.mockReset().mockResolvedValue(undefined);
  mockStop.mockReset().mockResolvedValue(undefined); mockHasStarted.mockReset().mockResolvedValue(true);
  setTrackFixHandler(null, 'session-a'); mockRecord.mockClear();
});

it('counts a callback and every location while preserving the missing-handler drop', async () => {
  const locations = [{ timestamp: 1 }, { timestamp: 2 }];
  await invoke({ data: { locations }, error: null });
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskCallback');
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'locationsReceived', 2);
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'handlerMissing');
});

it('counts handler presence and forwards each existing fix exactly once', async () => {
  const handler = jest.fn();
  setTrackFixHandler(handler, 'session-a');
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'handlerRegistered');
  const locations = [{ timestamp: 1 }, { timestamp: 2 }];
  await invoke({ data: { locations }, error: null });
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'handlerPresent');
  expect(handler.mock.calls.map(call => call[0])).toEqual(locations);
  setTrackFixHandler(null, 'session-a');
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'handlerCleared');
});

it('records task start, registration and failures without altering location options', async () => {
  await startBackgroundUpdates({ notificationTitle: 'title', notificationBody: 'body', diagnosticSessionId: 'session-a' });
  expect(mockStart).toHaveBeenCalledWith(TRACK_LOCATION_TASK, expect.objectContaining({
    accuracy: 6, distanceInterval: 0, timeInterval: 1000, pausesUpdatesAutomatically: false,
  }));
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskStartAttempt', 1, undefined);
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskStartSuccess', 1, undefined);
  await Promise.resolve();
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskRegistered', 1, 'true');
  mockStart.mockRejectedValueOnce(new Error('failed'));
  await expect(startBackgroundUpdates({ notificationTitle: 'title', notificationBody: 'body', diagnosticSessionId: 'session-a' })).rejects.toThrow('failed');
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskStartFailure', 1, 'task_start_failed');
});

it('records task stop and native callback errors', async () => {
  await invoke({ error: { message: 'private native message' } });
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskError', 1, 'native_task_error');
  await stopBackgroundUpdates();
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskStopAttempt');
  expect(mockRecord).toHaveBeenCalledWith('session-a', 'taskStopSuccess');
  expect(mockEnd).toHaveBeenCalledWith('session-a');
});

it('preserves location forwarding when diagnostic storage fails', async () => {
  const handler = jest.fn();
  setTrackFixHandler(handler, 'session-a');
  mockRecord.mockRejectedValueOnce(new Error('diagnostics unavailable'));
  const location = { timestamp: 42 };
  await expect(invoke({ data: { locations: [location] }, error: null })).resolves.toBeUndefined();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith(location);
});
