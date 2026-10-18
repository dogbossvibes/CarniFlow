import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Screen from '../precision-location-test';
import { loadQaPreferences, getQaPreferences, setQaPreference, pinQaTrackingModes } from '@/features/tracking/utils/qaPreferences';
import { markWarmupStarted, markWarmupStopped } from '@/features/tracking/utils/trackingWarmupState';

// Native-screen transforms can be slow on the shared development machine.
jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/diagnosticsAccessState', () => ({
  diagnosticsAccessToken: () => 'authorized-fixture',
  getDiagnosticsAccessSnapshot: () => ({ userId: 'user-1', generation: 1, allowed: true }),
  hasDiagnosticsAccess: () => true,
  subscribeDiagnosticsAccess: () => () => {},
}));
jest.mock('@/components/DiagnosticsRouteGate', () => ({ DiagnosticsRouteGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.5', nativeBuildVersion: '52' }));
jest.mock('expo-updates', () => ({ useUpdates: () => ({ currentlyRunning: { isEmbeddedLaunch: true } }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/modules/anyvo-precision-location', () => ({
  isNativeModuleAvailable: () => true,
  isRawGnssSupported: () => ({ supported: false }),
  getProviderStatus: async () => null,
  stopPrecisionTracking: async () => {},
}));
jest.mock('@/features/tracking/native/motionClient', () => ({ motionClient: {
  isModuleAvailable: () => true, isAvailable: () => true, getStatus: async () => null,
} }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/features/tracking/hooks/useQaLaySessions', () => ({ useQaLaySessions: () => ({ sessions: mockSessions }) }));
const mockSessions: never[] = [];
jest.mock('@/features/tracking/services/qaTrackExportService', () => ({ reconcileQaSelection: () => null }));
jest.mock('@/features/tracking/components/PositionQualityDiagnostics', () => ({ PositionQualityDiagnostics: () => null }));
jest.mock('@/features/tracking/components/ShellyDiagnosticsPanel', () => ({ ShellyDiagnosticsPanel: () => null }));

// Existing renderer typings omit root/findAll; match the project's component tests.
type Rendered = any;
let renderer: Rendered;
const text = () => renderer.root.findAllByType('Text').map((n: Rendered) => n.props.children).flat(Infinity).join(' ');
const button = (label: string) => renderer.root.findAll((n: Rendered) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = async (label: string) => { await act(async () => button(label).props.onPress()); };
const mount = async () => { await act(async () => { renderer = TestRenderer.create(<Screen />); }); };

beforeEach(async () => {
  markWarmupStopped();
  await loadQaPreferences();
  setQaPreference('engine', 'current');
  setQaPreference('source', 'precision');
  setQaPreference('diagnostics', false);
  // Drain the serialized writes from fixture setup before checking mount side effects.
  await new Promise<void>(resolve => setImmediate(resolve));
  jest.clearAllMocks();
});
afterEach(async () => { await act(async () => { renderer?.unmount(); }); renderer = null; markWarmupStopped(); });

it('opens with the standard explained and comparison controls hidden, without rewriting preferences', async () => {
  await mount();
  expect(text()).toContain('Standardeinstellung aktiv');
  expect(text()).toContain('Für normale Fährten ist keine Auswahl nötig');
  expect(text()).not.toContain('Tracking Engine');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await press('Erweiterte Vergleichstests');
  expect(button('Erweiterte Vergleichstests').props.accessibilityState.expanded).toBe(true);
  expect(text()).toContain('Tracking Engine');
  expect(text()).toContain('PRECISION · Standard');
  await press('Erweiterte Vergleichstests');
  expect(text()).not.toContain('Tracking Engine');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('keeps an existing comparison visible and restores current/precision only on explicit tap', async () => {
  setQaPreference('engine', 'build40');
  setQaPreference('source', 'legacy');
  setQaPreference('diagnostics', true);
  await mount();
  expect(text()).toContain('Vergleichstest eingestellt');
  expect(getQaPreferences()).toMatchObject({ engine: 'build40', source: 'legacy' });
  await press('Standardeinstellung verwenden');
  expect(getQaPreferences()).toEqual({ engine: 'current', source: 'precision', diagnostics: true });
  expect(text()).toContain('Standardeinstellung aktiv');
});

it.each(['lay', 'search'] as const)('cannot reset modes underneath an active %s stream', async phase => {
  setQaPreference('engine', 'build40');
  setQaPreference('source', 'legacy');
  const release = pinQaTrackingModes();
  if (phase === 'lay') markWarmupStarted('build40', 'legacy');
  try {
    await mount();
    await press('Standardeinstellung verwenden');
    expect(getQaPreferences()).toMatchObject({ engine: 'build40', source: 'legacy' });
    expect(text()).toContain('Bitte zuerst die laufende Fährte oder GPS-Vorbereitung beenden.');
  } finally {
    await act(async () => { markWarmupStopped(); release(); });
  }
  await press('Standardeinstellung verwenden');
  expect(getQaPreferences()).toMatchObject({ engine: 'current', source: 'precision' });
  expect(text()).toContain('Standardeinstellung aktiv');
});

it('reflects preference updates while open and explains Motion independently of QA', async () => {
  await mount();
  await act(async () => { setQaPreference('source', 'legacy'); });
  expect(text()).toContain('Vergleichstest eingestellt');
  expect(text()).toContain('auch ohne QA-Diagnose aktiv');
  expect(text()).not.toContain('Nichts davon wird gespeichert');
});
