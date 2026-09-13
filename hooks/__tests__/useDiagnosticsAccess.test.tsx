/**
 * Diagnose-Zugang — Regel + Hook + Route-Gate. Authority: profiles.is_internal_tester
 * (serverseitig per Trigger geschützt). Fail closed.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { diagnosticsAccessFromTester, useDiagnosticsAccess } from '@/hooks/useDiagnosticsAccess';
import { DiagnosticsRouteGate } from '@/components/DiagnosticsRouteGate';

const mockUseProfile = jest.fn();
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => mockUseProfile() }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));

let renderer: ReactTestRenderer | null = null;
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; mockUseProfile.mockReset(); mockReplace.mockReset(); });

describe('diagnosticsAccessFromTester (reine Regel)', () => {
  it('explizite Allowlist: developer/qa/admin → ALLOW; alles andere → DENY', () => {
    const t = (isInternalTester: boolean, level: unknown) =>
      diagnosticsAccessFromTester({ isInternalTester, level: level as never });
    expect(t(false, 'developer')).toBe(false);
    expect(t(true, 'developer')).toBe(true);
    expect(t(true, 'qa')).toBe(true);
    expect(t(true, 'admin')).toBe(true);
    expect(t(true, 'trainer')).toBe(false);
    expect(t(true, null)).toBe(false);
    expect(t(true, undefined)).toBe(false);
    expect(t(true, 'superadmin')).toBe(false);   // unbekannter zukünftiger String
    expect(t(true, 'Developer')).toBe(false);    // keine Normalisierung, exakte Werte
    expect(t(false, null)).toBe(false);
  });
});

function Probe() {
  const a = useDiagnosticsAccess();
  return <Text>{`${a.allowed}|${a.loading}`}</Text>;
}
const probeText = () => (renderer!.root.findByType(Text).props.children as string);
// Typdefinition des Projekts kennt findAllByType nicht (gleicher Workaround wie HoldToStopButton.test.tsx).
const findAllTexts = () => (renderer!.root as unknown as { findAllByType: (t: unknown) => unknown[] }).findAllByType(Text);

describe('useDiagnosticsAccess (Hook, fail closed)', () => {
  it('1. Profil ohne Flag (auch mit profiles.role=admin und tester_level=developer) → allowed=false', () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', role: 'admin', is_internal_tester: false, tester_level: 'developer' }, loading: false });
    act(() => { renderer = TestRenderer.create(<Probe />); });
    expect(probeText()).toBe('false|false');   // profiles.role='admin' zählt NICHT
  });
  it('2. interner Tester → allowed=true', () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', role: 'user', is_internal_tester: true, tester_level: 'developer' }, loading: false });
    act(() => { renderer = TestRenderer.create(<Probe />); });
    expect(probeText()).toBe('true|false');
  });
  it('4. Prüfung schlägt fehl (kein Profil / Fehler / lädt) → allowed=false, kein Crash; Flag ohne Level → DENY', () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', is_internal_tester: true }, loading: false });
    act(() => { renderer = TestRenderer.create(<Probe />); });
    expect(probeText()).toBe('false|false');
    act(() => { renderer!.unmount(); });
    mockUseProfile.mockReturnValue({ profile: null, loading: false });
    act(() => { renderer = TestRenderer.create(<Probe />); });
    expect(probeText()).toBe('false|false');
    act(() => { renderer!.unmount(); });
    mockUseProfile.mockReturnValue({ profile: null, loading: true });
    act(() => { renderer = TestRenderer.create(<Probe />); });
    expect(probeText()).toBe('false|true');
  });
});

describe('DiagnosticsRouteGate (Route direkt geöffnet)', () => {
  it('5. normaler User → kein Inhalt, Redirect ins Profil', () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', is_internal_tester: false }, loading: false });
    act(() => { renderer = TestRenderer.create(<DiagnosticsRouteGate><Text>SECRET</Text></DiagnosticsRouteGate>); });
    expect(findAllTexts()).toHaveLength(0);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile');
  });
  it('6. berechtigter User → Inhalt, kein Redirect', () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', is_internal_tester: true, tester_level: 'qa' }, loading: false });
    act(() => { renderer = TestRenderer.create(<DiagnosticsRouteGate><Text>SECRET</Text></DiagnosticsRouteGate>); });
    expect(renderer!.root.findByType(Text).props.children).toBe('SECRET');
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('4. Profil lädt noch → kein Inhalt, noch kein Redirect (fail closed, kein Retry-Loop)', () => {
    mockUseProfile.mockReturnValue({ profile: null, loading: true });
    act(() => { renderer = TestRenderer.create(<DiagnosticsRouteGate><Text>SECRET</Text></DiagnosticsRouteGate>); });
    expect(findAllTexts()).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
