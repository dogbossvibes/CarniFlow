import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SessionProvider } from '../session-context';
import { getDiagnosticsAccessSnapshot, setDiagnosticsSession } from '../diagnosticsAccessState';
let mockAuthEvent: (event: string, session: unknown) => void;
let mockFinishBootstrap: (value: unknown) => void;
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: () => new Promise(resolve => { mockFinishBootstrap = resolve; }),
  onAuthStateChange: (cb: typeof mockAuthEvent) => { mockAuthEvent = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; },
} } }));
jest.mock('@/services/localeSync', () => ({ initLocaleSync: jest.fn(), stopLocaleSync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
let renderer: ReactTestRenderer | null;
beforeEach(() => { jest.useFakeTimers(); setDiagnosticsSession(null); act(() => { renderer = TestRenderer.create(<SessionProvider>{null}</SessionProvider>); }); });
afterEach(() => { act(() => renderer?.unmount()); renderer = null; jest.useRealTimers(); });
it('late bootstrap cannot restore access identity after signout', async () => {
  act(() => { mockAuthEvent('SIGNED_IN', { user: { id: 'owner' } }); mockAuthEvent('SIGNED_OUT', null); });
  await act(async () => { mockFinishBootstrap({ data: { session: { user: { id: 'owner' } } } }); await Promise.resolve(); });
  expect(getDiagnosticsAccessSnapshot().userId).toBeNull();
});
it('late bootstrap cannot replace a newly signed-in account', async () => {
  act(() => mockAuthEvent('SIGNED_IN', { user: { id: 'other' } }));
  await act(async () => { mockFinishBootstrap({ data: { session: { user: { id: 'owner' } } } }); await Promise.resolve(); });
  expect(getDiagnosticsAccessSnapshot().userId).toBe('other');
});
it('initial session cancels the bootstrap timeout and unmount clears authority', () => {
  act(() => { mockAuthEvent('INITIAL_SESSION', { user: { id: 'owner' } }); jest.advanceTimersByTime(8000); });
  expect(getDiagnosticsAccessSnapshot().userId).toBe('owner');
  act(() => renderer?.unmount()); renderer = null;
  expect(getDiagnosticsAccessSnapshot().userId).toBeNull();
});
