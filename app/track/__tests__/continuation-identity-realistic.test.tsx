// Regression nach 9efaef3 (Gerät: „Fährte nicht eindeutig gefunden" im normalen Fortsetzen-Flow).
// REALISTISCHER Zustand: der Recorder hält die lokale Session-ID NICHT im Store (currentSessionId=null)
// → Store und Puffer einer frisch gelegten Fährte tragen sessionId=null; die Zuordnung Hund→Session
// steht in der Registry (legen.tsx setzt sie beim Lege-Ende). Frühere Tests nutzten unrealistisch
// gesetzte Session-IDs und hätten den Fehler nicht gefunden.
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
const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({
    addListener: (name: string, fn: (e: unknown) => void) => { if (name === 'beforeRemove') mockBeforeRemove = fn; return () => {}; },
    dispatch: (...a: unknown[]) => mockDispatch(...a),
  }),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({
  startLiegezeitNotification: jest.fn(async () => undefined), updateLiegezeitNotification: jest.fn(async () => undefined), endLiegezeitNotification: jest.fn(async () => undefined),
}));
jest.mock('@/features/tracking/services/trackService', () => ({ setTrackLyingTime: jest.fn(async () => undefined), getTrackSessionDogName: jest.fn(async () => ({ data: null })) }));
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
import { reopenTarget } from '@/features/tracking/store/activeFaehrtenModel';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

const T0 = Date.parse('2026-10-04T08:00:00.000Z');
// Wie snapshot() im trackingStore nach einer echten Aufnahme: sessionId = currentSessionId = null.
const realPending = (dog: 'A' | 'B', over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: null, dogId: `dog-${dog}`,
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
const missing = () => !!byId('resting-identity-missing');
const routeParams = (href: string) => Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
let alertSpy: jest.SpyInstance;
const lastAlert = () => alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, { text: string; onPress?: () => void }[]];
const press = (title: string) => act(() => { lastAlert()[2].find(b => b.text === title)!.onPress!(); });
const leave = () => act(() => { mockBeforeRemove!({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }); });

beforeAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(async () => {
  await AsyncStorage.clear();
  mockBeforeRemove = null;
  [mockDispatch, mockRecordCancelled].forEach(m => m.mockClear());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useTrackingStore.setState({ dogId: null, currentSessionId: null, sessionStatus: 'idle', trackPoints: [], layStartedAt: null, isRecording: false } as never);
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

// Zustand direkt nach dem Legen für Hund A (Store hält die Fährte, Puffer + Registry wie in legen.tsx).
const afterLaying = async () => {
  await writePendingNow('dog-A', realPending('A'));
  useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A', layStartedAt: T0 + 5000, distanceMeters: 111 });
  useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: null, sessionStatus: 'resting', trackPoints: realPending('A').trackPoints, distanceMeters: 111, layStartedAt: T0 + 5000, layFinishedAt: T0 + 5000 } as never);
};

describe('Normaler Fortsetzen-Flow mit realistischem Zustand (sessionId=null in Store/Puffer)', () => {
  it('Vorwärts-Flow Legen → Liegezeit (?id&dogId) zeigt die Fährte, nicht „nicht eindeutig gefunden"', async () => {
    await afterLaying();
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(missing()).toBe(false);
    expect(texts()).toContain('111');
  });

  it('1/3/4/5. Legen → Liegezeit beenden → Übersicht → Fortsetzen (Karte/Logbuch/DogHub = reopenTarget) → dieselbe Session/derselbe Hund', async () => {
    await afterLaying();
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    leave(); press('Liegezeit beenden');
    expect(mockRecordCancelled).not.toHaveBeenCalled();                                   // 14. schreibfrei
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
    act(() => { renderer.unmount(); }); renderer = null;
    // 2/7/8/9: ActiveFaehrteCard (Logbuch historie.tsx, DogHubScreen) und Konfliktdialog navigieren über reopenTarget(entry).
    const href = reopenTarget(useActiveFaehrten.getState().get('dog-A')!);
    expect(routeParams(href)).toEqual({ dogId: 'dog-A', id: 'sess-A' });
    await mount(routeParams(href));
    expect(missing()).toBe(false);
    expect(texts()).toContain('111');
    expect(useTrackingStore.getState().dogId).toBe('dog-A');
  });

  it('App-Kill dazwischen (Store leer): Puffer ohne sessionId wird über den Registry-Beleg geladen', async () => {
    await afterLaying();
    useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], layStartedAt: null } as never);
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(missing()).toBe(false);
    expect(useTrackingStore.getState().dogId).toBe('dog-A');
    expect(texts()).toContain('111');
  });

  it('10/13. Benachrichtigung/Live Activity (nur id) → Hund aus der Session, Puffer über Registry-Beleg', async () => {
    await afterLaying();
    useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], layStartedAt: null } as never);
    await mount({ id: 'sess-A' });
    expect(missing()).toBe(false);
    expect(useTrackingStore.getState().dogId).toBe('dog-A');
  });

  it('11. ohne Registry-Beleg (Puffer ohne sessionId) und ohne eindeutige Identität → weiterhin fail closed', async () => {
    await writePendingNow('dog-A', realPending('A'));
    await mount({ id: 'sess-A' });
    expect(missing()).toBe(true);
    act(() => { renderer.unmount(); }); renderer = null;
    await mount({});
    expect(missing()).toBe(true);
  });

  it('Registry zeigt auf eine ANDERE Session des Hundes → Puffer ohne sessionId wird NICHT als diese Session angezeigt', async () => {
    await writePendingNow('dog-A', realPending('A'));
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A-NEU' });
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(missing()).toBe(true);
  });

  it('12. zwei Hunde, beide Puffer ohne sessionId (B jünger) → Deep-Link/Route auf A zeigt A, auf B zeigt B', async () => {
    await writePendingNow('dog-A', realPending('A'));
    await writePendingNow('dog-B', realPending('B'));
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
    useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B' });
    await mount({ id: 'sess-A' });
    expect(texts()).toContain('111');
    expect(texts()).not.toContain('222');
    act(() => { renderer.unmount(); }); renderer = null;
    useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], layStartedAt: null } as never);
    await mount({ id: 'sess-B', dogId: 'dog-B' });
    expect(texts()).toContain('222');
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ sessionId: 'sess-A', status: 'resting' });
  });

  it('15. endgültiger Abbruch im realistischen Zustand: Store dieser Fährte cancelled, Marker + Registry nur für A', async () => {
    await afterLaying();
    await writePendingNow('dog-B', realPending('B'));
    useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B' });
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    leave(); press('Fährte endgültig abbrechen'); press('Endgültig abbrechen');
    expect(useTrackingStore.getState().sessionStatus).toBe('cancelled');
    expect(mockRecordCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(useActiveFaehrten.getState().get('dog-B')).toMatchObject({ sessionId: 'sess-B', status: 'resting' });
    expect((await loadPending('dog-B'))?.status).toBe('resting');
  });
});
