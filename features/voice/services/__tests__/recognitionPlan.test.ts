import {
  bestTranscript, classifyError, createSessionGate, isLegacyIos, MAX_FAILED_RESTARTS, NORMAL_RESTART_MS,
  recognitionOptions, RESTART_BACKOFF_MS, restartDelay, STABLE_MS,
} from '../recognitionPlan';
import { acceptsRecognition, ECHO_GRACE_MS, sessionOverlapsSpeech, shouldMute } from '../speechEchoGate';
import { FIELD_CONTEXT_STRINGS, parseFieldCommand } from '../fieldVoiceCommands';
import { actionKey, confirmationKey, type FieldVoiceEffect } from '../fieldVoiceController';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

describe('1) beste Alternative', () => {
  it('results[0] ist die beste Alternative – nie die letzte', () => {
    expect(bestTranscript([{ transcript: 'Winkel links' }, { transcript: 'Winkel Linz' }, { transcript: 'Wilhelm links' }])).toBe('Winkel links');
    expect(bestTranscript([])).toBeNull();
    expect(bestTranscript([{ transcript: '  ' }])).toBeNull();
    expect(bestTranscript(undefined)).toBeNull();
  });
  it('nur eine Alternative wird angefordert', () => {
    const o = recognitionOptions({ os: 'android', version: 34 }, { lang: 'de-CH', onDevice: true }, FIELD_CONTEXT_STRINGS.lay);
    expect(o).toMatchObject({ maxAlternatives: 1, lang: 'de-CH', requiresOnDeviceRecognition: true, addsPunctuation: false });
  });
});

describe('2) iOS bis 17', () => {
  it('erkennt iOS bis 17 an der Version (Zahl oder Text)', () => {
    expect(isLegacyIos({ os: 'ios', version: '17.5' })).toBe(true);
    expect(isLegacyIos({ os: 'ios', version: '16.7.2' })).toBe(true);
    expect(isLegacyIos({ os: 'ios', version: '18.0' })).toBe(false);
    expect(isLegacyIos({ os: 'ios', version: '26.1' })).toBe(false);
    expect(isLegacyIos({ os: 'android', version: 17 })).toBe(false);
  });
  it('iOS bis 17: continuous aus, Zwischenergebnisse an; sonst continuous mit Endergebnissen', () => {
    const s = { lang: 'de-DE', onDevice: false };
    expect(recognitionOptions({ os: 'ios', version: '17.4' }, s, [])).toMatchObject({ continuous: false, interimResults: true });
    expect(recognitionOptions({ os: 'ios', version: '18.2' }, s, [])).toMatchObject({ continuous: true, interimResults: false });
    expect(recognitionOptions({ os: 'android', version: 33 }, s, [])).toMatchObject({ continuous: true, interimResults: false });
  });
  it('stabiles Zwischenergebnis zählt nach STABLE_MS, einmal je Sitzung; Endergebnis danach nicht doppelt', () => {
    const g = createSessionGate();
    expect(g.push('Winkel', false, 0)).toBeNull();
    expect(g.push('Winkel links', false, 300)).toBeNull();   // ändert sich noch
    expect(g.due(300 + STABLE_MS - 1)).toBeNull();
    expect(g.due(300 + STABLE_MS)).toBe('Winkel links');
    expect(g.due(300 + STABLE_MS + 100)).toBeNull();        // nicht zweimal
    g.consume();
    expect(g.push('Winkel links', true, 3000)).toBeNull();   // späteres Endergebnis derselben Äusserung
    g.newSession();
    expect(g.push('Gegenstand', true, 4000)).toBe('Gegenstand');
  });
});

describe('3) eigene Ansage', () => {
  it('stumm während und bis 1,5 s nach einer Ansage', () => {
    expect(ECHO_GRACE_MS).toBe(1500);
    expect(shouldMute(10_000, { speaking: true, endedAtMs: 0 })).toBe(true);
    expect(shouldMute(10_000, { speaking: false, endedAtMs: 10_000 - ECHO_GRACE_MS + 1 })).toBe(true);
    expect(shouldMute(10_000, { speaking: false, endedAtMs: 10_000 - ECHO_GRACE_MS })).toBe(false);
    expect(acceptsRecognition(10_000, { speaking: false, endedAtMs: 0 })).toBe(true);
  });
  it('Ergebnis einer Sitzung, in die eine Ansage fiel, zählt nicht – auch wenn es spät kommt', () => {
    expect(sessionOverlapsSpeech(1000, { speaking: false, endedAtMs: 1500 })).toBe(true);
    expect(sessionOverlapsSpeech(2000, { speaking: false, endedAtMs: 1500 })).toBe(false);
    expect(sessionOverlapsSpeech(2000, { speaking: true, endedAtMs: 0 })).toBe(true);
  });
  it('keine Bestätigung klingt wie ein Befehl (alle Sprachen, Legen und Suchen)', () => {
    const effects: FieldVoiceEffect[] = [
      ...(['links', 'rechts', 'spitz_links', 'spitz_rechts'] as const).map(angleKind => ({ kind: 'action' as const, command: { type: 'CORNER' as const, angleKind } })),
      { kind: 'action', command: { type: 'ARTICLE' } }, { kind: 'action', command: { type: 'DISTRACTION' } },
      { kind: 'action', command: { type: 'ARTICLE_FOUND' } },
      ...(['down', 'sit', 'stand', 'retrieve'] as const).map(indication => ({ kind: 'action' as const, command: { type: 'INDICATION' as const, indication } })),
      { kind: 'undo', command: { type: 'ARTICLE' } }, { kind: 'nothing_to_undo' }, { kind: 'ask_end' },
      { kind: 'end_confirmed' }, { kind: 'end_cancelled' }, { kind: 'direction_missing' },
    ];
    const keys = [...effects.map(e => confirmationKey(e)!.key), actionKey({ type: 'ARTICLE_FOUND' }),
      'voiceField.started', 'voiceField.stopped', 'voiceField.notNow', 'voiceField.undoNotInLay', 'voiceField.undoNotInSearch'];
    for (const dict of [deCH, gswCH, fr, itLocale, en] as Record<string, string>[]) {
      for (const key of keys) {
        expect([key, parseFieldCommand(dict[key], 'lay')]).toEqual([key, null]);
        expect([key, parseFieldCommand(dict[key], 'search')]).toEqual([key, null]);
      }
    }
  });
});

describe('4) Neustart mit Pause', () => {
  it('normale Enden kurz, Fehler mit wachsender Pause, danach aufhören', () => {
    expect(restartDelay(0)).toBe(NORMAL_RESTART_MS);
    expect([1, 2, 3, 4, 5].map(restartDelay)).toEqual([...RESTART_BACKOFF_MS]);
    expect(restartDelay(MAX_FAILED_RESTARTS + 1)).toBeNull();
  });
  it('Fehlerarten', () => {
    for (const c of ['network', 'audio-capture', 'interrupted', 'busy', 'client', undefined]) expect(classifyError(c)).toBe('transient');
    for (const c of ['no-speech', 'speech-timeout', 'aborted', 'nomatch']) expect(classifyError(c)).toBe('normal');
    for (const c of ['not-allowed', 'service-not-allowed', 'language-not-supported']) expect(classifyError(c)).toBe('fatal');
  });
});
