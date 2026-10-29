import React, { useEffect as mockUseEffect } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useSharedHealthDogs } from '../useSharedHealthDogs';
let mockUser: { id: string } | null = { id: 'a' };
const mockLoad = jest.fn();
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: mockUser }) }));
jest.mock('@/services/sharedHealthDogs', () => ({ loadReceivedHealthDogs: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { mockUseEffect(callback, [callback]); } }));
const row = { grant_id: 'g', dog_id: 'd', dog_name: 'Private dog', owner_display_name: 'Owner', starts_at: '2026-01-01', expires_at: null, permissions: ['can_view_weight'] };
let current: ReturnType<typeof useSharedHealthDogs>, node: ReactTestRenderer;
function Probe() { current = useSharedHealthDogs(); return null; }
let onAppState: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:00Z'));
  mockUser = { id: 'a' }; mockLoad.mockReset().mockResolvedValue([row]);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => { onAppState = fn; return { remove: jest.fn() }; });
});
afterEach(() => { if (node) act(() => node.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
it('loads received dogs independently of the owned dog list', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  expect(current.dogs[0].name).toBe('Private dog');
});
it('ignores a late previous-account response and immediately hides it', async () => {
  let resolve!: (rows: unknown[]) => void;
  mockLoad.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(async () => { node = TestRenderer.create(<Probe />); });
  mockUser = { id: 'b' }; mockLoad.mockResolvedValue([]);
  await act(async () => { node.update(<Probe />); });
  await act(async () => { resolve([row]); });
  expect(current.dogs).toEqual([]);
});
it('clears private metadata on background and on failed revalidation', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  act(() => { onAppState('background'); });
  expect(current.dogs).toEqual([]);
  mockLoad.mockRejectedValue(new Error('offline'));
  await act(async () => { onAppState('active'); });
  expect(current.dogs).toEqual([]); expect(current.error).toBe(true);
});
it('expires at the exact boundary instead of waiting for periodic polling', async () => {
  mockLoad.mockResolvedValue([{ ...row, expires_at: '2026-10-29T12:00:01Z' }]);
  await act(async () => { node = TestRenderer.create(<Probe />); });
  expect(current.dogs).toHaveLength(1);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(current.dogs).toEqual([]);
});
it('clears received dogs on logout', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  mockUser = null;
  await act(async () => { node.update(<Probe />); });
  expect(current.dogs).toEqual([]);
});
it('keeps an unchanged shared detail stable during periodic access revalidation', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  const dog = current.dogs[0];
  await act(async () => { await current.reload(true); });
  expect(current.dogs[0]).toBe(dog);
});
