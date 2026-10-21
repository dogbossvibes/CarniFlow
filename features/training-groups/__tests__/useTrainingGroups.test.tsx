import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useTrainingGroups } from '../useTrainingGroups';
import { createTrainingGroupService } from '../groupService';
import { GroupApiError } from '../groupRpc';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../groupService', () => ({ createTrainingGroupService: jest.fn() }));
const client = { call: jest.fn(), dispose: jest.fn() };
const group = { groupId: 'group', title: 'A group', ownerUserId: 'A', status: 'active', members: [] };
const service = { list: jest.fn(), sessions: jest.fn(), session: jest.fn(), create: jest.fn() };
let api: ReturnType<typeof useTrainingGroups>, tree: ReactTestRenderer;
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(r => { resolve = r; }), resolve: (v: T) => resolve(v) }; }
function Harness({ uid = 'A' }: { uid?: string }) { api = useTrainingGroups(uid, client); return null; }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.mocked(createTrainingGroupService).mockReturnValue(service as unknown as ReturnType<typeof createTrainingGroupService>);
  service.list.mockResolvedValue({ groups: [group], invitations: [], serverNowMs: 100000 });
  service.sessions.mockResolvedValue({ sessions: [{ sessionId: 'session', groupId: 'group', status: 'active' }] });
  service.session.mockResolvedValue({ session: { sessionId: 'session', groupId: 'group', participants: [] } });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = Renderer.create(<Harness />); }); }
it('keeps a selected unjoined session visible without exposing participant data', async () => {
  await mount(); service.session.mockRejectedValueOnce(new GroupApiError('GROUP_UNAVAILABLE'));
  await act(async () => api.chooseSession('session'));
  expect(api.data.sessionId).toBe('session'); expect(api.data.session).toBeNull(); expect(api.data.error).toBeNull();
});
it('does not starve a slow read with the periodic refresh', async () => {
  const d = deferred<unknown>(); service.list.mockReturnValueOnce(d.promise);
  await mount(); await act(async () => { jest.advanceTimersByTime(10000); });
  expect(service.list).toHaveBeenCalledTimes(1);
  await act(async () => d.resolve({ groups: [group], invitations: [], serverNowMs: 100000 }));
  expect(api.data.groups).toHaveLength(1);
});
it('suppresses duplicate mutations and polling while a mutation is in flight', async () => {
  await mount(); const d = deferred<Record<string, unknown>>(); let operation!: Promise<boolean>;
  const write = jest.fn(() => d.promise);
  await act(async () => { operation = api.act(write); });
  await act(async () => { jest.advanceTimersByTime(5000); await api.act(write); });
  expect(write).toHaveBeenCalledTimes(1); expect(service.list).toHaveBeenCalledTimes(1);
  await act(async () => { d.resolve({}); await operation; });
  expect(api.data.busy).toBe(false); expect(service.list).toHaveBeenCalledTimes(2);
});
it('discards an old-account response even after A→B→A', async () => {
  const d = deferred<unknown>(); service.list.mockReturnValueOnce(d.promise);
  await mount();
  await act(async () => tree.update(<Harness uid="B" />));
  await act(async () => tree.update(<Harness uid="A" />));
  await act(async () => d.resolve({ groups: [{ ...group, title: 'STALE' }], invitations: [], serverNowMs: 100000 }));
  expect(api.data.groups[0].title).toBe('A group');
});
it('clears previously authorized data on a failed refresh', async () => {
  await mount(); service.list.mockRejectedValueOnce(new GroupApiError('GROUP_CONNECTION'));
  await act(async () => { await api.refresh(); });
  expect(api.data.groups).toHaveLength(0); expect(api.data.error).toBe('GROUP_CONNECTION');
});
