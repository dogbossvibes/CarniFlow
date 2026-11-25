import { createFieldVoiceController } from '../fieldVoiceController';
import { layVoiceStep } from '../layVoiceBridge';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

// Zuordnung Sprachwirkung → Aktion beim Legen (Spec 03, PR B).
const steps = (said: [string, number][]) => {
  const c = createFieldVoiceController('lay');
  return said.map(([text, at]) => layVoiceStep(c.handle(text, at)));
};

describe('Sprachsteuerung beim Legen', () => {
  it('Winkel und Gegenstand rufen die Tasten-Aktion auf', () => {
    expect(steps([['Winkel links', 0]])[0]).toEqual({ run: 'corner', angleKind: 'links', speakKey: 'voiceField.corner.links' });
    expect(steps([['Spitzwinkel rechts', 0]])[0]).toMatchObject({ run: 'corner', angleKind: 'spitz_rechts' });
    expect(steps([['Gegenstand', 0]])[0]).toEqual({ run: 'article', speakKey: 'voiceField.article' });
  });

  it('«Ende» beendet erst nach «Ja»', () => {
    const [ask, yes] = steps([['Ende', 0], ['Ja', 1500]]);
    expect(ask).toEqual({ run: 'none', speakKey: 'voiceField.askEnd' });
    expect(yes).toEqual({ run: 'finish', speakKey: 'voiceField.ended' });
    expect(steps([['Ende', 0], ['Nein', 1500]]).map(s => s.run)).toEqual(['none', 'none']);
    expect(steps([['Ja', 0]])[0]).toEqual({ run: 'none', speakKey: null });
  });

  it('Rückgängig entfernt beim Legen nichts (Entscheid 2026-11-25)', () => {
    const [, undo] = steps([['Winkel links', 0], ['Rückgängig', 2000]]);
    expect(undo).toEqual({ run: 'none', speakKey: 'voiceField.undoNotInLay' });
    expect(steps([['Rückgängig', 0]])[0]).toEqual({ run: 'none', speakKey: 'voiceField.undoNotInLay' });
  });

  it('Verleitung und Suchbefehle lösen beim Legen nichts aus', () => {
    expect(steps([['Verleitung', 0]])[0]).toEqual({ run: 'none', speakKey: null });
    expect(steps([['Gegenstand gefunden', 0]])[0]).toEqual({ run: 'none', speakKey: null });
  });

  it('«Winkel» ohne Richtung fragt nach, setzt nichts', () => {
    expect(steps([['Winkel', 0]])[0]).toEqual({ run: 'none', speakKey: 'voiceField.directionMissing' });
  });

  it('alle neuen Texte in fünf Sprachen', () => {
    for (const key of ['voiceField.undoNotInLay', 'voiceField.toggleOn', 'voiceField.toggleOff', 'voiceField.started', 'voiceField.stopped']) {
      for (const dict of [deCH, gswCH, fr, itLocale, en] as Record<string, string>[]) expect(String(dict[key] ?? '').trim()).not.toBe('');
    }
  });
});
