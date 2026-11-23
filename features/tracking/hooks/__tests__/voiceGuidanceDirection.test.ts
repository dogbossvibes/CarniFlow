/**
 * T-219 — OW/GW/BW und Abriss sagen in der Absuche die beim Legen gewählte Richtung an.
 * Vorher hiess es nur «Bodenwinkel in ca. 5 Schritten»; die automatische Ecke an derselben
 * Stelle wird für die Absuche ausgeblendet (projectAngleMarkers), also fehlte links/rechts ganz.
 */
import { anglePhrase } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import type { AppLocale } from '@/i18n/config';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

const LOCALES: AppLocale[] = ['de', 'gsw', 'en', 'fr', 'it'];

describe('Absuche-Ansage mit Richtung für Fachwinkel und Abriss (T-219)', () => {
  it('Deutsch: Richtung steht zwischen Begriff und Distanz', () => {
    expect(anglePhrase('bw', 5, 'de', 'links')).toBe('Bodenwinkel links in ca. 5 Schritten.');
    expect(anglePhrase('gw', 5, 'de', 'rechts')).toBe('Geschlossener Winkel rechts in ca. 5 Schritten.');
    expect(anglePhrase('ow', 1, 'de', 'links')).toBe('Offener Winkel links in ca. 1 Schritt.');
    expect(anglePhrase('abriss', 3, 'de', 'rechts')).toBe('Abriss rechts in ca. 3 Schritten.');
  });

  it('ohne gewählte Richtung bleibt die bisherige Ansage', () => {
    expect(anglePhrase('bw', 5, 'de')).toBe('Bodenwinkel in ca. 5 Schritten.');
    expect(anglePhrase('abriss', 5, 'de', null)).toBe('Abriss in ca. 5 Schritten.');
  });

  it('normale Winkel und Spitzwinkel bleiben unverändert (Richtung steckt schon im Typ)', () => {
    expect(anglePhrase('links', 5, 'de', 'rechts')).toBe(anglePhrase('links', 5, 'de'));
    expect(anglePhrase('spitz_rechts', 5, 'de', 'links')).toBe(anglePhrase('spitz_rechts', 5, 'de'));
  });

  it.each(LOCALES)('%s: kein offener Platzhalter, links und rechts unterscheidbar', locale => {
    for (const kind of ['gw', 'ow', 'bw', 'abriss'] as const) {
      const left = anglePhrase(kind, 4, locale, 'links');
      const right = anglePhrase(kind, 4, locale, 'rechts');
      const none = anglePhrase(kind, 4, locale);
      for (const p of [left, right, none]) {
        expect(p).not.toMatch(/[{}]/);
        expect(p).not.toContain('track.');
        expect(p).not.toMatch(/\s{2}/);
      }
      expect(left).not.toBe(right);
      expect(left).not.toBe(none);
    }
  });
});
