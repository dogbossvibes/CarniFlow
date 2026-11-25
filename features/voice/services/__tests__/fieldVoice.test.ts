import { readFileSync } from 'fs';
import { FIELD_CONTEXT_STRINGS, parseFieldCommand } from '../fieldVoiceCommands';
import { actionKey, confirmationKey, createFieldVoiceController, DUPLICATE_WINDOW_MS, END_CONFIRM_MS, type FieldVoiceEffect } from '../fieldVoiceController';
import { acceptsRecognition, ECHO_GRACE_MS } from '../speechEchoGate';
import { chooseRecognitionSetup } from '../recognitionSetup';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

const lay = (t: string) => parseFieldCommand(t, 'lay');
const search = (t: string) => parseFieldCommand(t, 'search');

describe('Befehle beim Legen', () => {
  it.each([
    ['Winkel links', 'links'], ['winkel nach rechts', 'rechts'], ['Linkswinkel', 'links'], ['rechts Winkel', 'rechts'],
    ['Winkel rächts', 'rechts'], ['Spitzwinkel links', 'spitz_links'], ['spitz nach rechts', 'spitz_rechts'], ['Winkel links.', 'links'],
  ])('%s → Winkel %s', (text, kind) => {
    expect(lay(text)).toEqual({ type: 'CORNER', angleKind: kind });
  });
  it('Gegenstand, Verleitung, Ende', () => {
    expect(lay('Gegenstand')).toEqual({ type: 'ARTICLE' });
    expect(lay('Gegestand')).toEqual({ type: 'ARTICLE' });
    expect(lay('Verleitung')).toEqual({ type: 'DISTRACTION' });
    expect(lay('Ende')).toEqual({ type: 'END' });
    expect(lay('Fährte beenden')).toEqual({ type: 'END' });
  });
  it('«Winkel» ohne Richtung setzt nichts, fragt nach', () => {
    expect(lay('Winkel')).toEqual({ type: 'DIRECTION_MISSING' });
    expect(lay('Spitzwinkel')).toEqual({ type: 'DIRECTION_MISSING' });
  });
  it('Suchbefehle gelten beim Legen nicht', () => {
    expect(lay('Gegenstand gefunden')).toBeNull();
    expect(lay('sitzt')).toBeNull();
  });
});

describe('Befehle beim Suchen', () => {
  it('Gegenstand gefunden in Varianten', () => {
    for (const t of ['Gegenstand gefunden', 'gefunden', 'Gegenstand', 'gfunde']) expect(search(t)).toEqual({ type: 'ARTICLE_FOUND' });
  });
  it('Anzeige: liegt, sitzt, steht, aufgenommen (kein «verbellt»)', () => {
    expect(search('liegt')).toEqual({ type: 'INDICATION', indication: 'down' });
    expect(search('Anzeige sitzt')).toEqual({ type: 'INDICATION', indication: 'sit' });
    expect(search('steht')).toEqual({ type: 'INDICATION', indication: 'stand' });
    expect(search('aufgenommen')).toEqual({ type: 'INDICATION', indication: 'retrieve' });
    expect(search('verbellt')).toBeNull();
  });
  it('Legebefehle gelten beim Suchen nicht', () => {
    expect(search('Winkel links')).toBeNull();
    expect(search('Verleitung')).toBeNull();
  });
});

describe('Gespräch ist kein Befehl', () => {
  it.each([
    'jetzt kommt bald das ende von der wiese',
    'ich glaube der winkel links war zu früh',
    'hast du den gegenstand gefunden oder nicht',
    'das war ja super',
    'ende gut alles gut',
    '',
  ])('«%s» → nichts', text => {
    expect(lay(text)).toBeNull();
    expect(search(text)).toBeNull();
  });
});

describe('Steuerlogik', () => {
  const run = (mode: 'lay' | 'search', steps: [string, number][]) => {
    const c = createFieldVoiceController(mode);
    return steps.map(([t, at]) => c.handle(t, at).kind);
  };

  it('«Ende» beendet nur mit «Ja» innert 5 s', () => {
    expect(run('lay', [['Ende', 0], ['Ja', 2000]])).toEqual(['ask_end', 'end_confirmed']);
    expect(run('lay', [['Ende', 0], ['Ja', END_CONFIRM_MS + 1]])).toEqual(['ask_end', 'ignored']);
    expect(run('lay', [['Ja', 0]])).toEqual(['ignored']);
    expect(run('lay', [['Ende', 0], ['Nein', 1500]])).toEqual(['ask_end', 'end_cancelled']);
  });

  it('eine neue Aktion bricht die Ende-Rückfrage ab', () => {
    expect(run('lay', [['Ende', 0], ['Winkel links', 1500], ['Ja', 3000]])).toEqual(['ask_end', 'action', 'ignored']);
  });

  it('Rückgängig nur für die letzte Sprachaktion, nur einmal, nur im Zeitfenster', () => {
    const c = createFieldVoiceController('lay', { undoWindowMs: 7000 });
    expect(c.handle('Winkel links', 0).kind).toBe('action');
    expect(c.handle('Gegenstand', 3000).kind).toBe('action');
    const undo = c.handle('Rückgängig', 4000) as Extract<FieldVoiceEffect, { kind: 'undo' }>;
    expect(undo).toEqual({ kind: 'undo', command: { type: 'ARTICLE' } });
    expect(c.handle('zurück', 6000).kind).toBe('nothing_to_undo');   // nie die ältere
    c.handle('Winkel rechts', 10000);
    expect(c.handle('Rückgängig', 17001).kind).toBe('nothing_to_undo');
  });

  it('nach Tasten-Aktion gilt Sprach-Rückgängig nicht mehr', () => {
    const c = createFieldVoiceController('lay');
    c.handle('Winkel links', 0);
    c.noteManualAction();
    expect(c.handle('Rückgängig', 1000).kind).toBe('nothing_to_undo');
  });

  it('doppelt gelieferte Erkennung zählt einmal', () => {
    expect(run('lay', [['Winkel links', 0], ['Winkel links', DUPLICATE_WINDOW_MS - 1], ['Winkel links', DUPLICATE_WINDOW_MS + 500]]))
      .toEqual(['action', 'ignored', 'action']);
  });

  it('nach Beenden gibt es kein Rückgängig mehr', () => {
    expect(run('search', [['gefunden', 0], ['Ende', 1500], ['Ja', 3000], ['Rückgängig', 4000]]))
      .toEqual(['action', 'ask_end', 'end_confirmed', 'nothing_to_undo']);
  });
});

