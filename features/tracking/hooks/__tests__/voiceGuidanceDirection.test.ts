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

  // T-220: Ein spitzer Fachwinkel darf nie ohne «spitz» und Richtung angesagt werden.
  it('als spitz gespeicherter OW/GW/BW sagt «spitz» und die Richtung an', () => {
    expect(anglePhrase('bw', 5, 'de', 'links', true)).toBe('Bodenwinkel spitz links in ca. 5 Schritten.');
    expect(anglePhrase('gw', 5, 'de', 'rechts', true)).toBe('Geschlossener Winkel spitz rechts in ca. 5 Schritten.');
    expect(anglePhrase('ow', 2, 'de', 'links', true)).toBe('Offener Winkel spitz links in ca. 2 Schritten.');
  });

  it('Abriss kennt kein «spitz»', () => {
    expect(anglePhrase('abriss', 3, 'de', 'links', true)).toBe('Abriss links in ca. 3 Schritten.');
  });

  it.each(['de', 'gsw', 'en', 'fr', 'it'] as AppLocale[])('%s: spitz unterscheidet sich von normal, ohne offenen Platzhalter', locale => {
    for (const kind of ['gw', 'ow', 'bw'] as const) {
      for (const dir of ['links', 'rechts'] as const) {
        const sharp = anglePhrase(kind, 4, locale, dir, true);
        expect(sharp).not.toBe(anglePhrase(kind, 4, locale, dir));
        expect(sharp).not.toMatch(/[{}]|track\.|\s{2}/);
      }
    }
  });

  // FR/IT sagten «Angle ouvert angle aigu à gauche» bzw. «Angolo aperto angolo acuto a
  // sinistra»: der Richtungszusatz wiederholte das Wort «Winkel». Jetzt wie Deutsch nur einmal.
  it('zusammengesetzte spitze Ansage je Sprache (Winkel nur einmal)', () => {
    expect(anglePhrase('ow', 2, 'de', 'links', true)).toBe('Offener Winkel spitz links in ca. 2 Schritten.');
    expect(anglePhrase('ow', 2, 'gsw', 'links', true)).toBe('OW spitz links i ca. 2 Schritten.');
    expect(anglePhrase('ow', 2, 'en', 'links', true)).toBe('Open corner sharp left in about 2 steps.');
    expect(anglePhrase('ow', 2, 'fr', 'links', true)).toBe('Angle ouvert aigu à gauche dans env. 2 pas.');
    expect(anglePhrase('gw', 2, 'fr', 'rechts', true)).toBe('Angle fermé aigu à droite dans env. 2 pas.');
    expect(anglePhrase('bw', 2, 'fr', 'links', true)).toBe('Angle au sol aigu à gauche dans env. 2 pas.');
    expect(anglePhrase('ow', 2, 'it', 'links', true)).toBe('Angolo aperto acuto a sinistra tra ca. 2 passi.');
    expect(anglePhrase('gw', 2, 'it', 'rechts', true)).toBe('Angolo chiuso acuto a destra tra ca. 2 passi.');
    expect(anglePhrase('bw', 1, 'it', 'links', true)).toBe('Angolo a terra acuto a sinistra tra ca. 1 passo.');
  });

  it.each(['fr', 'it'] as AppLocale[])('%s: «Winkel» kommt in jeder Fachwinkel-Ansage genau einmal vor', locale => {
    const word = locale === 'fr' ? /\bangle\b/gi : /\bangolo\b/gi;
    for (const kind of ['gw', 'ow', 'bw'] as const) {
      for (const dir of ['links', 'rechts', null] as const) {
        for (const sharp of [true, false]) {
          expect(anglePhrase(kind, 4, locale, dir, sharp).match(word)).toHaveLength(1);
        }
      }
    }
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
