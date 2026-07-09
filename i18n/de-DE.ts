import type { TranslationKey } from './de-CH';

// ── Deutsch Deutschland (de-DE) ──
// Überschreibt NUR Keys, die sich von Deutsch Schweiz unterscheiden — in der
// Praxis fast ausschliesslich „ß" statt „ss". Alle nicht genannten Keys fallen
// automatisch auf de-CH zurück (siehe i18n/index.ts).
export const deDE: Partial<Record<TranslationKey, string>> = {
  'common.close': 'Schließen',
};
