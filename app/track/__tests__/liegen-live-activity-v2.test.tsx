// Liegezeit-Screen ↔ Live Activity V2 über die ECHTE Kette (liegen.tsx → liegezeitNotification →
// liegezeitLiveActivity); nur ActivityKit ist ein Fake mit exakter dogId+sessionId-Zuordnung.
// Prüft: echter Hundename, Zeitbasis = persistierter Liegezeit-Beginn, Multi-Dog, Ende nur der
// eigenen Activity (Abbruch/Absuche), „Im Hintergrund weiterlaufen" lässt sie laufen, Deep-Link
// der Activity landet über die bestehende fail-closed-Identität auf genau dieser Fährte.
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
jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(), scheduleNotificationAsync: jest.fn(async () => 'n'), dismissNotificationAsync: jest.fn(),
}));
type FakeActivity = { activityId: string; dogId: string; sessionId: string; input: any };
const mockActs: FakeActivity[] = [];
const mockEnds: [string, string][] = [];
let mockSeq = 0;
jest.mock('@/modules/anyvo-resting-activity', () => ({
  isRestingActivityModuleAvailable: () => true,
  isRestingActivitySupported: () => true,
  startRestingActivity: (input: any) => {
    const hit = mockActs.find(a => a.dogId === input.dogId && a.sessionId === input.sessionId);
    if (hit) return hit.activityId;
    mockActs.push({ activityId: `act-${++mockSeq}`, dogId: input.dogId, sessionId: input.sessionId, input });
    return `act-${mockSeq}`;
  },
  endRestingActivity: async (dogId: string, sessionId: string) => {
    mockEnds.push([dogId, sessionId]);
    for (let i = mockActs.length - 1; i >= 0; i--) if (mockActs[i].dogId === dogId && mockActs[i].sessionId === sessionId) mockActs.splice(i, 1);
    return 1;
  },
  endRestingActivityById: jest.fn(), listRestingActivities: () => [], endLegacyRestingActivities: jest.fn(),
}));
const DOGS: Record<string, string> = { 'dog-A': 'Skadi', 'dog-B': 'Yam' };
let mockDogsOnline = true;
jest.mock('@/services/dogs', () => ({
  getDogById: async (id: string) => {
    if (!mockDogsOnline) throw new Error('offline');
    return { data: DOGS[id] ? { id, name: DOGS[id] } : null, error: null };
  },
}));
jest.mock('@/features/tracking/services/trackService', () => ({
  setTrackLyingTime: jest.fn(async () => undefined),
  getTrackSessionDogName: jest.fn(async () => ({ data: null })),   // lokale Fährte: noch keine Remote-Zeile
}));
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({ recordTrackCancelled: jest.fn(async () => true) }));
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
import { HOLD_TO_ABORT_MS } from '@/features/tracking/components/RestingLeaveDialog';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { writePendingNow, type PendingTrack } from '@/features/tracking/store/trackPersist';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

const T_A = Date.parse('2026-10-05T10:15:00.000Z');   // Liegezeit A begann 10:15
const T_B = Date.parse('2026-10-05T10:40:00.000Z');
const pending = (dog: 'A' | 'B', layStartedAt: number): PendingTrack => ({
  sessionId: `sess-${dog}`, dogId: `dog-${dog}`,
  trackPoints: [0, 1, 2].map(i => ({ lat: 47 + i * 1e-4, lng: 8, accuracy: 4, t: layStartedAt - 60_000 + i * 1000 })),
  markers: [], runPoints: [], distanceMeters: 100, durationSeconds: 60,
  layFinishedAt: layStartedAt, layStartedAt, startAnchor: null, savedAt: layStartedAt, status: 'resting',
});
type Rendered = any;
let renderer: Rendered = null;
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const mount = async (params: Record<string, string | undefined>) => {
  if (renderer) { act(() => { renderer.unmount(); }); renderer = null; }
  mockParams = params;
  await act(async () => { renderer = TestRenderer.create(<LiegenScreen />); });
  await settle();
};
const byTestId = (id: string) => renderer.root.findAll((n: Rendered) => n.props.testID === id)[0];
const leave = () => act(() => { mockBeforeRemove!({ preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }); });
const urlParams = (url: string) => Object.fromEntries(new URL(url).searchParams) as Record<string, string>;

beforeAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(async () => {
  await AsyncStorage.clear();
  mockActs.length = 0; mockEnds.length = 0; mockDogsOnline = true; mockBeforeRemove = null; mockReplace.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useTrackingStore.setState({ dogId: null, currentSessionId: null, sessionStatus: 'resting', trackPoints: [], layStartedAt: null, isRecording: false } as never);
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  await writePendingNow('dog-A', pending('A', T_A));
  await writePendingNow('dog-B', pending('B', T_B));
  useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A', layStartedAt: T_A });
  useActiveFaehrten.getState().upsert('dog-B', { status: 'resting', sessionId: 'sess-B', layStartedAt: T_B });
});
afterEach(() => { if (renderer) act(() => { renderer.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('Start aus dem Liegezeit-Screen', () => {
  it('echter Hundename (über dogId, ohne Remote-Session-Zeile), Zeitbasis = persistierter Liegezeit-Beginn', async () => {
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(mockActs).toHaveLength(1);
    const a = mockActs[0].input;
    expect(a).toMatchObject({ dogId: 'dog-A', sessionId: 'sess-A', dogName: 'Skadi', lyingStartedAtMs: T_A, lyingLabel: 'Liegezeit', sinceLabel: 'seit' });
    expect(a.dogName).not.toBe('Hund');
    expect(urlParams(a.deepLinkUrl)).toEqual({ dogId: 'dog-A', id: 'sess-A' });
  });
  it('Hund offline nicht auflösbar → neutrale Beschriftung „Fährte", nie „Hund"', async () => {
    mockDogsOnline = false;
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(mockActs[0].input.dogName).toBe('Fährte');
  });
  it('Multi-Dog: A und B öffnen → zwei Activities mit eigenem Namen und eigener Zeitbasis', async () => {
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    await mount({ id: 'sess-B', dogId: 'dog-B' });
    expect(mockActs.map(x => [x.dogId, x.input.dogName, x.input.lyingStartedAtMs])).toEqual([
      ['dog-A', 'Skadi', T_A], ['dog-B', 'Yam', T_B],
    ]);
  });
  it('erneutes Öffnen derselben Fährte → keine zweite Activity, keine neue Zeitbasis', async () => {
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(mockActs).toHaveLength(1);
    expect(mockActs[0].input.lyingStartedAtMs).toBe(T_A);
  });
});

describe('Verlassen / Abbruch / Absuche', () => {
  beforeEach(async () => {
    await mount({ id: 'sess-B', dogId: 'dog-B' });
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    expect(mockActs).toHaveLength(2);
  });
  it('„Im Hintergrund weiterlaufen" → Activity läuft weiter (nichts beendet)', () => {
    leave();
    act(() => { byTestId('resting-leave-background').props.onPress(); });
    expect(mockEnds).toEqual([]);
    expect(mockActs).toHaveLength(2);
  });
  it('endgültiger Abbruch (1,5-s-Hold) von A → nur Activity A endet, B bleibt', () => {
    leave();
    jest.useFakeTimers();
    try {
      act(() => { byTestId('resting-leave-abort-hold').props.onPressIn(); });
      act(() => { jest.advanceTimersByTime(HOLD_TO_ABORT_MS); });
    } finally { jest.useRealTimers(); }
    expect(mockEnds).toEqual([['dog-A', 'sess-A']]);
    expect(mockActs.map(x => x.dogId)).toEqual(['dog-B']);
  });
  it('kurzer Tap auf Abbrechen → keine Activity beendet', () => {
    leave();
    jest.useFakeTimers();
    try {
      act(() => { byTestId('resting-leave-abort-hold').props.onPressIn(); });
      act(() => { jest.advanceTimersByTime(200); });
      act(() => { byTestId('resting-leave-abort-hold').props.onPressOut(); });
      act(() => { jest.advanceTimersByTime(3000); });
    } finally { jest.useRealTimers(); }
    expect(mockEnds).toEqual([]);
  });
  it('Absuche starten (A) → nur Activity A endet (bisheriges Verhalten), B bleibt', async () => {
    const search = renderer.root.findAll((n: Rendered) => typeof n.props.onPress === 'function' && n.findAll((c: Rendered) => c.props.children === 'Absuche starten' || c.props.children === 'Absuchen').length > 0)[0]
      ?? renderer.root.findAll((n: Rendered) => n.props.accessibilityLabel && /Absuche/.test(String(n.props.accessibilityLabel)))[0];
    expect(search).toBeTruthy();
    await act(async () => { await search.props.onPress(); });
    expect(mockEnds).toEqual([['dog-A', 'sess-A']]);
    expect(mockActs.map(x => x.dogId)).toEqual(['dog-B']);
  });
});

describe('Deep-Link der Activity → bestehende fail-closed-Identität', () => {
  const urlOf = (dog: 'A' | 'B') => mockActs.find(x => x.dogId === `dog-${dog}`)!.input.deepLinkUrl as string;
  const missing = () => !!byTestId('resting-identity-missing');
  beforeEach(async () => {
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    await mount({ id: 'sess-B', dogId: 'dog-B' });
    act(() => { renderer.unmount(); }); renderer = null;
    useTrackingStore.setState({ dogId: null, currentSessionId: null, trackPoints: [], layStartedAt: null } as never);
  });
  it('Tap A öffnet A, Tap B öffnet B (dogId + sessionId)', async () => {
    await mount(urlParams(urlOf('A')));
    expect(missing()).toBe(false);
    expect(useTrackingStore.getState().dogId).toBe('dog-A');
    await mount(urlParams(urlOf('B')));
    expect(missing()).toBe(false);
    expect(useTrackingStore.getState().dogId).toBe('dog-B');
  });
  it('falsche dogId zur sessionId → blockiert (kein Cross-Dog)', async () => {
    await mount({ dogId: 'dog-B', id: 'sess-A' });
    expect(missing()).toBe(true);
  });
  it('unbekannte sessionId → blockiert', async () => {
    await mount({ dogId: 'dog-A', id: 'sess-UNKNOWN' });
    expect(missing()).toBe(true);
  });
  it('Legacy-Weg nur mit sessionId → bestehende sichere Auflösung über die Session', async () => {
    await mount({ id: 'sess-B' });
    expect(missing()).toBe(false);
    expect(useTrackingStore.getState().dogId).toBe('dog-B');
  });
});

describe('Zeitbasis = Lege-ENDE (nicht Aufnahmestart) — Production-Datenfluss', () => {
  it('10:00 Legen gestartet → 10:10 Lege-Ende → 10:20 Prüfung: Screen UND Activity ≈ 10 min, nicht 20', async () => {
    const t1000 = Date.parse('2026-10-05T10:00:00.000Z');
    const t1010 = t1000 + 10 * 60_000;
    const t1020 = t1000 + 20 * 60_000;
    const now = jest.spyOn(Date, 'now');
    await AsyncStorage.clear();
    useActiveFaehrten.setState({ byDog: {}, hydrated: true });
    // 10:00 — Aufnahme startet (Registry hält den Aufnahmestart separat in startedAt)
    now.mockReturnValue(t1000);
    useActiveFaehrten.getState().upsert('dog-A', { status: 'laying', sessionId: 'sess-A', startedAt: t1000 });
    useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: null, sessionStatus: 'laying', trackPoints: pending('A', t1010).trackPoints, isRecording: true } as never);
    // 10:10 — exakt die Production-Übergänge beim Lege-Ende:
    now.mockReturnValue(t1010);
    useTrackingStore.getState().setLayFinishedAt(Date.now());   // useTrackRecorder.finish()
    useActiveFaehrten.getState().upsert('dog-A', { status: 'resting', sessionId: 'sess-A', layStartedAt: Date.now() });   // legen.finishTrack()
    expect(useTrackingStore.getState().layStartedAt).toBe(t1010);
    expect(useActiveFaehrten.getState().get('dog-A')).toMatchObject({ startedAt: t1000, layStartedAt: t1010 });
    // 10:20 — Liegezeit-Screen + Live Activity
    now.mockReturnValue(t1020);
    await mount({ id: 'sess-A', dogId: 'dog-A' });
    const shown = renderer.root.findAllByType('Text' as never).map((n: Rendered) => [].concat(n.props.children).join(''));
    expect(shown).toContain('10:00');       // fmtAge(600 s)
    expect(shown).not.toContain('20:00');
    expect(mockActs[0].input.lyingStartedAtMs).toBe(t1010);
    expect((t1020 - mockActs[0].input.lyingStartedAtMs) / 60_000).toBe(10);
  });
});
