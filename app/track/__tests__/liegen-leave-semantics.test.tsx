// Liegezeit verlassen — Semantik (gerendert, echter beforeRemove-Ablauf mit Dialog-Buttons):
// • „Im Hintergrund weiterlaufen" (früher „Weiterlaufen lassen", gleicher Handler) verlässt nur den Screen:
//   Liegezeit + Anzeige laufen weiter, KEIN 'cancelled', keine Registry-/Puffer-Änderung, kein Marker.
// • „Liegezeit beenden" gibt es in diesem Dialog nicht mehr.
// • „Fährte endgültig abbrechen" ist eine separate destruktive Aktion mit eigener Bestätigung.
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
let mockBeforeRemove: ((e: unknown) => void) | null = null;
const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'sess-A', dogId: 'dog-A' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({
    addListener: (name: string, fn: (e: unknown) => void) => { if (name === 'beforeRemove') mockBeforeRemove = fn; return () => {}; },
    dispatch: (...a: unknown[]) => mockDispatch(...a),
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
  getTrackSessionDogName: jest.fn(async () => ({ data: 'Amoun' })),
}));
const mockRecordCancelled = jest.fn(async (..._a: unknown[]) => true);
const mockSessionRow = jest.fn(async (..._a: unknown[]) => ({ local_id: 'sess-A', dog_id: 'dog-A' }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (...a: unknown[]) => mockSessionRow(...a),
}));
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  recordTrackCancelled: (...a: unknown[]) => mockRecordCancelled(...a),
}));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import LiegenScreen from '@/app/track/liegen';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import i18n from '@/i18n/config';
import { loadPending, writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import fs from 'fs';
/* eslint-enable import/first */

beforeAll(async () => { await i18n.changeLanguage('de'); });

type Btn = { text: string; style?: string; onPress?: () => void };
let alertSpy: jest.SpyInstance;
type Rendered = any;
let renderer: Rendered = null;
const lastAlert = () => alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, Btn[]];
const press = (title: string) => act(() => { lastAlert()[2].find(b => b.text === title)!.onPress!(); });
const leave = () => {
  const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  act(() => { mockBeforeRemove!(e); });
  return e;
};

beforeEach(async () => {
  mockBeforeRemove = null;
  [mockDispatch, mockEndNotification, mockRecordCancelled].forEach(m => m.mockClear());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: 'sess-A', sessionStatus: 'resting', trackPoints: [{ lat: 47, lng: 8, t: 1 } as never], layStartedAt: Date.now() - 60_000, isRecording: false } as never);
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A' });
  await act(async () => { renderer = TestRenderer.create(<LiegenScreen />); });
  await act(async () => { await Promise.resolve(); });   // Identität (lokale Session) aufgelöst
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('Liegezeit verlassen', () => {
  it('1–5. Dialog bietet Im Hintergrund weiterlaufen · Fährte endgültig abbrechen · Zurück (nur Abbruch destruktiv)', () => {
    const e = leave();
    expect(e.preventDefault).toHaveBeenCalled();
    const [title, msg, buttons] = lastAlert();
    expect(title).toBe('Liegezeit läuft');
    expect(msg).toBe('Die Liegezeit läuft weiter, auch wenn du diesen Bildschirm verlässt. Du kannst später jederzeit zu dieser Fährte zurückkehren.');
    expect(buttons.map(b => b.text)).toEqual(['Im Hintergrund weiterlaufen', 'Fährte endgültig abbrechen', 'Zurück']);
    expect(buttons.map(b => b.text)).not.toContain('Weiterlaufen lassen');
    expect(buttons.map(b => b.text)).not.toContain('Liegezeit beenden');
    expect(buttons.map(b => b.text)).not.toContain('Fährte abbrechen');
    expect(buttons.filter(b => b.style === 'destructive').map(b => b.text)).toEqual(['Fährte endgültig abbrechen']);
    expect(buttons.find(b => b.text === 'Zurück')!.style).toBe('cancel');
  });

  it('6. „Im Hintergrund weiterlaufen" nutzt exakt den bisherigen „Weiterlaufen lassen"-Handler', () => {
    const src = fs.readFileSync('app/track/liegen.tsx', 'utf8');
    expect(src).toContain("{ text: t('track.continuation.leaveKeepRunning'), onPress: () => { allowLeaveRef.current = true; navigation.dispatch(e.data.action); } },");
    expect(src).not.toContain('leaveEndLyingTime');
    expect(src).not.toContain('endLyingTime');
  });

  it('„Fährte endgültig abbrechen": erst nach separater Bestätigung endgültig (cancelled + Marker resting_abort)', () => {
    leave();
    press('Fährte endgültig abbrechen');
    const [title, msg, buttons] = lastAlert();
    expect(title).toBe('Fährte endgültig abbrechen?');
    expect(msg).toContain('kann danach aber nicht mehr fortgesetzt oder abgesucht werden.');
    expect(mockRecordCancelled).not.toHaveBeenCalled();             // noch nichts passiert
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
    expect(buttons.map(b => b.text)).toEqual(['Nein', 'Endgültig abbrechen']);
    press('Endgültig abbrechen');
    expect(useTrackingStore.getState().sessionStatus).toBe('cancelled');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(mockRecordCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('„Nein" in der Bestätigung → nichts verändert, Screen bleibt', () => {
    leave();
    press('Fährte endgültig abbrechen');
    expect(lastAlert()[2].find(b => b.text === 'Nein')!.onPress).toBeUndefined();   // reines Schliessen
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockRecordCancelled).not.toHaveBeenCalled();
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
  });

  it('6. „Im Hintergrund weiterlaufen": verlässt den Screen; Liegezeit + Anzeige laufen weiter; kein cancelled, Registry + Puffer unverändert', async () => {
    const pending: PendingTrack = {
      sessionId: null, dogId: 'dog-A', trackPoints: [{ lat: 47, lng: 8, accuracy: 4, t: 1 }], markers: [], runPoints: [],
      distanceMeters: 42, durationSeconds: 60, layFinishedAt: 1, layStartedAt: 1, startAnchor: null, savedAt: 1, status: 'resting',
    };
    await writePendingNow('dog-A', pending);
    const regBefore = JSON.stringify(useActiveFaehrten.getState().byDog);
    const layStartedAt = useTrackingStore.getState().layStartedAt;
    leave();
    press('Im Hintergrund weiterlaufen');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(mockEndNotification).not.toHaveBeenCalled();                       // Benachrichtigung/Live Activity läuft weiter
    expect(mockRecordCancelled).not.toHaveBeenCalled();                       // kein Abbruch-Marker
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');       // Fährte bleibt offen
    expect(useTrackingStore.getState().layStartedAt).toBe(layStartedAt);     // Liegezeit läuft weiter (Start unverändert)
    expect(JSON.stringify(useActiveFaehrten.getState().byDog)).toBe(regBefore);   // Registry unverändert
    expect(await loadPending('dog-A')).toEqual(pending);                      // Puffer unverändert
  });

  it('8. „Zurück" schliesst nur den Dialog: auf dem Liegezeit-Screen bleiben, nichts geschrieben', () => {
    leave();
    const back = lastAlert()[2].find(b => b.text === 'Zurück')!;
    expect(back.onPress).toBeUndefined();                                     // reines Schliessen, Event bleibt verhindert
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEndNotification).not.toHaveBeenCalled();
    expect(mockRecordCancelled).not.toHaveBeenCalled();
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
    expect(renderer.root.findAll((n: { props: { testID?: string } }) => n.props.testID === 'resting-identity-missing')).toHaveLength(0);
  });
});
