import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useStepCalibration } from '../useStepCalibration';

jest.mock('expo-location', () => ({ Accuracy: { BestForNavigation: 6 }, getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const grant = { status: 'granted' } as Location.LocationPermissionResponse;
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let api: ReturnType<typeof useStepCalibration>, tree: ReactTestRenderer;
let onState: (state: AppStateStatus) => void;
let onFix: (fix: Location.LocationObject) => void;
let remove: jest.Mock;
function Harness({ blocked = false }: { blocked?: boolean }) { api = useStepCalibration(blocked); return null; }
async function mount(blocked = false) { await act(async () => { tree = TestRenderer.create(<Harness blocked={blocked} />); }); }
async function start() { await act(async () => { await api.start(); }); }
function emit(x: number, now: number) {
  jest.setSystemTime(now);
  act(() => onFix({ timestamp: now, coords: { latitude: 0, longitude: x / 111195, accuracy: 2 } } as Location.LocationObject));
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(100000); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => { onState = listener; return { remove: jest.fn() }; });
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(grant);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(grant);
  remove = jest.fn();
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_options, callback) => { onFix = callback; return { remove }; });
});
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); jest.restoreAllMocks(); jest.useRealTimers(); });
it('stops a subscription resolving after unmount and ignores its late callbacks', async () => {
  const pending = deferred<Location.LocationSubscription>();
  jest.mocked(Location.watchPositionAsync).mockImplementation((_options, callback) => { onFix = callback; return pending.promise; });
  await mount(); let starting!: Promise<void>;
  await act(async () => { starting = api.start(); });
  await act(async () => { tree.unmount(); });
  pending.resolve({ remove }); await act(async () => { await starting; });
  expect(remove).toHaveBeenCalledTimes(1);
  emit(50, 110000); expect(api.stepLengthM).toBeNull();
});
it('does not request or start GPS after cancelling a delayed permission check', async () => {
  const pending = deferred<Location.LocationPermissionResponse>();
  jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValueOnce(pending.promise);
  await mount(); let starting!: Promise<void>;
  act(() => { starting = api.start(); api.interrupt(); });
  pending.resolve(grant); await act(async () => { await starting; });
  expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(api.phase).toBe('error');
});
it('prevents duplicate starts and handles rejected permissions without an unhandled promise', async () => {
  const pending = deferred<Location.LocationPermissionResponse>();
  jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValueOnce(pending.promise);
  await mount(); let a!: Promise<void>, b!: Promise<void>;
  act(() => { a = api.start(); b = api.start(); });
  pending.resolve({ status: 'denied' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as Location.LocationPermissionResponse);
  await act(async () => { await a; await b; });
  expect(Location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(api.issue).toBe('permission');
});
it('reports permission API errors and supports retry', async () => {
  jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValueOnce(new Error('service unavailable'));
  await mount(); await start(); expect(api.phase).toBe('error');
  await start(); expect(api.phase).toBe('warming');
});
it('invalidates interrupted measurement and prevents resumed old fixes from yielding a result', async () => {
  await mount(); await start(); emit(0,100000); emit(0,101000); emit(0,102000);
  act(() => api.begin()); expect(api.phase).toBe('measuring');
  act(() => onState('background')); expect(api.issue).toBe('interrupted'); expect(remove).toHaveBeenCalledTimes(1);
  emit(37,153000); act(() => api.finish()); expect(api.stepLengthM).toBeNull();
});
it('does not interrupt a permission dialog but stops an inactive measurement', async () => {
  const pending = deferred<Location.LocationPermissionResponse>();
  jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValueOnce(pending.promise);
  await mount(); let starting!: Promise<void>;
  act(() => { starting = api.start(); onState('inactive'); });
  pending.resolve(grant); await act(async () => { await starting; });
  expect(api.phase).toBe('warming'); act(() => onState('inactive')); expect(api.issue).toBe('interrupted');
});
it('blocks active recordings and interrupts if one starts during calibration', async () => {
  await mount(true); await start(); expect(api.issue).toBe('busy'); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  await act(async () => { tree.update(<Harness />); }); await start();
  await act(async () => { tree.update(<Harness blocked />); });
  expect(remove).toHaveBeenCalledTimes(1); expect(api.stepLengthM).toBeNull();
});
it('times out a source with no usable fixes and cleans up a late handle', async () => {
  const pending = deferred<Location.LocationSubscription>();
  jest.mocked(Location.watchPositionAsync).mockReturnValueOnce(pending.promise);
  await mount(); let starting!: Promise<void>;
  await act(async () => { starting = api.start(); });
  act(() => jest.advanceTimersByTime(31000)); expect(api.issue).toBe('signal');
  pending.resolve({ remove }); await act(async () => { await starting; }); expect(remove).toHaveBeenCalledTimes(1);
});
it('returns a result only after new stable endpoint fixes and stops only its own subscription', async () => {
  await mount(); await start(); emit(0,100000); emit(0,101000); emit(0,102000); act(() => api.begin());
  for (let i=1; i<=50; i++) emit(i * .75, 102000+i*1000);
  act(() => api.finish()); expect(api.phase).toBe('finishing'); expect(api.stepLengthM).toBeNull();
  emit(37.5,153000);emit(37.5,154000);emit(37.5,155000);
  expect(api.phase).toBe('result'); expect(api.stepLengthM).toBeCloseTo(.75,4); expect(remove).toHaveBeenCalledTimes(1);
  const result=api.stepLengthM; emit(99,156000); expect(api.stepLengthM).toBe(result);
});
