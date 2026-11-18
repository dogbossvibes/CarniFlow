import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: true,
  isEmergencyLaunch: false,
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
jest.mock('react-native/Libraries/AppState/AppState', () => ({ __esModule: true, default: { get currentState() { return mockAppState; }, addEventListener: () => ({ remove: jest.fn() }) } }));
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
  mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
  mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
  mockUpdates.reloadAsync.mockReset().mockResolvedValue(undefined);
  mockUpdates.checkForUpdateAsync.mockClear();
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
  it('im Zweifel gesperrt (Fehler)', async () => { mockPending.mockRejectedValue(new Error('x')); expect(await isRecordingProtected()).toBe(true); });
});

describe('OtaStartGate', () => {
  it('zeigt «wird aktualisiert» und startet mit der neuen OTA neu', async () => {
    let finish!: (v: { isNew: boolean }) => void;
    mockUpdates.fetchUpdateAsync.mockReturnValue(new Promise(res => { finish = res; }));
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['updates.startTitle', 'updates.startBody']);
    await act(async () => { finish({ isNew: true }); });
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('lädt während einer Aufnahme nie neu und zeigt die App', async () => {
    mockByDog = { d1: { status: 'searching' } };
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    r.unmount();
  });

  it('ohne neue OTA: App startet normal', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    r.unmount();
  });

  it('prüft nur einmal pro Start (Remount ohne Nachfrage)', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    r.unmount();
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(texts()).toEqual(['APP']);
    r.unmount();
  });

  it('im Entwicklungsbuild nie aktiv', async () => {
    __resetOtaStartGateForTests(true);
    await act(async () => { r = TestRenderer.create(<OtaStartGate><Text>APP</Text></OtaStartGate>); });
    expect(texts()).toEqual(['APP']);
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    r.unmount();
  });
});
