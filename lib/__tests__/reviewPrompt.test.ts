import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import {
  cancelPendingReviewPrompt, isTrackingBusy, noteFirstLaunch, onTrainingSaved, requestNativeReview,
  reviewKeyForUser, cancellableWait, type CancelSignal, type ReviewPromptDeps,
} from '../reviewPrompt';

jest.unmock('@/lib/reviewPrompt');

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.9' }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25, 12);

const deps = (over: Partial<ReviewPromptDeps> = {}): ReviewPromptDeps => ({
  now: () => NOW,
  appVersion: () => '1.0.9',
  trackingBusy: () => false,
  appActive: () => true,
  request: jest.fn().mockResolvedValue('requested'),
  wait: jest.fn().mockResolvedValue(undefined),
  ...over,
});

const stored = async (user = 'u1') => JSON.parse((await AsyncStorage.getItem(reviewKeyForUser(user))) ?? 'null');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('noteFirstLaunch', () => {
  it('merkt den ersten Start und überschreibt ihn nie', async () => {
    await noteFirstLaunch(NOW - 10 * DAY);
    await noteFirstLaunch(NOW);
    expect(await AsyncStorage.getItem('anyvo_review_first_launch_v1')).toBe(String(NOW - 10 * DAY));
  });
});

describe('onTrainingSaved', () => {
  beforeEach(async () => { await noteFirstLaunch(NOW - 8 * DAY); });

  it('fragt erst beim 3. Speichern, nach der Verzögerung', async () => {
    const d = deps();
    expect(await onTrainingSaved('u1', 'x1', 'success', d)).toBe(false);
    expect(await onTrainingSaved('u1', 'x2', 'success', d)).toBe(false);
    expect(d.request).not.toHaveBeenCalled();
    expect(await onTrainingSaved('u1', 'x3', 'success', d)).toBe(true);
    expect(d.wait).toHaveBeenCalledWith(2500, expect.anything());
    expect(d.request).toHaveBeenCalledTimes(1);
    expect(await stored()).toEqual(expect.objectContaining({ successfulSaves: 3, lastPromptAt: NOW, lastPromptVersion: '1.0.9' }));
  });

  it('fragt in derselben Version kein zweites Mal', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e4-${i}`, 'success', d);
    expect(await onTrainingSaved('u1', 'x5', 'success', d)).toBe(false);
    expect(d.request).toHaveBeenCalledTimes(1);
  });

  it('zählt je Nutzer getrennt', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e6-${i}`, 'success', d);
    expect(await onTrainingSaved('u2', 'x7', 'success', d)).toBe(false);
    expect((await stored('u2')).successfulSaves).toBe(1);
  });

  it('zählt Fehler und Abbrüche nicht und fragt danach nicht', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e8-${i}`, 'error', d);
    await onTrainingSaved('u1', 'x9', 'cancelled', d);
    expect(await AsyncStorage.getItem(reviewKeyForUser('u1'))).toBeNull();
    expect(d.request).not.toHaveBeenCalled();
  });

  it('fragt nicht, solange eine Fährte gelegt, liegt oder gesucht wird', async () => {
    const d = deps({ trackingBusy: () => true });
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e10-${i}`, 'success', d);
    expect(d.request).not.toHaveBeenCalled();
    expect((await stored()).successfulSaves).toBe(3);
  });

  it('fragt nicht, wenn die App inzwischen im Hintergrund ist', async () => {
    const d = deps({ appActive: () => false });
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e11-${i}`, 'success', d);
    expect(d.request).not.toHaveBeenCalled();
  });

  it('merkt keine Abfrage, wenn das native Modul fehlt', async () => {
    const d = deps({ request: jest.fn().mockResolvedValue('unavailable') });
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `e12-${i}`, 'success', d);
    expect(await stored()).toEqual(expect.objectContaining({ successfulSaves: 3, lastPromptAt: null, lastPromptVersion: null }));
  });

  it('zählt dieselbe Fährte/Einheit nur einmal', async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) await onTrainingSaved('u1', 'same-run', 'success', d);
    expect((await stored()).successfulSaves).toBe(1);
    expect(d.request).not.toHaveBeenCalled();
  });

  it('fragt nicht, wenn die Auswertung vor Ablauf der Verzögerung verlassen wird', async () => {
    const d = deps();
    for (let i = 0; i < 2; i++) await onTrainingSaved('u1', `c${i}`, 'success', d);
    const wait = jest.fn((_ms: number, signal: { cancelled: boolean }) => {
      cancelPendingReviewPrompt();
      expect(signal.cancelled).toBe(true);
      return Promise.resolve();
    });
    expect(await onTrainingSaved('u1', 'c2', 'success', deps({ wait, request: d.request }))).toBe(false);
    expect(d.request).not.toHaveBeenCalled();
  });

  it('merkt die Abfrage auch bei einem Fehler des Systemdialogs', async () => {
    const d = deps({ request: jest.fn().mockResolvedValue('failed') });
    for (let i = 0; i < 3; i++) await onTrainingSaved('u1', `f${i}`, 'success', d);
    expect((await stored()).lastPromptAt).toBe(NOW);
    expect(await onTrainingSaved('u1', 'f3', 'success', d)).toBe(false);
    expect(d.request).toHaveBeenCalledTimes(1);
  });

  it('echte Verzögerung lässt sich abbrechen, ohne Timer zurückzulassen', async () => {
    jest.useFakeTimers();
    try {
      const signal: CancelSignal = { cancelled: false };
      const p = cancellableWait(2500, signal);
      expect(jest.getTimerCount()).toBe(1);
      signal.cancel?.();
      await p;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('macht ohne Nutzer nichts', async () => {
    const d = deps();
    expect(await onTrainingSaved(null, 'x13', 'success', d)).toBe(false);
    expect(d.wait).not.toHaveBeenCalled();
  });

  it('wirft nie, auch bei kaputtem Speicherstand', async () => {
    await AsyncStorage.setItem(reviewKeyForUser('u1'), '{kaputt');
    await expect(onTrainingSaved('u1', 'x14', 'success', deps())).resolves.toBe(false);
  });
});

describe('requestNativeReview', () => {
  it('tut nichts ohne natives Modul (alte Builds)', async () => {
    await expect(requestNativeReview(null)).resolves.toBe('unavailable');
    await expect(requestNativeReview({})).resolves.toBe('unavailable');
  });

  it('fragt nur, wenn das Modul verfügbar meldet', async () => {
    const requestReview = jest.fn().mockResolvedValue(undefined);
    await expect(requestNativeReview({ isAvailableAsync: async () => false, requestReview })).resolves.toBe('unavailable');
    expect(requestReview).not.toHaveBeenCalled();
    await expect(requestNativeReview({ isAvailableAsync: async () => true, requestReview })).resolves.toBe('requested');
    expect(requestReview).toHaveBeenCalledTimes(1);
  });

  it('fängt Fehler des Moduls ab', async () => {
    const native = { isAvailableAsync: async () => true, requestReview: jest.fn().mockRejectedValue(new Error('x')) };
    await expect(requestNativeReview(native)).resolves.toBe('failed');
  });

  it('lädt das Modul optional, ohne zu werfen', async () => {
    await expect(requestNativeReview()).resolves.toBe('unavailable');
  });
});

describe('isTrackingBusy', () => {
  const entry = (status: 'laying' | 'resting' | 'searching') => ({
    dogId: 'd1', sessionId: null, runId: null, status, startedAt: NOW, layStartedAt: null, searchStartedAt: null,
    distanceMeters: 0, winkelCount: 0, objektCount: 0, gpsAccuracy: null, weather: null, updatedAt: NOW,
  });

  afterEach(() => {
    useActiveFaehrten.setState({ hydrated: false, byDog: {} });
    useTrackingStore.setState({ isRecording: false, searchRunId: null });
  });

  it('gilt als beschäftigt, solange die Registry nicht geladen ist', () => {
    useActiveFaehrten.setState({ hydrated: false, byDog: {} });
    expect(isTrackingBusy()).toBe(true);
  });

  it.each(['laying', 'resting', 'searching'] as const)('beschäftigt bei offener Fährte (%s)', (status) => {
    useActiveFaehrten.setState({ hydrated: true, byDog: { d1: entry(status) } });
    expect(isTrackingBusy()).toBe(true);
  });

  it('beschäftigt während Aufnahme oder Absuche im Recorder', () => {
    useActiveFaehrten.setState({ hydrated: true, byDog: {} });
    useTrackingStore.setState({ isRecording: true });
    expect(isTrackingBusy()).toBe(true);
    useTrackingStore.setState({ isRecording: false, searchRunId: 'r1' });
    expect(isTrackingBusy()).toBe(true);
  });

  it('frei ohne offene Fährte', () => {
    useActiveFaehrten.setState({ hydrated: true, byDog: {} });
    useTrackingStore.setState({ isRecording: false, searchRunId: null });
    expect(isTrackingBusy()).toBe(false);
  });
});
