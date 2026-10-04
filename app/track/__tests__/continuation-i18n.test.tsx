// Continuation-Flow in allen App-Sprachen: Liegezeit-Dialoge, endgültiger Abbruch, „Fährte wieder
// öffnen", „Fährte fortsetzen" — keine rohen Keys, keine deutschen Texte in EN/FR/IT.
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
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'sess-A', dogId: 'dog-A' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useNavigation: () => ({ addListener: (n: string, fn: (e: unknown) => void) => { if (n === 'beforeRemove') mockBeforeRemove = fn; return () => {}; }, dispatch: jest.fn() }),
}));
jest.mock('@/features/tracking/native/liegezeitNotification', () => ({
  startLiegezeitNotification: jest.fn(async () => undefined), updateLiegezeitNotification: jest.fn(async () => undefined), endLiegezeitNotification: jest.fn(async () => undefined),
}));
jest.mock('@/features/tracking/services/trackService', () => ({ setTrackLyingTime: jest.fn(), getTrackSessionDogName: jest.fn(async () => ({ data: null })) }));
const mockEvaluate = jest.fn();
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  recordTrackCancelled: jest.fn(async () => true),
  evaluateTrackRecovery: (...a: unknown[]) => mockEvaluate(...a),
  applyTrackRecovery: jest.fn(), completeTrackWithoutApp: jest.fn(), discardSearchAttempt: jest.fn(), reopenCancelledTrack: jest.fn(),
}));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: async () => ({ local_id: 'sess-A', dog_id: 'dog-A' }),
}));
jest.mock('@/features/tracking/utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => false }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import fs from 'fs';
import LiegenScreen from '@/app/track/liegen';
import { TrackResumeCta } from '@/features/tracking/components/TrackResumeCta';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import i18n from '@/i18n/config';
import { deCH } from '@/i18n/de-CH';
/* eslint-enable import/first */

type Btn = { text: string; onPress?: () => void };
type Rendered = any;
const LANGS = ['de', 'gsw', 'en', 'fr', 'it'] as const;
const EXPECT: Record<typeof LANGS[number], { leave: string; end: string; abort: string; confirm: string; resume: string; reopen: string; cancelledTitle: string }> = {
  de:  { leave: 'Liegezeit läuft', end: 'Liegezeit beenden', abort: 'Fährte endgültig abbrechen', confirm: 'Endgültig abbrechen', resume: 'Fährte fortsetzen', reopen: 'Fährte wieder öffnen', cancelledTitle: 'Diese Fährte wurde abgebrochen' },
  gsw: { leave: 'Liegeziit lauft', end: 'Liegeziit beende', abort: 'Fährte endgültig abbreche', confirm: 'Endgültig abbreche', resume: 'Fährte wiitermache', reopen: 'Fährte wieder ufmache', cancelledTitle: 'Die Fährte isch abbroche worde' },
  en:  { leave: 'Aging time running', end: 'End aging time', abort: 'Cancel track permanently', confirm: 'Cancel permanently', resume: 'Continue track', reopen: 'Reopen track', cancelledTitle: 'This track was cancelled' },
  fr:  { leave: 'Temps de repos en cours', end: 'Terminer le temps de repos', abort: 'Interrompre définitivement la piste', confirm: 'Interrompre définitivement', resume: 'Reprendre la piste', reopen: 'Rouvrir la piste', cancelledTitle: 'Cette piste a été interrompue' },
  it:  { leave: 'Tempo di posa in corso', end: 'Termina il tempo di posa', abort: 'Interrompi definitivamente la pista', confirm: 'Interrompi definitivamente', resume: 'Riprendi la pista', reopen: 'Riapri la pista', cancelledTitle: 'Questa pista è stata interrotta' },
};
const GERMAN_WORDS = /Fährte|Liegezeit|Absuche|abbrechen|fortsetzen|öffnen|Zurück|Nein\b/;
let alertSpy: jest.SpyInstance;
beforeEach(() => { alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); mockEvaluate.mockReset(); });
afterEach(async () => { jest.restoreAllMocks(); await act(async () => { await i18n.changeLanguage('de'); }); });

