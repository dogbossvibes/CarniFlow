import { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, Platform } from 'react-native';
import { useFieldVoiceControl } from '../useFieldVoiceControl';
import type { FieldVoiceEffect } from '@/features/voice/services/fieldVoiceController';
import { NORMAL_RESTART_MS, RESTART_BACKOFF_MS, STABLE_MS } from '@/features/voice/services/recognitionPlan';
import { ECHO_GRACE_MS } from '@/features/voice/services/speechEchoGate';

// Verhalten des Hooks mit nachgebildeter Spracherkennung (Release-Review 2026-11-25).
const mockHandlers: Record<string, (e: unknown) => void> = {};
const mockModule = {
  start: jest.fn(), stop: jest.fn(), abort: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getSupportedLocales: jest.fn(async () => ({ installedLocales: ['de-DE'] })),
  supportsOnDeviceRecognition: () => true,
};
jest.mock('@/features/voice/services/speechRecognition', () => ({
  SPEECH_RECOGNITION_AVAILABLE: true,
  get SpeechModule() { return mockModule; },
  useSpeechRecognitionEvent: (name: string, cb: (e: unknown) => void) => { mockHandlers[name] = cb; },
}));
let mockSpeech = { speaking: false, endedAtMs: 0 };
jest.mock('@/features/tracking/utils/voiceEvents', () => ({ appSpeechActivity: () => mockSpeech }));
jest.mock('@/lib/undoToast', () => ({ UNDO_TOAST_DURATION_MS: 7000 }));

type Api = ReturnType<typeof useFieldVoiceControl>;
const probe: { api: Api | null } = { api: null };
const effects: FieldVoiceEffect[] = [];
let appStateListener: ((s: string) => void) | null = null;

function Probe({ mode }: { mode: 'lay' | 'search' }) {
  const value = useFieldVoiceControl(mode, e => effects.push(e));
  useEffect(() => { probe.api = value; });
  return null;
}
function setPlatform(os: 'ios' | 'android', version: string | number) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}
async function mount(mode: 'lay' | 'search' = 'lay') {
  await act(async () => { TestRenderer.create(<Probe mode={mode} />); });
  await act(async () => { await probe.api!.enable(); });
}
const emit = (name: string, e: unknown = {}) => act(() => { mockHandlers[name]?.(e); });
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
  effects.length = 0;
  Object.values(mockModule).forEach(f => typeof f === 'function' && 'mockClear' in f && (f as jest.Mock).mockClear());
  mockModule.requestPermissionsAsync.mockImplementation(async () => ({ granted: true }));
  mockSpeech = { speaking: false, endedAtMs: 0 };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, l) => { appStateListener = l as (s: string) => void; return { remove: jest.fn() } as never; });
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' });
  setPlatform('android', 34);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('1) beste Alternative', () => {
  it('wertet results[0] aus und fordert nur eine Alternative an', async () => {
    await mount();
    expect(mockModule.start).toHaveBeenLastCalledWith(expect.objectContaining({ maxAlternatives: 1, continuous: true, interimResults: false }));
    emit('result', { isFinal: true, results: [{ transcript: 'Winkel links' }, { transcript: 'Winkel rechts' }] });
    expect(effects).toEqual([{ kind: 'action', command: { type: 'CORNER', angleKind: 'links' } }]);
  });
});

describe('2) iOS bis 17', () => {
  it('Befehl aus stabilem Zwischenergebnis, ohne auf den Stopp zu warten; Endergebnis nicht doppelt', async () => {
    setPlatform('ios', '17.5');
    await mount();
    expect(mockModule.start).toHaveBeenLastCalledWith(expect.objectContaining({ continuous: false, interimResults: true }));
    emit('result', { isFinal: false, results: [{ transcript: 'Gegenstand' }] });
    expect(effects).toHaveLength(0);
    await advance(STABLE_MS + 250);
    expect(effects).toEqual([{ kind: 'action', command: { type: 'ARTICLE' } }]);
    expect(mockModule.abort).toHaveBeenCalledTimes(1);   // Sitzung beenden → neue Äusserung
    emit('result', { isFinal: true, results: [{ transcript: 'Gegenstand' }] });
    expect(effects).toHaveLength(1);
    emit('end');
    await advance(NORMAL_RESTART_MS);
    expect(mockModule.start).toHaveBeenCalledTimes(2);
  });
  it('iOS 18: wie Android continuous mit Endergebnis', async () => {
    setPlatform('ios', '18.1');
    await mount();
    expect(mockModule.start).toHaveBeenLastCalledWith(expect.objectContaining({ continuous: true, interimResults: false }));
  });
});

describe('3) eigene Ansage', () => {
  it('während der Ansage stumm, danach neu; Echo löst keinen Marker aus', async () => {
    await mount();
    mockSpeech = { speaking: true, endedAtMs: 0 };
    await advance(250);
    expect(mockModule.abort).toHaveBeenCalledTimes(1);
    emit('result', { isFinal: true, results: [{ transcript: 'Winkel links' }] });   // Echo «Winkel links»
    emit('end');
    await advance(5000);
    expect(mockModule.start).toHaveBeenCalledTimes(1);   // bleibt stumm, solange gesprochen wird
    mockSpeech = { speaking: false, endedAtMs: Date.now() };
    await advance(ECHO_GRACE_MS - 300);
    emit('result', { isFinal: true, results: [{ transcript: 'Winkel links' }] });   // verspätetes Echo
    expect(mockModule.start).toHaveBeenCalledTimes(1);
    await advance(600);
    expect(mockModule.start).toHaveBeenCalledTimes(2);
    expect(effects).toHaveLength(0);
    emit('result', { isFinal: true, results: [{ transcript: 'Winkel links' }] });   // echter Befehl danach
    expect(effects).toHaveLength(1);
  });
});

describe('4) Neustart mit Pause', () => {
  it('nach Fehlern mit wachsender Pause, nach fünf Fehlern in Folge Schluss', async () => {
    await mount();
    for (let i = 0; i < RESTART_BACKOFF_MS.length; i++) {
      emit('error', { error: 'network' }); emit('end');
      await advance(RESTART_BACKOFF_MS[i] - 1);
      expect(mockModule.start).toHaveBeenCalledTimes(i + 1);
      await advance(1);
      expect(mockModule.start).toHaveBeenCalledTimes(i + 2);
    }
    emit('error', { error: 'audio-capture' }); emit('end');
    await advance(60_000);
    expect(mockModule.start).toHaveBeenCalledTimes(RESTART_BACKOFF_MS.length + 1);
    expect(probe.api!.status).toBe('error');
  });
  it('im Hintergrund aus, im Vordergrund wieder an', async () => {
    await mount();
    act(() => { appStateListener?.('background'); });
    expect(mockModule.abort).toHaveBeenCalledTimes(1);
    emit('end');
    await advance(10_000);
    expect(mockModule.start).toHaveBeenCalledTimes(1);
    act(() => { appStateListener?.('active'); });
    expect(mockModule.start).toHaveBeenCalledTimes(2);
  });
});

describe('5) keine Rechte', () => {
  it('not-allowed: Status bleibt «denied», kein Neustart, kein wiederholtes Einschalten', async () => {
    await mount();
    emit('error', { error: 'not-allowed' });
    emit('end');
    await advance(30_000);
    expect(probe.api!.status).toBe('denied');
    expect(mockModule.start).toHaveBeenCalledTimes(1);
  });
});
