import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useGroupLivePositions } from '../useGroupLivePositions';
let mockReleaseReady = true;
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => mockReleaseReady }));
let mockNetwork: (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (listener: typeof mockNetwork) => { mockNetwork = listener; return jest.fn(); } } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const user = '10000000-0000-4000-8000-000000000001', session = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const point = { shareId: '30000000-0000-4000-8000-000000000001', userId: user, sessionId: session,
  dogId: '40000000-0000-4000-8000-000000000001', latitude: 47, longitude: 8, accuracyM: 4,
  sequence: 1, observedAtMs: 100000, receivedAtMs: 100000, expiresAtMs: 200000 };
const payload = () => ({ version: 1, serverNowMs: 100000, leaseMs: 5000, positions: [point] });
const client = { call: jest.fn(), dispose: jest.fn() };
let api: ReturnType<typeof useGroupLivePositions>, tree: ReactTestRenderer;
let appState: (value: AppStateStatus) => void;
function Harness({ sid = session, uid = user }: { sid?: string; uid?: string }) { api = useGroupLivePositions(uid, sid, client); return null; }
beforeEach(() => {
  mockReleaseReady = true;
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => { appState = cb; return { remove: jest.fn() }; });
  client.call.mockResolvedValue(payload());
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = TestRenderer.create(<Harness />); }); }
async function advance(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
it('expires positions exactly at the request-based lease while the next request is stalled', async () => {
  await mount(); expect(api.positions).toHaveLength(1);
  client.call.mockReturnValue(new Promise(() => {}));
  await advance(4999); expect(api.positions).toHaveLength(1);
  await advance(1); expect(api.positions).toHaveLength(0);
});
it('deducts the entire request RTT from visibility and does not starve delayed refreshes', async () => {
  let resolve!: (v: unknown) => void;
  client.call.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await mount(); await advance(1500);
  await act(async () => resolve(payload())); expect(api.positions).toHaveLength(1);
  client.call.mockReturnValue(new Promise(() => {}));
  await advance(3499); expect(api.positions).toHaveLength(1);
  await advance(1); expect(api.positions).toHaveLength(0);
});
it('clears on background and ignores the old response after returning', async () => {
  let resolve!: (v: unknown) => void;
  client.call.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await mount();
  await act(async () => { appState('background'); appState('active'); resolve(payload()); });
  expect(api.positions).toHaveLength(0);
  expect(client.call.mock.calls[0][4].aborted).toBe(true);
});
it('never renders the previous account or session after switching', async () => {
  await mount(); expect(api.positions).toHaveLength(1);
  client.call.mockReturnValue(new Promise(() => {}));
  await act(async () => tree.update(<Harness uid={other} sid={other} />));
  expect(api.positions).toHaveLength(0);
});
it('refuses cross-session points and duplicate share IDs', async () => {
  client.call.mockResolvedValue({ ...payload(), positions: [{ ...point, sessionId: other }] });
  await mount(); expect(api.positions).toHaveLength(0); expect(api.unavailable).toBe(true);
  client.call.mockResolvedValue({ ...payload(), positions: [point, point] });
  await advance(2000); expect(api.positions).toHaveLength(0);
});

it('clears received locations immediately on a definite offline signal without waiting for expiry', async () => {
  await mount(); expect(api.positions).toHaveLength(1);
  await act(async () => mockNetwork({ isConnected: false, isInternetReachable: null }));
  expect(api.positions).toHaveLength(0); expect(api.unavailable).toBe(true);
  await advance(10000); expect(client.call).toHaveBeenCalledTimes(1);
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: true }));
  expect(client.call).toHaveBeenCalledTimes(2);
});

it('does not request or render positions while the server release is pending', async () => { mockReleaseReady=false; await mount(); await advance(10000); expect(client.call).not.toHaveBeenCalled(); expect(api.positions).toEqual([]); });
