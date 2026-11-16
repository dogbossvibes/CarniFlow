import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useLiveShare } from '../useLiveShare';
import { RevocationJournal } from '../revocationJournal';

// Heimzone (Issue #115): in der Zone wird keine Live-Position gesendet.
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => true }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: () => jest.fn() } }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const mockLoadZones = jest.fn();
jest.mock('@/features/home-zone/store', () => ({ loadHomeZones: () => mockLoadZones() }));

const user = '10000000-0000-4000-8000-000000000001';
const input = { userId: user, sessionId: '20000000-0000-4000-8000-000000000001',
  dogId: '30000000-0000-4000-8000-000000000001', shareId: '40000000-0000-4000-8000-000000000001',
  recipientIds: ['10000000-0000-4000-8000-000000000002'], durationMs: 60_000 };
const transport = { start: jest.fn(), publish: jest.fn(), revoke: jest.fn() };
let journal: RevocationJournal, api: ReturnType<typeof useLiveShare>, tree: ReactTestRenderer, fix: Location.LocationCallback;
function Harness({ report }: { report(value: ReturnType<typeof useLiveShare>): void }) {
  const value = useLiveShare(user, transport, journal);
  React.useEffect(() => { report(value); });
  return null;
}
const emit = (latitude: number, accuracy = 4) => act(async () => {
  fix({ timestamp: Date.now(), coords: { latitude, longitude: 8, accuracy } } as Location.LocationObject);
});

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(1_000_000); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  const data = new Map<string, string>();
  journal = new RevocationJournal({ getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } });
  transport.start.mockResolvedValue({ ...input, serverNowMs: 1_000_000, expiresAtMs: 1_060_000 });
  transport.publish.mockResolvedValue(undefined); transport.revoke.mockResolvedValue(undefined);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_options, cb) => { fix = cb; return { remove: jest.fn() }; });
  mockLoadZones.mockResolvedValue([{ id: 'home', lat: 47, lng: 8, radiusM: 200 }]);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
const run = async () => {
  await act(async () => { tree = TestRenderer.create(<Harness report={value => { api = value; }} />); });
  const result = { started: false };
  await act(async () => { result.started = await api.start(input); });
  return result.started;
};

it('sendet in der Heimzone keine Position und meldet die Pause', async () => {
  expect(await run()).toBe(true);
  await emit(47.0005);
  expect(transport.publish).not.toHaveBeenCalled();
  expect(api.state).toMatchObject({ phase: 'sharing', homeZonePaused: true });
});

it('zählt die GPS-Ungenauigkeit zur Zone und sendet ausserhalb wieder', async () => {
  expect(await run()).toBe(true);
  await emit(47.0020, 40); // ≈ 222 m, mit 40 m Ungenauigkeit nicht sicher ausserhalb
  expect(transport.publish).not.toHaveBeenCalled();
  await emit(47.0040);
  expect(transport.publish).toHaveBeenCalledTimes(1);
  expect(transport.publish.mock.calls[0][1]).toMatchObject({ latitude: 47.004 });
  expect(api.state.homeZonePaused).toBe(false);
});

it('startet nicht, wenn die Zonen nicht lesbar sind', async () => {
  mockLoadZones.mockRejectedValue(new Error('home-zone-storage'));
  expect(await run()).toBe(false);
  expect(transport.start).not.toHaveBeenCalled();
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(api.state).toMatchObject({ phase: 'error', issue: 'storage' });
});
