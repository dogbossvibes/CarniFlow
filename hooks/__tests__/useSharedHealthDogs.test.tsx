import React, { useEffect as mockUseEffect } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useSharedHealthDogs } from '../useSharedHealthDogs';
let mockNetwork: (state: { isConnected: boolean; isInternetReachable: boolean }) => void;
let mockAuth: (event: string, session: { user: { id: string } } | null) => void;
let mockDogId: string | undefined;
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (callback: typeof mockNetwork) => { mockNetwork = callback; callback({ isConnected: true, isInternetReachable: true }); return jest.fn(); } } }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: (callback: typeof mockAuth) => { mockAuth = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; } } } }));
let mockUser: { id: string } | null = { id: 'a' };
const mockLoad = jest.fn();
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: mockUser }) }));
jest.mock('@/services/sharedHealthDogs', () => ({ loadReceivedHealthDogs: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { mockUseEffect(callback, [callback]); } }));
const row = { grant_id: 'g', dog_id: 'd', dog_name: 'Private dog', owner_display_name: 'Owner', starts_at: '2026-01-01', expires_at: null, permissions: ['can_view_weight'] };
let current: ReturnType<typeof useSharedHealthDogs>, node: ReactTestRenderer;
function Probe() { current = useSharedHealthDogs(mockDogId); return null; }
let onAppState: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:00Z'));
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockDogId = undefined; mockUser = { id: 'a' }; mockLoad.mockReset().mockResolvedValue([row]);
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
  const key = current.accessKey;
  await act(async () => { await current.reload(true); });
  expect(current.accessKey).toBe(key); expect(current.isCurrent(key)).toBe(true);
});

it('invalidates action keys synchronously on auth event before the context rerenders', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  const key = current.accessKey;
  act(() => { mockAuth('SIGNED_OUT', null); expect(current.isCurrent(key)).toBe(false); });
  expect(current.dogs).toEqual([]);
});
it('drops cached metadata and old action keys on connectivity loss', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  const key = current.accessKey;
  act(() => { mockNetwork({ isConnected: false, isInternetReachable: false }); });
  expect(current.dogs).toEqual([]); expect(current.isCurrent(key)).toBe(false);
  mockLoad.mockResolvedValue([]);
  await act(async () => { mockNetwork({ isConnected: true, isInternetReachable: true }); });
  expect(current.dogs).toEqual([]);
});
it('invalidates loaded scope on partial grant narrowing and keeps another right', async () => {
  mockLoad.mockResolvedValue([{ ...row, permissions: ['can_view_weight', 'can_view_medications'] }]);
  await act(async () => { node = TestRenderer.create(<Probe />); });
  const key = current.accessKey;
  mockLoad.mockResolvedValue([{ ...row, permissions: ['can_view_weight'] }]);
  await act(async () => { await current.reload(true); });
  expect(current.dogs[0].permissions).toEqual(['can_view_weight']); expect(current.isCurrent(key)).toBe(false);
});
it('ignores a late previous-dog response', async () => {
  let resolve!: (rows: unknown[]) => void;
  mockDogId = 'd'; mockLoad.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(async () => { node = TestRenderer.create(<Probe />); });
  mockDogId = 'other'; mockLoad.mockResolvedValue([]);
  await act(async () => { node.update(<Probe />); });
  await act(async () => { resolve([row]); });
  expect(current.dogs).toEqual([]);
});
it('invalidates action keys on unmount even before passive cleanup', async () => {
  await act(async () => { node = TestRenderer.create(<Probe />); });
  const key = current.accessKey; const check = current.isCurrent;
  act(() => { node.unmount(); });
  expect(check(key)).toBe(false);
});
