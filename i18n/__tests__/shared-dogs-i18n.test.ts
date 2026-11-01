import { deCH } from '../de-CH';
import { gswCH } from '../gsw-CH';
import { en } from '../locales/en';
import { fr } from '../locales/fr';
import { it as italian } from '../locales/it';

const keys = Object.keys(deCH).filter(key => key.startsWith('sharing.')) as (keyof typeof deCH)[];
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

it.each([['gsw', gswCH], ['en', en], ['fr', fr], ['it', italian]] as const)('ships the whole shared-dog UI offline in %s with matching interpolation fields', (_locale, dictionary) => {
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(dictionary[key]?.trim()).toBeTruthy();
    expect(dictionary[key]).not.toContain("{{");
    expect(placeholders(dictionary[key]!)).toEqual(placeholders(deCH[key]));
  }
});
