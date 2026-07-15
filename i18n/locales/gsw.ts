import { gswCH } from '../gsw-CH';

// ── Schwiizerdütsch (gsw) ──
// Texte 1:1 aus dem bestehenden gsw-CH Override-Dictionary (Reuse → identisch).
// Fehlende Keys fallen automatisch auf `de` zurück (fallbackLng). Ergänzt um die
// Plural-Referenzkeys im gsw-Stil.
export const gsw = {
  ...gswCH,
  trainingCount_one:   '{count} Training',
  trainingCount_other: '{count} Trainings',
  minuteCount_one:     '{count} Minute',
  minuteCount_other:   '{count} Minute',
  articleCount_one:    '{count} Gegestand',
  articleCount_other:  '{count} Gegeständ',
};
