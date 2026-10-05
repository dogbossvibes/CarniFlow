// Liegezeit über Benachrichtigung / Live Activity (`/track/liegen?id=<sessionId>`, OHNE dogId) bei
// mehreren liegenden Hunden: immer genau die Session des Deep-Links; nie der jüngste Puffer eines
// anderen Hundes; unklar → Hinweis statt falscher Fährte. Gerendert, echter Pending-Speicher.
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
let mockParams: Record<string, string | undefined> = {};
let mockBeforeRemove: ((e: unknown) => void) | null = null;
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({
    addListener: (name: string, fn: (e: unknown) => void) => { if (name === 'beforeRemove') mockBeforeRemove = fn; return () => {}; },
    dispatch: jest.fn(),
  }),
}));
const mockEndNotification = jest.fn(async () => undefined);
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({
  startLiegezeitNotification: jest.fn(async () => undefined),
  updateLiegezeitNotification: jest.fn(async () => undefined),
  endLiegezeitNotification: () => mockEndNotification(),
}));
jest.mock('@/features/tracking/services/trackService', () => ({
  setTrackLyingTime: jest.fn(async () => undefined),
  getTrackSessionDogName: jest.fn(async () => ({ data: null })),
}));
const mockRecordCancelled = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  recordTrackCancelled: (...a: unknown[]) => mockRecordCancelled(...a),
}));
const SESSIONS: Record<string, { local_id: string; dog_id: string }> = {
  'sess-A': { local_id: 'sess-A', dog_id: 'dog-A' },
  'sess-B': { local_id: 'sess-B', dog_id: 'dog-B' },
};
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: async (id: string) => SESSIONS[id] ?? null,
}));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import AsyncStorage from '@react-native-async-storage/async-storage';
import LiegenScreen from '@/app/track/liegen';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

