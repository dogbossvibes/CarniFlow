import { readFileSync } from 'fs';
import { join } from 'path';
import { deCH } from '@/i18n/de-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';

// Absuche-Screen: Kennzahlen und Karte/Skizze-Umschalter müssen aus der
// Übersetzung kommen. Vorher standen sie fest auf Deutsch im Code und mischten
// sich bei anderer App-Sprache mit übersetzten Texten.
const source = readFileSync(join(__dirname, '..', 'run.tsx'), 'utf8');

describe('Absuche: Kennzahlen-Beschriftung ist übersetzbar', () => {
  it('enthält keine fest eingetragenen deutschen Beschriftungen', () => {
    expect(source).not.toMatch(/label:\s*'Gegenst\.'/);
    expect(source).not.toMatch(/label:\s*'Abweich\.'/);
    expect(source).not.toMatch(/Schr\.`/);
    expect(source).not.toMatch(/\?\s*'Karte'\s*:\s*'Skizze'/);
  });

  it('nutzt die Übersetzungsschlüssel', () => {
    for (const key of ['track.stepsShort', 'track.objectsShort', 'track.deviationShort', 'track.viewMap', 'track.viewSketch']) {
      expect(source).toContain(`t('${key}')`);
    }
  });

  it('kennt den Kurztext für Abweichung in allen gepflegten Sprachen', () => {
    expect(deCH['track.deviationShort']).toBe('Abweich.');
    for (const dict of [en, fr, itLocale] as Record<string, string>[]) {
      expect(dict['track.deviationShort']).toBeTruthy();
    }
  });
});

describe('Absuche: Kennzahlen-Beschriftung wird nicht abgeschnitten', () => {
  it('verkleinert lange Beschriftungen statt sie mit … zu kürzen', () => {
    const tile = source.slice(source.indexOf('metrics.map('), source.indexOf('metrics.map(') + 1600);
    expect(tile).toContain('adjustsFontSizeToFit');
    expect(tile).toMatch(/minimumFontScale=\{0\.7\}/);
  });
});
