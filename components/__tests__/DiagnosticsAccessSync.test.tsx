import React from 'react';
import type { DiagnosticsAccessResult } from '@/services/diagnosticsAccessService';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { DiagnosticsAccessSync } from '../DiagnosticsAccessSync';
import { diagnosticsAccessToken, getDiagnosticsAccessSnapshot, hasDiagnosticsAccess, resolveDiagnosticsAccess, revokeDiagnosticsAccess, setDiagnosticsSession } from '@/lib/diagnosticsAccessState';
let mockAllowed = true;
let mockDenied = false;
let mockAppState: (state: string) => void;
const mockRefresh = jest.fn(async (): Promise<DiagnosticsAccessResult> => {
  const state = getDiagnosticsAccessSnapshot();
  if (state.userId) resolveDiagnosticsAccess(state.userId, state.generation, mockAllowed);
  return mockAllowed ? 'allowed' : mockDenied ? 'denied' : 'unavailable';
});
const mockHydrate = jest.fn(async () => {});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('@/services/diagnosticsAccessService', () => ({ refreshDiagnosticsAccess: () => mockRefresh() }));
jest.mock('@/features/tracking/utils/qaModeBootstrap', () => ({ hydrateQaModes: () => mockHydrate() }));
jest.mock('react-native/Libraries/AppState/AppState', () => ({ __esModule: true, default: { currentState: 'active', addEventListener: (_: string, cb: typeof mockAppState) => { mockAppState = cb; return { remove: jest.fn() }; } } }));
let renderer: ReactTestRenderer;
beforeEach(async () => {
  jest.useFakeTimers(); setDiagnosticsSession(null); setDiagnosticsSession('owner'); mockAllowed = true; mockDenied = false;
  mockRefresh.mockClear(); mockHydrate.mockClear();
  await act(async () => { renderer = TestRenderer.create(<DiagnosticsAccessSync />); });
});
afterEach(() => { act(() => renderer.unmount()); revokeDiagnosticsAccess(); jest.useRealTimers(); });
it('hydrates only after the own-account server read', () => { expect(hasDiagnosticsAccess()).toBe(true); expect(mockHydrate).toHaveBeenCalledTimes(1); });
it('revalidates at resume without revoking a still-valid recording grant', async () => {
  const token = diagnosticsAccessToken();
  await act(async () => mockAppState('active'));
  expect(diagnosticsAccessToken()).toBe(token); expect(mockRefresh).toHaveBeenCalledTimes(2);
});
it('revokes on server denial during a resumed session', async () => {
  mockAllowed = false; await act(async () => mockAppState('active'));
  expect(hasDiagnosticsAccess()).toBe(false);
});
it('checks periodically and expiry is fail-closed when JS timers were suspended', async () => {
  await act(async () => jest.advanceTimersByTime(30000)); expect(mockRefresh).toHaveBeenCalledTimes(2);
  jest.setSystemTime(Date.now() + 61000); mockAllowed = false;
  await act(async () => mockAppState('active')); expect(diagnosticsAccessToken()).toBeNull();
});
it('recovers after a transient failed check without an app switch', async () => {
  mockAllowed = false;
  await act(async () => jest.advanceTimersByTime(30000));
  expect(hasDiagnosticsAccess()).toBe(false);
  mockAllowed = true;
  await act(async () => jest.advanceTimersByTime(30000));
  expect(hasDiagnosticsAccess()).toBe(true);
});
it('keeps retrying a long outage at bounded frequency and then recovers', async () => {
  mockAllowed = false;
  for (let i = 0; i < 20; i++) await act(async () => jest.advanceTimersByTime(30000));
  expect(hasDiagnosticsAccess()).toBe(false);
  expect(mockRefresh.mock.calls.length).toBeLessThanOrEqual(7);
  mockAllowed = true;
  for (let i = 0; i < 10; i++) await act(async () => jest.advanceTimersByTime(30000));
  expect(hasDiagnosticsAccess()).toBe(true);
});
it('does not poll an explicit server denial until resume', async () => {
  mockAllowed = false; mockDenied = true;
  await act(async () => mockAppState('active'));
  const calls = mockRefresh.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(600000));
  expect(mockRefresh).toHaveBeenCalledTimes(calls);
  mockAllowed = true;
  await act(async () => mockAppState('active'));
  expect(hasDiagnosticsAccess()).toBe(true);
});
it('does not overlap checks or hydrate another account after a stale result', async () => {
  let finish!: (result: DiagnosticsAccessResult) => void;
  mockRefresh.mockImplementationOnce(() => new Promise<DiagnosticsAccessResult>(resolve => { finish = resolve; }));
  await act(async () => mockAppState('active'));
  const calls = mockRefresh.mock.calls.length;
  const hydrated = mockHydrate.mock.calls.length;
  await act(async () => { mockAppState('active'); jest.advanceTimersByTime(30000); });
  expect(mockRefresh).toHaveBeenCalledTimes(calls);
  setDiagnosticsSession('other');
  await act(async () => finish('stale'));
  expect(mockHydrate).toHaveBeenCalledTimes(hydrated);
  expect(hasDiagnosticsAccess()).toBe(false);
});
