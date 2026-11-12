import { isGeneralExercise } from '../generalExercise';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';

describe('Allgemeines Training erkennen (T-184)', () => {
  test('Name aus jeder App-Sprache, unabhängig von Gross/Klein und Leerzeichen', () => {
    for (const name of ['Allgemeines Training', 'Allgemeins Training', 'General training', 'Entraînement général', 'Allenamento generale']) {
      expect(isGeneralExercise(name)).toBe(true);
    }
    expect(isGeneralExercise('  allgemeines TRAINING ')).toBe(true);
    // Der tatsächlich gespeicherte Name jeder Sprache wird erkannt.
    for (const dict of [deCH, gswCH, en, fr, itLocale]) expect(isGeneralExercise((dict as Record<string, string>)['trainingFlow.generalTraining'])).toBe(true);
  });
  test('andere Übungen und leere Namen nicht', () => {
    for (const name of ['Sitz', 'Training', 'Allgemein', 'Allgemeines Training 2', '', null, undefined]) expect(isGeneralExercise(name)).toBe(false);
  });
});
