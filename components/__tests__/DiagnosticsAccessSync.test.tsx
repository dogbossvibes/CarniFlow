import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { DiagnosticsAccessSync } from '../DiagnosticsAccessSync';
import { diagnosticsAccessToken, getDiagnosticsAccessSnapshot, hasDiagnosticsAccess, resolveDiagnosticsAccess, revokeDiagnosticsAccess, setDiagnosticsSession } from '@/lib/diagnosticsAccessState';
let mockAllowed = true;
let mockAppState: (state: string) => void;
const mockRefresh = jest.fn(async () => {
  const state = getDiagnosticsAccessSnapshot();
  if (state.userId) resolveDiagnosticsAccess(state.userId, state.generation, mockAllowed);
});
const mockHydrate = jest.fn(async () => {});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('@/services/diagnosticsAccessService', () => ({ refreshDiagnosticsAccess: () => mockRefresh() }));
jest.mock('@/features/tracking/utils/qaModeBootstrap', () => ({ hydrateQaModes: () => mockHydrate() }));
jest.mock('react-native/Libraries/AppState/AppState', () => ({ __esModule: true, default: { currentState: 'active', addEventListener: (_: string, cb: typeof mockAppState) => { mockAppState = cb; return { remove: jest.fn() }; } } }));
let renderer: ReactTestRenderer;
beforeEach(async () => {
  jest.useFakeTimers(); setDiagnosticsSession(null); setDiagnosticsSession('owner'); mockAllowed = true;
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
it('retries a failed grant check while active and restores only after server approval', async () => {
  mockAllowed = false;
  await act(async () => jest.advanceTimersByTime(30000));
  expect(hasDiagnosticsAccess()).toBe(false);
  const calls = mockRefresh.mock.calls.length;
  mockAllowed = true;
  await act(async () => jest.advanceTimersByTime(30000));
  expect(mockRefresh).toHaveBeenCalledTimes(calls + 1);
  expect(hasDiagnosticsAccess()).toBe(true);
});
it('bounds denied retries and never grants ordinary accounts locally', async () => {
  mockAllowed = false;
  for (let i = 0; i < 5; i++) await act(async () => jest.advanceTimersByTime(30000));
  const calls = mockRefresh.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(300000));
  expect(mockRefresh).toHaveBeenCalledTimes(calls);
  expect(hasDiagnosticsAccess()).toBe(false);
  mockAllowed = true;
  await act(async () => mockAppState('active'));
  expect(hasDiagnosticsAccess()).toBe(true);
});
it('does not overlap a pending access read on resume or timer', async () => {
  let finish!: () => void;
  mockRefresh.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => mockAppState('active'));
  const calls = mockRefresh.mock.calls.length;
  await act(async () => { mockAppState('active'); jest.advanceTimersByTime(30000); });
  expect(mockRefresh).toHaveBeenCalledTimes(calls);
  await act(async () => finish());
});
it('does not hydrate a different account after an old read completes', async () => {
  let finish!: () => void;
  mockRefresh.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => mockAppState('active'));
  const hydrations = mockHydrate.mock.calls.length;
  setDiagnosticsSession('other');
  await act(async () => finish());
  expect(mockHydrate).toHaveBeenCalledTimes(hydrations);
  expect(hasDiagnosticsAccess()).toBe(false);
});
