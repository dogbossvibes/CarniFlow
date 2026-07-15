import { deCH } from '../de-CH';

// ── Deutsch (de) — Basissprache / fallbackLng ──
// Texte werden 1:1 aus dem bestehenden de-CH-Dictionary übernommen (Reuse →
// garantiert identisch, keine Neuformulierung). Ergänzt um die 3 internen
// Plural-Referenzkeys (i18next `count`, CLDR one/other). Diese Plural-Keys sind
// NUR für Tests/Referenz — nicht in Produktions-UI verwendet.
export const de = {
  ...deCH,
  trainingCount_one:   '{count} Training',
  trainingCount_other: '{count} Trainings',
  minuteCount_one:     '{count} Minute',
  minuteCount_other:   '{count} Minuten',
  articleCount_one:    '{count} Gegenstand',
  articleCount_other:  '{count} Gegenstände',
} as const;
