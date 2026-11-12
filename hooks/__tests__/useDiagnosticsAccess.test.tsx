import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { DiagnosticsRouteGate } from '@/components/DiagnosticsRouteGate';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess, DIAGNOSTICS_ACCESS_TTL_MS, hasDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
let renderer: ReturnType<typeof TestRenderer.create>;
const grant = (id: string, allowed = true) => {
  setDiagnosticsSession(id);
  resolveDiagnosticsAccess(id, getDiagnosticsAccessSnapshot().generation, allowed);
};
beforeEach(() => { jest.useFakeTimers(); setDiagnosticsSession(null); mockReplace.mockReset(); });
afterEach(() => { act(() => { renderer?.unmount(); revokeDiagnosticsAccess(); }); jest.useRealTimers(); });
const mount = () => act(() => { renderer = TestRenderer.create(<DiagnosticsRouteGate><Text>internal</Text></DiagnosticsRouteGate>); });
const contents = () => { try { return renderer.root.findByType(Text).props.children === 'internal'; } catch { return false; } };
it('denies unknown access, including direct route entry', () => { setDiagnosticsSession('owner'); mount(); expect(contents()).toBe(false); expect(mockReplace).not.toHaveBeenCalled(); });
it('opens only with a positive dedicated server capability', () => { grant('owner'); mount(); expect(contents()).toBe(true); });
it('removes contents immediately on revoke and logout', () => {
  grant('owner'); mount(); act(revokeDiagnosticsAccess); expect(contents()).toBe(false);
  act(() => grant('owner')); expect(contents()).toBe(true);
  act(() => setDiagnosticsSession(null)); expect(contents()).toBe(false);
});
it('account switch and delayed response cannot resurrect old access', () => {
  grant('owner'); mount(); const old = getDiagnosticsAccessSnapshot();
  act(() => { setDiagnosticsSession('other'); resolveDiagnosticsAccess('owner', old.generation, true); });
  expect(contents()).toBe(false); expect(hasDiagnosticsAccess()).toBe(false);
});
it('expires access without a fresh successful check', () => { grant('owner'); mount(); act(() => { jest.advanceTimersByTime(DIAGNOSTICS_ACCESS_TTL_MS); }); expect(contents()).toBe(false); });
it('a server denial invalidates previously issued access tokens even after regrant', () => {
  grant('owner'); const old = getDiagnosticsAccessSnapshot().generation;
  grant('owner', false); grant('owner'); expect(getDiagnosticsAccessSnapshot().generation).toBeGreaterThan(old);
});
