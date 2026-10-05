// Liegezeit verlassen — Semantik (gerendert, echter beforeRemove-Ablauf mit Dialog-Buttons):
// • „Im Hintergrund weiterlaufen" (früher „Weiterlaufen lassen", gleicher Handler) verlässt nur den Screen:
//   Liegezeit + Anzeige laufen weiter, KEIN 'cancelled', keine Registry-/Puffer-Änderung, kein Marker.
// • „Fährte endgültig abbrechen" löst per Touch NUR nach 1,5 s Gedrückthalten aus (der Hold ist die
//   Bestätigung); Bedienungshilfen öffnen stattdessen die ausdrückliche Bestätigung „Fährte endgültig abbrechen?".
// • „Liegezeit beenden" gibt es in diesem Dialog nicht mehr.
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
import { HOLD_TO_ABORT_MS } from '@/features/tracking/components/RestingLeaveDialog';
/* eslint-enable import/first */

beforeAll(async () => { await i18n.changeLanguage('de'); });

type Btn = { text: string; style?: string; onPress?: () => void };
let alertSpy: jest.SpyInstance;
type Rendered = any;
let renderer: Rendered = null;
const lastAlert = () => alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, Btn[]];
const pressAlert = (title: string) => act(() => { lastAlert()[2].find(b => b.text === title)!.onPress!(); });
const leave = () => {
  const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  act(() => { mockBeforeRemove!(e); });
  return e;
};
const byId = (id: string) => renderer.root.findAll((n: Rendered) => n.props.testID === id)[0];
const dialogOpen = () => !!byId('resting-leave-dialog');
const dialogTexts = () => byId('resting-leave-dialog').findAllByType('Text' as never).map((n: Rendered) => [].concat(n.props.children).join(''));
const tap = (id: string) => act(() => { byId(id).props.onPress(); });
/** Touch auf „Fährte endgültig abbrechen": Press-In, `ms` halten, Press-Out (Fake-Timer nur für den Hold). */
const holdAbort = (ms: number) => {
  jest.useFakeTimers();
  try {
    act(() => { byId('resting-leave-abort-hold').props.onPressIn(); });
    act(() => { jest.advanceTimersByTime(ms); });
    const btn = byId('resting-leave-abort-hold');
    if (btn) act(() => { btn.props.onPressOut(); btn.props.onPress(); });
    act(() => { jest.advanceTimersByTime(3000); });
  } finally { jest.useRealTimers(); }
};
const writePending = async (): Promise<PendingTrack> => {
  const p: PendingTrack = {
    sessionId: null, dogId: 'dog-A', trackPoints: [{ lat: 47, lng: 8, accuracy: 4, t: 1 }], markers: [], runPoints: [],
    distanceMeters: 42, durationSeconds: 60, layFinishedAt: 1, layStartedAt: 1, startAnchor: null, savedAt: 1, status: 'resting',
  };
  await writePendingNow('dog-A', p);
  return p;
};
const expectUntouched = async (pending: PendingTrack) => {
  expect(mockRecordCancelled).not.toHaveBeenCalled();
  expect(useTrackingStore.getState().sessionStatus).toBe('resting');
  expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ status: 'resting', sessionId: 'sess-A' });
  expect(await loadPending('dog-A')).toEqual(pending);
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
  it('1–5. Dialog: Im Hintergrund weiterlaufen · Zum endgültigen Abbrechen gedrückt halten · Zurück (kein nativer Alert)', () => {
    const e = leave();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
    const t = dialogTexts();
    expect(t).toEqual(['Liegezeit läuft',
      'Die Liegezeit läuft weiter, auch wenn du diesen Bildschirm verlässt. Du kannst später jederzeit zu dieser Fährte zurückkehren.',
      'Im Hintergrund weiterlaufen', 'Zum endgültigen Abbrechen gedrückt halten', 'Zurück']);
    for (const old of ['Weiterlaufen lassen', 'Liegezeit beenden', 'Fährte abbrechen']) expect(t).not.toContain(old);
    expect(byId('resting-leave-abort-hold').props.accessibilityLabel).toBe('Fährte endgültig abbrechen');
  });

  it('6. „Im Hintergrund weiterlaufen" nutzt den bisherigen „Weiterlaufen lassen"-Handler (nur verlassen, keine Seiteneffekte)', () => {
    const src = fs.readFileSync('app/track/liegen.tsx', 'utf8');
    const body = src.match(/const keepRunningInBackground = \(action: unknown\) => \{([\s\S]*?)\n  \};/)![1];
    expect(body).toContain('allowLeaveRef.current = true;');
    expect(body).toContain('navigation.dispatch(action);');
    expect(body).not.toMatch(/endLiegezeitNotification|recordTrackCancelled|setSessionStatus|remove\(|writePending|clearPending/);
    expect(src).not.toContain('leaveEndLyingTime');
    expect(src).not.toContain('endLyingTime');
  });

  it('6. „Im Hintergrund weiterlaufen": verlässt den Screen; Liegezeit + Anzeige laufen weiter; kein cancelled, Registry + Puffer unverändert', async () => {
    const pending = await writePending();
    const regBefore = JSON.stringify(useActiveFaehrten.getState().byDog);
    const layStartedAt = useTrackingStore.getState().layStartedAt;
    leave();
    tap('resting-leave-background');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockEndNotification).not.toHaveBeenCalled();                       // Benachrichtigung/Live Activity läuft weiter
    expect(useTrackingStore.getState().layStartedAt).toBe(layStartedAt);     // Liegezeit läuft weiter (Start unverändert)
    expect(JSON.stringify(useActiveFaehrten.getState().byDog)).toBe(regBefore);
    await expectUntouched(pending);
    expect(dialogOpen()).toBe(false);
  });

  it('8. „Zurück" schliesst nur den Dialog: auf dem Liegezeit-Screen bleiben, nichts geschrieben', async () => {
    const pending = await writePending();
    leave();
    tap('resting-leave-back');
    expect(dialogOpen()).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEndNotification).not.toHaveBeenCalled();
    expect(byId('resting-identity-missing')).toBeUndefined();
    await expectUntouched(pending);
  });

  it('A. kurzer Tap auf „Fährte endgültig abbrechen" → kein Abbruch, keine Navigation, Puffer bleibt', async () => {
    const pending = await writePending();
    leave();
    holdAbort(150);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEndNotification).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
    await expectUntouched(pending);
  });

  it('B. Hold knapp unter der Grenze (1490 ms) → kein Abbruch', async () => {
    const pending = await writePending();
    leave();
    holdAbort(HOLD_TO_ABORT_MS - 10);
    expect(mockDispatch).not.toHaveBeenCalled();
    await expectUntouched(pending);
  });

  it('C. vollständiger Hold (1500 ms) → bestehender Abbruch genau einmal: richtige Session/Hund, cancelled, Marker, Navigation; keine zweite Box', () => {
    leave();
    holdAbort(HOLD_TO_ABORT_MS);
    expect(mockRecordCancelled).toHaveBeenCalledTimes(1);
    expect(mockRecordCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(useTrackingStore.getState().sessionStatus).toBe('cancelled');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(mockEndNotification).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(alertSpy).not.toHaveBeenCalled();                                  // Hold IST die Bestätigung
    expect(dialogOpen()).toBe(false);
  });

  it('D. langer Hold (3000 ms) → trotzdem nur EIN Abbruch / EINE Navigation', () => {
    leave();
    holdAbort(3000);
    expect(mockRecordCancelled).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('K. Bedienungshilfen: „Aktivieren" bricht nicht direkt ab, sondern zeigt die ausdrückliche Bestätigung; „Nein" ändert nichts', async () => {
    const pending = await writePending();
    leave();
    act(() => { byId('resting-leave-abort-hold').props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }); });
    expect(mockRecordCancelled).not.toHaveBeenCalled();
    const [title, msg, buttons] = lastAlert();
    expect(title).toBe('Fährte endgültig abbrechen?');
    expect(msg).toContain('kann danach aber nicht mehr fortgesetzt oder abgesucht werden.');
    expect(buttons.map(b => b.text)).toEqual(['Nein', 'Endgültig abbrechen']);
    expect(buttons.find(b => b.text === 'Nein')!.onPress).toBeUndefined();   // reines Schliessen
    expect(mockDispatch).not.toHaveBeenCalled();
    await expectUntouched(pending);
  });

  it('K. Bedienungshilfen: erst „Endgültig abbrechen" in der Bestätigung bricht ab (cancelled + Marker resting_abort)', () => {
    leave();
    act(() => { byId('resting-leave-abort-hold').props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }); });
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
    pressAlert('Endgültig abbrechen');
    expect(useTrackingStore.getState().sessionStatus).toBe('cancelled');
    expect(useActiveFaehrten.getState().get('dog-A')).toBeNull();
    expect(mockRecordCancelled).toHaveBeenCalledWith('sess-A', 'dog-A', 'resting_abort');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('Navigation/Unmount während des Haltens → kein verzögerter Abbruch', () => {
    leave();
    jest.useFakeTimers();
    try {
      act(() => { byId('resting-leave-abort-hold').props.onPressIn(); });
      act(() => { jest.advanceTimersByTime(700); });
      act(() => { renderer.unmount(); }); renderer = null;
      act(() => { jest.advanceTimersByTime(5000); });
    } finally { jest.useRealTimers(); }
    expect(mockRecordCancelled).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
  });
});