describe('Continuation-Texte: Vollständigkeit', () => {
  const keys = Object.keys(deCH).filter(k => k.startsWith('track.continuation.'));
  it('alle Keys existieren in gsw-CH/en/fr/it mit eigenem, nicht-leerem Text', () => {
    expect(keys.length).toBeGreaterThanOrEqual(40);
    for (const f of ['i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']) {
      const src = fs.readFileSync(f, 'utf8');
      for (const k of keys) expect(src).toMatch(new RegExp(`["']${k.replace(/\./g, '\\.')}["']: *["'][^"']+["']`));
    }
  });
});

describe.each(LANGS)('Sprache %s', lng => {
  const e = EXPECT[lng];
  const render = async (el: React.ReactElement) => {
    let r: Rendered;
    await act(async () => { await i18n.changeLanguage(lng); });
    await act(async () => { r = TestRenderer.create(el); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return r;
  };
  const texts = (r: Rendered) => r.root.findAllByType('Text' as never).map((n: Rendered) => [].concat(n.props.children).join('')).join('|');

  it('Liegezeit-Dialog + endgültiger Abbruchdialog übersetzt, keine rohen Keys', async () => {
    useTrackingStore.setState({ dogId: 'dog-A', currentSessionId: 'sess-A', sessionStatus: 'resting', trackPoints: [{ lat: 47, lng: 8, t: 1 } as never], layStartedAt: Date.now() } as never);
    const r = await render(<LiegenScreen />);
    act(() => { mockBeforeRemove!({ preventDefault: jest.fn(), data: { action: {} } }); });
    const [title, msg, buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, Btn[]];
    expect(title).toBe(e.leave);
    expect(buttons.map(b => b.text)).toEqual(expect.arrayContaining([e.end, e.abort]));
    act(() => { buttons.find(b => b.text === e.abort)!.onPress!(); });
    const [t2, m2, b2] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as [string, string, Btn[]];
    expect(b2.map(b => b.text)).toContain(e.confirm);
    const all = [title, msg, ...buttons.map(b => b.text), t2, m2, ...b2.map(b => b.text), texts(r)].join('|');
    expect(all).not.toMatch(/track\.continuation\.|\{\w+\}/);
    if (lng === 'en' || lng === 'fr' || lng === 'it') expect([title, msg, ...buttons.map(b => b.text), t2, m2, ...b2.map(b => b.text)].join('|')).not.toMatch(GERMAN_WORDS);
    act(() => { r.unmount(); });
  });

  it('„Fährte fortsetzen" und „Fährte wieder öffnen" übersetzt', async () => {
    mockEvaluate.mockResolvedValue({ ok: true, source: 'session', mode: 'resting', registryPatch: {}, pendingToWrite: null, target: '/t' });
    const a = await render(<TrackResumeCta sessionId="sess-A" dogId="dog-A" hasRemoteSearchRun={false} />);
    expect(texts(a)).toContain(e.resume);
    act(() => { a.unmount(); });
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'cancelled' });
    const b = await render(<TrackResumeCta sessionId="sess-A" dogId="dog-A" hasRemoteSearchRun={false} />);
    const t = texts(b);
    expect(t).toContain(e.reopen);
    expect(t).toContain(e.cancelledTitle);
    // Keine rohen Keys / technische Reason-Zeile / interne Begriffe (das englische Kundenwort „cancelled" ist erlaubt).
    expect(t).not.toMatch(/track\.continuation\.|Recovery:|lifecycle|pending|resting_abort/i);
    if (lng === 'en' || lng === 'fr' || lng === 'it') expect(t).not.toMatch(GERMAN_WORDS);
    act(() => { b.unmount(); });
  });
});
