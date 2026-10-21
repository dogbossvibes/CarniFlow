import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { WearableProvider, useWearableBinding } from '../WearableProvider';
import type { WearableBinding } from '../controller';
import type { WearableSnapshot } from '../protocol';
let mockOwner: string | null = 'a';
let mockId = 0;
let mockTransportPresent = true;
const mockListeners = new Map<string, (event: any) => void>();
const mockPublish = jest.fn(async (_json: string) => true);
const mockRespond = jest.fn(async (_id: string, _json: string) => true);
const mockClear = jest.fn(async () => undefined);
const mockRemove = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: mockOwner ? { user: { id: mockOwner } } : null }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `context-${++mockId}` }));
jest.mock('@/modules/anyvo-wearable-control', () => ({ get wearableTransport() { return mockTransportPresent ? {
  publishSnapshot: mockPublish, respond: mockRespond, clear: mockClear,
  addListener: (name: string, fn: (event: any) => void) => { mockListeners.set(name, fn); return { remove: () => { mockListeners.delete(name); mockRemove(); } }; },
} : null; } }));
let renderer: ReactTestRenderer | null;
let execute: jest.Mock;
let state: ReturnType<WearableBinding['getState']>;
function Screen({ enabled = true, identity = 'lay-a' }: { enabled?: boolean; identity?: string }) {
  useWearableBinding(mockOwner, identity, enabled, { getState: () => state, execute }); return null;
}
const tree = (enabled = true, identity = 'lay-a') => <WearableProvider><Screen enabled={enabled} identity={identity} /></WearableProvider>;
const latest = () => JSON.parse(mockPublish.mock.calls.at(-1)![0]) as WearableSnapshot;
function event(snapshot: WearableSnapshot, patch: Record<string, unknown> = {}) {
  return { requestId: 'native-request', peerId: 'verified-pair', expiresAtMs: Date.now() + 5000, json: JSON.stringify({
    protocolVersion: 1, kind: 'command', commandId: '00000000-0000-4000-8000-000000000001', contextId: snapshot.contextId,
    revision: snapshot.revision, leaseId: snapshot.leaseId, sessionId: snapshot.sessionId, dogId: snapshot.dogId,
    action: 'mark_object', confirmed: false, ...patch }) };
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(1_800_000_000_000); jest.clearAllMocks(); mockListeners.clear();
  mockOwner = 'a'; mockTransportPresent = true; execute = jest.fn(async () => true);
  state = { sessionId: 'lay-a', dogId: 'dog-a', dogName: 'Beispielhund', phase: 'lay_recording', distanceM: 1, elapsedSeconds: 2, capabilities: ['mark_object'] };
});
afterEach(() => { act(() => renderer?.unmount()); renderer = null; jest.useRealTimers(); });
async function mount() { await act(async () => { renderer = Renderer.create(tree()); }); }
it('publishes the registered phone state and responds only after a true source result', async () => {
  await mount(); expect(latest().dogId).toBe('dog-a');
  await act(async () => { mockListeners.get('onCommand')!(event(latest())); });
  expect(execute).toHaveBeenCalledTimes(1); expect(JSON.parse(mockRespond.mock.calls[0][1]).status).toBe('accepted');
});
it('keeps old binaries without a native module inert', async () => {
  mockTransportPresent = false; await mount(); act(() => jest.advanceTimersByTime(60_000));
  expect(mockPublish).not.toHaveBeenCalled(); expect(mockRespond).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
it('never accepts a remote command without native peer/deadline metadata', async () => {
  await mount(); const bad = { ...event(latest()), peerId: '' };
  await act(async () => { mockListeners.get('onCommand')!(bad); });
  expect(execute).not.toHaveBeenCalled(); expect(mockRespond).not.toHaveBeenCalled();
  await act(async () => { mockListeners.get('onCommand')!({ ...event(latest()), expiresAtMs: Date.now() }); });
  expect(execute).not.toHaveBeenCalled(); expect(JSON.parse(mockRespond.mock.calls[0][1]).reason).toBe('expired');
});
it('withdraws control when the screen loses focus and clears native state on logout', async () => {
  await mount(); const command = event(latest());
  await act(async () => { renderer!.update(tree(false)); mockListeners.get('onConnection')!({ connected: true }); });
  await act(async () => { mockListeners.get('onCommand')!(command); });
  expect(execute).not.toHaveBeenCalled(); expect(JSON.parse(mockRespond.mock.calls[0][1]).status).toBe('rejected');
  mockOwner = null; await act(async () => { renderer!.update(tree()); });
  expect(latest().dogId).toBeNull(); expect(mockClear.mock.calls.length).toBeGreaterThanOrEqual(3);
});
it('invalidates target changes without letting commands apply to a new dog', async () => {
  await mount(); const command = event(latest()); state = { ...state, dogId: 'dog-b' };
  await act(async () => { renderer!.update(tree(true, 'lay-b')); });
  await act(async () => { mockListeners.get('onCommand')!(command); });
  expect(execute).not.toHaveBeenCalled(); expect(JSON.parse(mockRespond.mock.calls[0][1]).reason).toBe('stale_context');
});