describe('Eigene Ansage ist kein Befehl', () => {
  it('verwirft während und kurz nach der Ansage', () => {
    expect(acceptsRecognition(10_000, { speaking: true, endedAtMs: 0 })).toBe(false);
    expect(acceptsRecognition(10_000, { speaking: false, endedAtMs: 10_000 - ECHO_GRACE_MS + 1 })).toBe(false);
    expect(acceptsRecognition(10_000, { speaking: false, endedAtMs: 10_000 - ECHO_GRACE_MS })).toBe(true);
    expect(acceptsRecognition(10_000, { speaking: false, endedAtMs: 0 })).toBe(true);
  });
});

describe('Offline-Erkennung bevorzugt', () => {
  it('Offline nur mit installiertem deutschem Sprachpaket', () => {
    expect(chooseRecognitionSetup({ supportsOnDevice: true, installedLocales: ['de_CH', 'en-US'] })).toEqual({ lang: 'de-CH', onDevice: true });
    expect(chooseRecognitionSetup({ supportsOnDevice: true, installedLocales: ['de-DE'] })).toEqual({ lang: 'de-DE', onDevice: true });
    expect(chooseRecognitionSetup({ supportsOnDevice: true, installedLocales: ['en-US'] })).toEqual({ lang: 'de-DE', onDevice: false });
    expect(chooseRecognitionSetup({ supportsOnDevice: false, installedLocales: ['de-DE'] })).toEqual({ lang: 'de-DE', onDevice: false });
    expect(chooseRecognitionSetup({ supportsOnDevice: true, installedLocales: ['de-DE'], preferOffline: false })).toEqual({ lang: 'de-DE', onDevice: false });
  });
});

describe('Bestätigungstexte', () => {
  const effects: FieldVoiceEffect[] = [
    ...(['links', 'rechts', 'spitz_links', 'spitz_rechts'] as const).map(angleKind => ({ kind: 'action' as const, command: { type: 'CORNER' as const, angleKind } })),
    { kind: 'action', command: { type: 'ARTICLE' } }, { kind: 'action', command: { type: 'DISTRACTION' } },
    { kind: 'action', command: { type: 'ARTICLE_FOUND' } },
    ...(['down', 'sit', 'stand', 'retrieve'] as const).map(indication => ({ kind: 'action' as const, command: { type: 'INDICATION' as const, indication } })),
    { kind: 'undo', command: { type: 'ARTICLE' } }, { kind: 'nothing_to_undo' }, { kind: 'ask_end' },
    { kind: 'end_confirmed' }, { kind: 'end_cancelled' }, { kind: 'direction_missing' },
  ];
  it('jede Wirkung hat einen Text in allen fünf Sprachen', () => {
    for (const e of effects) {
      const key = confirmationKey(e)!.key;
      for (const dict of [deCH, gswCH, fr, itLocale, en] as Record<string, string>[]) {
        expect(String(dict[key] ?? '').trim().length).toBeGreaterThan(0);
      }
    }
    expect(confirmationKey({ kind: 'ignored' })).toBeNull();
    expect(actionKey({ type: 'ARTICLE_FOUND' })).toBe('voiceField.articleFound');
  });
  it('jede Erkennungshilfe ist selbst ein gültiger Befehl im Modus', () => {
    for (const t of FIELD_CONTEXT_STRINGS.lay) expect(lay(t)).not.toBeNull();
    for (const t of FIELD_CONTEXT_STRINGS.search) expect(search(t)).not.toBeNull();
  });
});

describe('Datenschutz', () => {
  it('Hook speichert und loggt keinen erkannten Text', () => {
    const src = readFileSync('features/voice/hooks/useFieldVoiceControl.ts', 'utf8');
    expect(src).not.toMatch(/console\.|AsyncStorage|supabase|setItem/);
  });
});
