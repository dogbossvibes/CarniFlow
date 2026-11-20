import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

// Nachbau des expo-updates-Zustands: `setCtx` ändert ihn und benachrichtigt die Zuhörer.
type Ctx = { isStartupProcedureRunning: boolean; isUpdateAvailable: boolean; isUpdatePending: boolean; isDownloading: boolean; restartCount: number; downloadProgress?: number };
const mockBase: Ctx = { isStartupProcedureRunning: true, isUpdateAvailable: false, isUpdatePending: false, isDownloading: false, restartCount: 0 };
let mockCtx: Ctx = { ...mockBase };
const mockListeners = new Set<(e: { context: Ctx }) => void>();
const setCtx = (patch: Partial<Ctx>) => { mockCtx = { ...mockCtx, ...patch }; [...mockListeners].forEach(l => l({ context: mockCtx })); };
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: true,
  isEmergencyLaunch: false,
  get latestContext() { return mockCtx; },
  addUpdatesStateChangeListener: (l: (e: { context: Ctx }) => void) => { mockListeners.add(l); return { remove: () => { mockListeners.delete(l); } }; },
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));
const mockUpdates = jest.requireMock('expo-updates') as Record<string, jest.Mock>;
const mockHasStarted = jest.fn();
jest.mock('expo-location', () => ({ hasStartedLocationUpdatesAsync: (...a: unknown[]) => mockHasStarted(...a) }));
jest.mock('@/features/tracking/native/backgroundLocationTask', () => ({ TRACK_LOCATION_TASK: 'anyvo-faehrte-bg' }));
const mockPending = jest.fn();
jest.mock('@/features/tracking/store/trackPersist', () => ({ listPendingDogIds: () => mockPending() }));
let mockByDog: Record<string, { status: string }> = {};
jest.mock('@/features/tracking/store/activeFaehrten', () => ({
  useActiveFaehrten: { getState: () => ({ hydrated: true, hydrate: async () => {}, byDog: mockByDog }) },
}));
let mockAppState = 'active';
let mockAppListener: ((s: string) => void) | null = null;
jest.mock('react-native/Libraries/AppState/AppState', () => ({ __esModule: true, default: {
  get currentState() { return mockAppState; },
  addEventListener: (_: string, l: (s: string) => void) => { mockAppListener = l; return { remove: () => { mockAppListener = null; } }; },
} }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

// eslint-disable-next-line import/first -- nach den jest.mock-Aufrufen importieren
import { OtaStartGate, isRecordingProtected, __resetOtaStartGateForTests } from '../OtaStartGate';

let r: ReactTestRenderer;
const texts = () => r.root.findAllByType(Text).map(n => [].concat(n.props.children).join(''));

beforeEach(() => {
  __resetOtaStartGateForTests(false);
  mockAppState = 'active'; mockByDog = {};
  mockHasStarted.mockResolvedValue(false); mockPending.mockResolvedValue([]);
  mockCtx = { ...mockBase }; mockListeners.clear(); mockAppListener = null;
  mockUpdates.reloadAsync.mockReset().mockResolvedValue(undefined);
  mockUpdates.checkForUpdateAsync.mockClear(); mockUpdates.fetchUpdateAsync.mockClear();
});
afterAll(() => { __resetOtaStartGateForTests(null); });

describe('isRecordingProtected', () => {
  it('frei, wenn nichts läuft', async () => { expect(await isRecordingProtected()).toBe(false); });
  it('gesperrt bei laufendem Fährten-Hintergrund-Task', async () => { mockHasStarted.mockResolvedValue(true); expect(await isRecordingProtected()).toBe(true); });
  it('gesperrt beim Legen und bei der Absuche', async () => {
    mockByDog = { d1: { status: 'laying' } }; expect(await isRecordingProtected()).toBe(true);
    mockByDog = { d1: { status: 'searching' } }; expect(await isRecordingProtected()).toBe(true);
  });
  it('frei bei gelegter, wartender Fährte (nichts wird aufgenommen)', async () => { mockByDog = { d1: { status: 'laid' } }; expect(await isRecordingProtected()).toBe(false); });
  it('gesperrt bei unterbrochener Aufnahme im Puffer', async () => { mockPending.mockResolvedValue(['d1']); expect(await isRecordingProtected()).toBe(true); });
  it('gesperrt bei Start im Hintergrund', async () => { mockAppState = 'background'; expect(await isRecordingProtected()).toBe(true); });
  it('iOS-Kaltstart: wartet kurz, bis die App aktiv ist', async () => {
    mockAppState = 'inactive';
    const p = isRecordingProtected();
    mockAppState = 'active'; mockAppListener?.('active');
    expect(await p).toBe(false);
    expect(mockAppListener).toBeNull();
  });
  it('gesperrt, wenn die App nach «inactive» in den Hintergrund geht', async () => {
    mockAppState = 'inactive';
    const p = isRecordingProtected();
    mockAppState = 'background'; mockAppListener?.('background');
    expect(await p).toBe(true);
  });
  it('gesperrt, wenn die App nicht aktiv wird', async () => {
    jest.useFakeTimers();
    try {
      mockAppState = 'inactive';
      const p = isRecordingProtected();
      jest.advanceTimersByTime(1100);
      expect(await p).toBe(true);
    } finally { jest.useRealTimers(); }
  });
  it('im Zweifel gesperrt (Fehler)', async () => { mockPending.mockRejectedValue(new Error('x')); expect(await isRecordingProtected()).toBe(true); });
});

describe('OtaStartGate', () => {
  it('zeigt «wird aktualisiert», sobald der Start-Download läuft, und startet mit der neuen OTA neu', async () => {
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual([]);                       // Start-Fläche ohne Text, solange unklar
    await act(async () => { setCtx({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 0.4 }); });
    expect(texts()).toEqual(['updates.startTitle', 'updates.startBody']);
    await act(async () => { setCtx({ isDownloading: false, isUpdatePending: true, isStartupProcedureRunning: false }); });
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('stellt keine eigene Nachfrage an expo-updates (würde hinter dem Start-Download warten)', async () => {
    mockCtx = { ...mockBase, isUpdateAvailable: true, isDownloading: true };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    await act(async () => { setCtx({ isDownloading: false, isUpdatePending: true }); });
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('lädt während einer Aufnahme nie neu und zeigt die App', async () => {
    mockByDog = { d1: { status: 'searching' } };
    mockCtx = { ...mockBase, isUpdatePending: true };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    r.unmount();
  });

  it('ohne neue OTA: App startet normal, sobald die Start-Phase vorbei ist', async () => {
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    await act(async () => { setCtx({ isStartupProcedureRunning: false }); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    r.unmount();
  });

  it('prüft nur einmal pro Start (Remount ohne neues Zuschauen)', async () => {
    mockCtx = { ...mockBase, isStartupProcedureRunning: false };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    r.unmount();
    mockCtx = { ...mockBase, isUpdatePending: true };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    r.unmount();
  });

  it('im Entwicklungsbuild nie aktiv', async () => {
    __resetOtaStartGateForTests(true);
    mockCtx = { ...mockBase, isUpdatePending: true };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
    r.unmount();
  });
});
