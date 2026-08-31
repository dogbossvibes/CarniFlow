import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

const healthKeys = Object.keys(deCH).filter(key => key.startsWith('health.'));

describe('Health Phase 2 i18n', () => {
  it('keeps all Health keys non-empty in DE, Swiss German, French, Italian, and English', () => {
    for (const dictionary of [deCH, gswCH, fr, itLocale, en] as const) {
      for (const key of healthKeys) {
        expect(Object.prototype.hasOwnProperty.call(dictionary, key)).toBe(true);
        expect(String((dictionary as Record<string, string>)[key] ?? '').trim()).not.toBe('');
      }
    }
  });
});
