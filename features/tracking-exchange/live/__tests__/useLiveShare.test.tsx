import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useLiveShare } from '../useLiveShare';
import { RevocationJournal } from '../revocationJournal';
let mockReleaseReady = true;
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => mockReleaseReady }));

let mockNetwork: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (listener: typeof mockNetwork) => { mockNetwork = listener; return jest.fn(); } } }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const input = { userId: user, sessionId: '20000000-0000-4000-8000-000000000001',
  dogId: '30000000-0000-4000-8000-000000000001', shareId: '40000000-0000-4000-8000-000000000001',
  recipientIds: [other], durationMs: 60_000 };
const transport = { start: jest.fn(), publish: jest.fn(), revoke: jest.fn() };
let journal: RevocationJournal, api: ReturnType<typeof useLiveShare>, tree: ReactTestRenderer;
let appState: (state: AppStateStatus) => void, fix: Location.LocationCallback, remove: jest.Mock;
function Harness({ uid = user }: { uid?: string }) { api = useLiveShare(uid, transport, journal); return null; }
beforeEach(() => {
  mockReleaseReady = true;
  jest.useFakeTimers(); jest.setSystemTime(1_000_000); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { appState = handler; return { remove: jest.fn() }; });
  const data = new Map<string, string>();
  journal = new RevocationJournal({ getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } });
  transport.start.mockResolvedValue({ ...input, serverNowMs: 1_000_000, expiresAtMs: 1_060_000 });
  transport.publish.mockResolvedValue(undefined); transport.revoke.mockResolvedValue(undefined);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  remove = jest.fn();
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_options, cb) => { fix = cb; return { remove }; });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = TestRenderer.create(<Harness />); }); }
async function start() { await act(async () => { await api.start(input); }); }
function emit(timestamp = Date.now()) { fix({ timestamp, coords: { latitude: 47, longitude: 8, accuracy: 4 } } as Location.LocationObject); }

it('does not request GPS until explicit consent and granted permission', async () => {
  await mount(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  await start(); expect(api.state.permissionDenied).toBe(true);
  expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
it('removes only its own subscription at background and never auto-resumes', async () => {
  await mount(); await start();
  expect(api.state.phase).toBe('sharing');
  await act(async () => { emit(); }); expect(transport.publish).toHaveBeenCalledTimes(1);
  await act(async () => { appState('background'); });
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => { appState('active'); emit(); });
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(transport.publish).toHaveBeenCalledTimes(1);
});
it('removes a watcher resolving after unmount and ignores late callbacks', async () => {
  let resolve!: (s: Location.LocationSubscription) => void;
  const delayed = new Promise<Location.LocationSubscription>(r => { resolve = r; });
  jest.mocked(Location.watchPositionAsync).mockImplementation((_options, cb) => { fix = cb; return delayed; });
  await mount(); let starting!: Promise<boolean>;
  await act(async () => { starting = api.start(input); });
  await act(async () => { tree.unmount(); });
  await act(async () => { resolve({ remove }); await starting; emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(transport.publish).not.toHaveBeenCalled();
});
it('clears the source on account switch and cannot publish an old-account fix', async () => {
  await mount(); await start();
  await act(async () => { tree.update(<Harness uid={other} />); });
  await act(async () => { emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(transport.publish).not.toHaveBeenCalled();
  expect((await journal.list(user)).length).toBe(1);
});
it('rejects stale/future fixes and releases the owned watcher on a network failure', async () => {
  await mount(); await start();
  await act(async () => { emit(Date.now() - 10_001); emit(Date.now() + 1); });
  expect(transport.publish).not.toHaveBeenCalled();
  transport.publish.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(api.state.phase).toBe('stopped');
});
it('reports permission API failure without starting a server grant', async () => {
  await mount(); jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValueOnce(new Error('permission error'));
  await start(); expect(api.state.phase).toBe('error'); expect(transport.start).not.toHaveBeenCalled();
});

it('stops synchronously on known offline state and retries only revocation on reconnect', async () => {
  await mount(); await start(); transport.revoke.mockRejectedValueOnce(new Error('offline'));
  await act(async () => mockNetwork({ isConnected: false, isInternetReachable: null }));
  expect(remove).toHaveBeenCalledTimes(1); expect(api.state.phase).toBe('revoke_pending');
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: true }));
  expect(api.state.phase).toBe('stopped'); expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(transport.start).toHaveBeenCalledTimes(1);
});
it('does not treat unknown connectivity as a definite disconnect', async () => {
  await mount(); await start();
  await act(async () => mockNetwork({ isConnected: null, isInternetReachable: null }));
  expect(remove).not.toHaveBeenCalled(); expect(api.state.phase).toBe('sharing');
});
it('invalidates an in-flight permission request on known offline state', async () => {
  let resolve!: (value: Location.LocationPermissionResponse) => void;
  jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValue(new Promise(r => { resolve = r; }));
  await mount(); let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(input); });
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: false }));
  await act(async () => { resolve({ status: 'granted' } as Location.LocationPermissionResponse); await pending; });
  expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
it('removes a pending watcher once it arrives after an offline notification', async () => {
  let resolve!: (value: Location.LocationSubscription) => void;
  jest.mocked(Location.watchPositionAsync).mockReturnValue(new Promise(r => { resolve = r; }));
  await mount(); let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(input); });
  await act(async () => mockNetwork({ isConnected: false, isInternetReachable: false }));
  await act(async () => { resolve({ remove }); await pending; });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(api.state.phase).not.toBe('sharing');
});
it('reports ACTIVE denial without starting GPS and still acknowledges the safe revocation', async () => {
  await mount(); transport.start.mockRejectedValueOnce(new Error('TRACKING_ACTIVE_REQUIRED'));
  await start();
  expect(api.state.issue).toBe('active_required');
  expect(api.state.phase).toBe('error');
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(transport.revoke).toHaveBeenCalled();
  expect(await journal.list(user)).toEqual([]);
});

it('blocks the direct hook start before permissions and GPS while release is pending', async () => { mockReleaseReady=false; await mount(); await start(); expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(transport.start).not.toHaveBeenCalled(); });