const T0 = Date.parse('2026-10-04T08:00:00.000Z');
const pending = (dog: 'A' | 'B', over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: `sess-${dog}`, dogId: `dog-${dog}`,
  trackPoints: [0, 1, 2].map(i => ({ lat: (dog === 'A' ? 47 : 46) + i * 1e-4, lng: 8, accuracy: 4, t: T0 + i * 1000 })),
  markers: [], runPoints: [], distanceMeters: dog === 'A' ? 111 : 222, durationSeconds: 60,
  layFinishedAt: T0 + 5000, layStartedAt: T0 + 5000, startAnchor: null, savedAt: T0 + (dog === 'A' ? 1 : 999_999), status: 'resting', ...over,
});
type Rendered = any;
let renderer: Rendered = null;
const mount = async (params: Record<string, string | undefined>) => {
  mockParams = params;
  await act(async () => { renderer = TestRenderer.create(<LiegenScreen />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
};
const byId = (id: string) => renderer.root.findAll((n: Rendered) => n.props.testID === id)[0];
const texts = () => renderer.root.findAllByType('Text' as never).map((n: Rendered) => [].concat(n.props.children).join('')).join('|');
let alertSpy: jest.SpyInstance;
const lastAlert = () => alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, { text: string; onPress?: () => void }[]];
const press = (title: string) => act(() => { lastAlert()[2].find(b => b.text === title)!.onPress!(); });

beforeAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(async () => {
  await AsyncStorage.clear();
  mockBeforeRemove = null;
  [mockReplace, mockEndNotification, mockRecordCancelled].forEach(m => m.mockClear());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useTrackingStore.setState({ dogId: null, currentSessionId: null, sessionStatus: 'idle', trackPoints: [], layStartedAt: null, isRecording: false } as never);
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  // Zwei liegende Hunde; B ist der JÜNGSTE Puffer (savedAt) — die alte Heuristik hätte B gewählt.
  await writePendingNow('dog-A', pending('A'));
  await writePendingNow('dog-B', pending('B'));
  useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A', layStartedAt: T0 + 5000 });
  useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B', layStartedAt: T0 + 5000 });
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('Liegezeit-Identität (Benachrichtigung / Live Activity)', () => {
  it('1. dogId + sessionId → richtige Fährte', async () => {
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(useTrackingStore.getState()).toMatchObject({ dogId: 'dog-A', currentSessionId: 'sess-A' });
    expect(texts()).toContain('111');
  });
  it('2/3/4. nur sessionId (Deep-Link) → Hund aus der Session; NICHT der jüngste fremde Puffer (B)', async () => {
    await mount({ id: 'sess-A' });
    expect(useTrackingStore.getState()).toMatchObject({ dogId: 'dog-A', currentSessionId: 'sess-A' });
    expect(texts()).toContain('111');
    expect(texts()).not.toContain('222');
  });
  it('3. mehrere liegende Hunde: Deep-Link auf B zeigt B', async () => {
    await mount({ id: 'sess-B' });
    expect(useTrackingStore.getState()).toMatchObject({ dogId: 'dog-B', currentSessionId: 'sess-B' });
    expect(texts()).toContain('222');
  });
  it('5. unbekannte sessionId → fail closed (Hinweis, keine Fährte, Store unberührt)', async () => {
    await mount({ id: 'sess-UNBEKANNT' });
    expect(byId('resting-identity-missing')).toBeDefined();
    expect(texts()).toContain('Fährte nicht eindeutig gefunden');
    expect(useTrackingStore.getState().currentSessionId).toBeNull();
    act(() => { byId('resting-identity-overview').props.onPress(); });
    expect(mockReplace).toHaveBeenCalledWith('/track');
  });
  it('6. sessionId gehört einem anderen Hund als dogId → keine falsche Anzeige', async () => {
    await mount({ id: 'sess-A', dogId: 'dog-B' });
    expect(byId('resting-identity-missing')).toBeDefined();
    expect(useTrackingStore.getState().currentSessionId).toBeNull();
  });
  it('4b. ganz ohne Parameter (Benachrichtigung ohne sessionId) → fail closed statt jüngstem Puffer', async () => {
    await mount({});
    expect(byId('resting-identity-missing')).toBeDefined();
    expect(useTrackingStore.getState().currentSessionId).toBeNull();
  });
  it('Session des Deep-Links nicht im Puffer (Hund hat inzwischen eine andere Session) → Hinweis statt Ersatz', async () => {
    SESSIONS['sess-A-alt'] = { local_id: 'sess-A-alt', dog_id: 'dog-A' };
    await mount({ id: 'sess-A-alt' });
    expect(byId('resting-identity-missing')).toBeDefined();
    expect(useTrackingStore.getState().currentSessionId).toBeNull();
    delete SESSIONS['sess-A-alt'];
  });
  it('7. Deep-Link auf A verändert Puffer/Registry von B nicht', async () => {
    const before = await AsyncStorage.getItem('anyvo_track_pending_v1::dog-B');
    await mount({ id: 'sess-A' });
    expect(await AsyncStorage.getItem('anyvo_track_pending_v1::dog-B')).toBe(before);
    expect(useActiveFaehrten.getState().get('dog-B')).toMatchObject({ status: 'resting', sessionId: 'sess-B' });
  });
  it('8. Benachrichtigung (nur id) und normale Navigation (id + dogId) ergeben dieselbe Session', async () => {
    await mount({ id: 'sess-B' });
    const viaNotification = { ...useTrackingStore.getState() };
    act(() => { renderer.unmount(); }); renderer = null;
    useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], layStartedAt: null } as never);
    await mount({ id: 'sess-B', dogId: 'dog-B' });
    expect(useTrackingStore.getState().currentSessionId).toBe(viaNotification.currentSessionId);
    expect(useTrackingStore.getState().dogId).toBe(viaNotification.dogId);
  });
  it('9. „Im Hintergrund weiterlaufen" nach Deep-Link bleibt write-safe (kein cancelled, kein Marker, Registry unverändert)', async () => {
    await mount({ id: 'sess-A' });
    act(() => { mockBeforeRemove!({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }); });
    press('Im Hintergrund weiterlaufen');
    expect(mockEndNotification).not.toHaveBeenCalled();
    expect(mockRecordCancelled).not.toHaveBeenCalled();
    expect(useTrackingStore.getState().sessionStatus).not.toBe('cancelled');
    expect(useActiveFaehrten.getState().get('dog-A')?.status).toBe('resting');
    expect((await loadPending('dog-A'))?.status).toBe('resting');
  });
  it('10. endgültiger Abbruch nach Deep-Link betrifft NUR die richtige Session (A), nie B', async () => {
    await mount({ id: 'sess-A' });
    act(() => { mockBeforeRemove!({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }); });
    press('Fährte endgültig abbrechen');
    press('Endgültig abbrechen');
    expect(mockRecordCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-B')).toMatchObject({ status: 'resting', sessionId: 'sess-B' });
    expect((await loadPending('dog-B'))?.status).toBe('resting');
  });
});
