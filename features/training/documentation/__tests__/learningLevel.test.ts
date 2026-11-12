import { isLearningRating, legacyStars, levelFromValue, levelOf, LEVEL_VALUE, ratingDisplay, trendOf } from '../learningLevel';

const level = (rating: number | null) => ({ rating, rating_scale: 'lernstufe' as const });
const stars = (rating: number | null) => ({ rating, rating_scale: null });

describe('Lernstufe (T-184)', () => {
  test('Werte 1/2/4/5 entsprechen Neu/Lernen/Festigen/Sitzt', () => {
    expect(LEVEL_VALUE).toEqual({ neu: 1, lernen: 2, festigen: 4, sitzt: 5 });
    expect(levelFromValue(3)).toBeNull();
  });

  test('nur ausdrücklich markierte Werte sind Lernstufen', () => {
    expect(levelOf(level(2))).toBe('lernen');
    expect(levelOf(stars(2))).toBeNull();
    expect(levelOf({ rating: 2 })).toBeNull();
    expect(isLearningRating(level(3))).toBe(false);
  });

  test('alte Sterne werden nie umgedeutet, nur als alte Bewertung angezeigt', () => {
    expect(legacyStars(stars(3))).toBe(3);
    expect(legacyStars({ rating: 5 })).toBe(5);
    expect(legacyStars(level(4))).toBeNull();
    expect(legacyStars(stars(null))).toBeNull();
  });

  test('Trend: Lernen → Festigen ↑, Sitzt → Lernen ↓, gleich →', () => {
    expect(trendOf(level(4), level(2))).toBe('up');
    expect(trendOf(level(2), level(5))).toBe('down');
    expect(trendOf(level(4), level(4))).toBe('same');
  });

  test('kein Trend gegenüber alten Sternen, ohne Vorgänger oder ohne heutige Stufe', () => {
    expect(trendOf(level(4), stars(3))).toBeNull();
    expect(trendOf(level(4), null)).toBeNull();
    expect(trendOf(level(null), level(2))).toBeNull();
  });

  test('Anzeige: Lernstufe ohne Stern, alte Bewertung als Stern, sonst nichts', () => {
    expect(ratingDisplay(level(4))).toEqual({ kind: 'level', level: 'festigen' });
    expect(ratingDisplay(stars(4))).toEqual({ kind: 'legacy', stars: 4 });
    expect(ratingDisplay(stars(null))).toBeNull();
  });
});
