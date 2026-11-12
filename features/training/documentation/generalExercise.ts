import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it } from '@/i18n/locales/it';

// T-184: „Allgemeines Training“ = Training einer Sparte ohne bestimmte Übung.
// Es wird als normale Übung gespeichert (Sparte bleibt erhalten, keine
// DB-Änderung) und in der Übungs-Matrix ausgeblendet. Erkannt wird es am
// Namen in allen App-Sprachen, weil der Name beim Anlegen in der damals
// gewählten Sprache gespeichert wird.
const nameKey = (name: string) => name.trim().toLowerCase();

export const GENERAL_EXERCISE_NAMES: ReadonlySet<string> = new Set(
  [deCH, gswCH, en, fr, it]
    .map(dict => (dict as Record<string, string | undefined>)['trainingFlow.generalTraining'])
    .filter((name): name is string => !!name)
    .map(nameKey),
);

export function isGeneralExercise(name: string | null | undefined): boolean {
  return !!name && GENERAL_EXERCISE_NAMES.has(nameKey(name));
}
