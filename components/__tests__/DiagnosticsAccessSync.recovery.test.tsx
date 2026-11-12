import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { DiagnosticsAccessSync } from '../DiagnosticsAccessSync';
import { useDiagnosticsAccess } from '@/hooks/useDiagnosticsAccess';
import { setDiagnosticsSession, revokeDiagnosticsAccess, hasDiagnosticsAccess, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

let mockUserId = 'owner';
let mockAppState: (state: string) => void;
const mockSingle = jest.fn();
const mockHydrate = jest.fn(async () => {});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: mockUserId } }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ single: () => mockSingle() }) }) }) }) } }));
jest.mock('@/features/tracking/utils/qaModeBootstrap', () => ({ hydrateQaModes: () => mockHydrate() }));
jest.mock('react-native/Libraries/AppState/AppState', () => ({ __esModule: true, default: { currentState: 'active', addEventListener: (_: string, cb: typeof mockAppState) => { mockAppState = cb; return { remove: jest.fn() }; } } }));
const allowed = { data: { can_use_internal_tracking_diagnostics: true }, error: null };
const denied = { data: { can_use_internal_tracking_diagnostics: false }, error: null };
const unavailable = { data: null, error: { message: 'network unavailable' } };
function Entry() { const access = useDiagnosticsAccess(); return access.allowed ? <Text>diagnostics-entry</Text> : null; }
function Harness() { return <><DiagnosticsAccessSync /><Entry /></>; }
let view: ReactTestRenderer;
const visible = () => view.root.findAll(n => n.props.children === 'diagnostics-entry').length > 0;
async function mount() { await act(async () => { view = TestRenderer.create(<Harness />); }); }
async function advance(ms: number) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }
async function appState(state: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', { value: state, writable: true, configurable: true });
  await act(async () => { mockAppState(state); });
}
beforeEach(() => {
  jest.useFakeTimers(); mockUserId = 'owner'; setDiagnosticsSession(null); setDiagnosticsSession(mockUserId);
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
  mockSingle.mockReset().mockResolvedValue(allowed); mockHydrate.mockClear();
});
afterEach(() => { act(() => view?.unmount()); revokeDiagnosticsAccess(); jest.useRealTimers(); });
it('recovers a failed first read without requiring an app restart or resume', async () => {
  mockSingle.mockResolvedValueOnce(unavailable); await mount(); expect(visible()).toBe(false);
  await advance(30000); expect(visible()).toBe(true); expect(mockSingle).toHaveBeenCalledTimes(2);
});
it('recovers a transient renewal failure and keeps checking subsequent leases', async () => {
  await mount(); expect(visible()).toBe(true); mockSingle.mockResolvedValueOnce(unavailable);
  await advance(30000); expect(visible()).toBe(false);
  await advance(30000); expect(visible()).toBe(true);
  await advance(90000); expect(visible()).toBe(true); expect(mockSingle.mock.calls.length).toBeGreaterThan(4);
});
it('bounds retries during an outage and never grants access from a previous success', async () => {
  await mount(); mockSingle.mockResolvedValue(unavailable);
  await advance(30000); await advance(180000);
  expect(visible()).toBe(false); expect(mockSingle.mock.calls.length).toBeLessThanOrEqual(8);
});
it('does not poll a definitive server denial but checks again on resume', async () => {
  mockSingle.mockResolvedValue(denied); await mount(); await advance(180000);
  expect(visible()).toBe(false); expect(mockSingle).toHaveBeenCalledTimes(1);
  mockSingle.mockResolvedValue(allowed); await appState('background'); await appState('active');
  expect(visible()).toBe(true);
});
it('pauses retries in background and recovers on resume', async () => {
  mockSingle.mockResolvedValueOnce(unavailable); await mount(); await appState('background');
  await advance(180000); expect(mockSingle).toHaveBeenCalledTimes(1);
  await appState('active'); expect(visible()).toBe(true);
});
it('a stalled read times out even if the transport ignores abort, then retries', async () => {
  let finish!: (v: unknown) => void;
  mockSingle.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await mount();
  await advance(8000); expect(hasDiagnosticsAccess()).toBe(false);
  await advance(30000); expect(visible()).toBe(true); expect(mockSingle).toHaveBeenCalledTimes(2);
  await act(async () => { finish(denied); }); expect(visible()).toBe(true);
});
it('does not inherit an old grant or retry result after switching accounts', async () => {
  let finish!: (v: unknown) => void;
  mockSingle.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await mount();
  mockUserId = 'other'; mockSingle.mockResolvedValue(denied);
  await act(async () => { setDiagnosticsSession(mockUserId); view.update(<Harness />); });
  await act(async () => { finish(allowed); }); await advance(60000);
  expect(visible()).toBe(false); expect(mockHydrate).not.toHaveBeenCalled();
});
it('recovers when the old lease expires during a renewal without trusting the stale reply', async () => {
  await mount();
  await act(async () => {
    revokeDiagnosticsAccess();
    const scope = getDiagnosticsAccessSnapshot();
    resolveDiagnosticsAccess('owner', scope.generation, true);
  });
  // Simulate suspended JS timers: the wall clock lease is nearly exhausted.
  jest.setSystemTime(Date.now() + 59000);
  let finish!: (v: unknown) => void;
  mockSingle.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await appState('active');
  // Expiry invalidates this in-flight generation, as a background timer would.
  await act(async () => { revokeDiagnosticsAccess(); finish(allowed); });
  expect(visible()).toBe(false);
  await advance(30000); expect(visible()).toBe(true);
});
it('a definitive denial during recovery stays denied until a new lifecycle check', async () => {
  mockSingle.mockResolvedValueOnce(unavailable).mockResolvedValue(denied);
  await mount(); await advance(30000); await advance(180000);
  expect(visible()).toBe(false); expect(mockSingle).toHaveBeenCalledTimes(2);
});
it('coalesces repeated resume events while a permission request is pending', async () => {
  let finish!: (v: unknown) => void;
  mockSingle.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })); await mount();
  await appState('active'); await appState('active'); await appState('active');
  expect(mockSingle).toHaveBeenCalledTimes(1);
  await act(async () => { finish(allowed); }); await advance(1);
  expect(mockSingle).toHaveBeenCalledTimes(2); expect(visible()).toBe(true);
});
it('revokes and recovers if a store subscriber throws while a grant is being resolved', async () => {
  const unsubscribe = subscribeDiagnosticsAccess(() => { unsubscribe(); throw new Error('subscriber failed'); });
  await mount();
  expect(visible()).toBe(false); expect(hasDiagnosticsAccess()).toBe(false);
  await advance(30000); expect(visible()).toBe(true); expect(mockSingle).toHaveBeenCalledTimes(2);
});
