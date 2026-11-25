import { createFieldVoiceController } from '../fieldVoiceController';
import { searchVoiceStep } from '../searchVoiceBridge';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

// Zuordnung Sprachwirkung → Aktion bei der Absuche (Spec 03, PR C).
const steps = (said: [string, number][]) => {
  const c = createFieldVoiceController('search');
  return said.map(([text, at]) => searchVoiceStep(c.handle(text, at)));
};

describe('Sprachsteuerung bei der Absuche', () => {
  it('«Gegenstand gefunden» ruft die Taste «Gegenstand» auf', () => {
    expect(steps([['Gegenstand gefunden', 0]])[0]).toEqual({ run: 'found', speakKey: 'voiceField.articleFound' });
    expect(steps([['gefunden', 0]])[0]).toMatchObject({ run: 'found' });
  });
  it('Anzeigeart: nur Bestätigung, keine Daten', () => {
    expect(steps([['liegt', 0]])[0]).toEqual({ run: 'none', speakKey: 'voiceField.indication.down' });
    expect(steps([['sitzt', 0]])[0]).toEqual({ run: 'none', speakKey: 'voiceField.indication.sit' });
    expect(steps([['verbellt', 0]])[0]).toEqual({ run: 'none', speakKey: null });
  });
  it('«Ende» wertet erst nach «Ja» aus', () => {
    const [ask, yes] = steps([['Ende', 0], ['Ja', 2000]]);
    expect(ask).toEqual({ run: 'none', speakKey: 'voiceField.askEnd' });
    expect(yes).toEqual({ run: 'finish', speakKey: 'voiceField.ended' });
    expect(steps([['Ende', 0], ['Nein', 1500]]).map(s => s.run)).toEqual(['none', 'none']);
  });
  it('Rückgängig nimmt keinen Fund zurück', () => {
    const [, undo] = steps([['gefunden', 0], ['Rückgängig', 2000]]);
    expect(undo).toEqual({ run: 'none', speakKey: 'voiceField.undoNotInSearch' });
  });
  it('Legebefehle lösen bei der Absuche nichts aus', () => {
    expect(steps([['Winkel links', 0]])[0]).toEqual({ run: 'none', speakKey: null });
  });
  it('neue Texte in fünf Sprachen', () => {
    for (const key of ['voiceField.undoNotInSearch', 'voiceField.notNow']) {
      for (const dict of [deCH, gswCH, fr, itLocale, en] as Record<string, string>[]) expect(String(dict[key] ?? '').trim()).not.toBe('');
    }
  });
});
