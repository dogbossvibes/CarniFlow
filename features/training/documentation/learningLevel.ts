// Lernstufe pro Übung (Trainingsdoku neu, Etappe 1, T-184).
//
// Gespeichert im bestehenden Feld `training_exercises.rating` als 1/2/4/5.
// Ob ein Wert eine Lernstufe ist, entscheidet AUSSCHLIESSLICH die additive
// Spalte `rating_scale` ('lernstufe'). Leer/fehlend = alte Sternebewertung
// (1–5) – sie wird nie umgedeutet: keine Vorbelegung, kein Trend.
// Ältere App-Versionen schreiben `rating_scale` nie und bleiben damit korrekt
// als Sterne erkennbar.

export const LEARNING_SCALE = 'lernstufe' as const;
export type RatingScale = typeof LEARNING_SCALE;

export const LEARNING_LEVELS = ['neu', 'lernen', 'festigen', 'sitzt'] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export const LEVEL_VALUE: Record<LearningLevel, number> = { neu: 1, lernen: 2, festigen: 4, sitzt: 5 };

export type Trend = 'up' | 'down' | 'same';

export interface RatedEntry {
  rating: number | null | undefined;
  rating_scale?: string | null;
}

export function isLearningRating(entry: RatedEntry | null | undefined): boolean {
  return !!entry && entry.rating_scale === LEARNING_SCALE && levelFromValue(entry.rating) !== null;
}

export function levelFromValue(value: number | null | undefined): LearningLevel | null {
  return LEARNING_LEVELS.find(level => LEVEL_VALUE[level] === value) ?? null;
}

/** Lernstufe eines gespeicherten Eintrags – nur wenn er ausdrücklich als Lernstufe markiert ist. */
export function levelOf(entry: RatedEntry | null | undefined): LearningLevel | null {
  return isLearningRating(entry) ? levelFromValue(entry!.rating) : null;
}

/** Alte Sternebewertung (1–5) eines Eintrags ohne Lernstufen-Markierung, sonst null. */
export function legacyStars(entry: RatedEntry | null | undefined): number | null {
  if (!entry || entry.rating_scale === LEARNING_SCALE) return null;
  const r = entry.rating;
  return Number.isInteger(r) && r! >= 1 && r! <= 5 ? r! : null;
}

/** Anzeige einer gespeicherten Bewertung: Lernstufe, alte Sterne oder nichts. */
export function ratingDisplay(entry: RatedEntry | null | undefined):
  { kind: 'level'; level: LearningLevel } | { kind: 'legacy'; stars: number } | null {
  const level = levelOf(entry);
  if (level) return { kind: 'level', level };
  const stars = legacyStars(entry);
  return stars != null ? { kind: 'legacy', stars } : null;
}

/**
 * Trend gegenüber dem letzten Eintrag derselben Übung. Nur wenn beide Seiten
 * Lernstufen sind; gegenüber alten Sternen oder ohne Vorgänger kein Trend.
 */
export function trendOf(current: RatedEntry | null | undefined, previous: RatedEntry | null | undefined): Trend | null {
  const now = levelOf(current);
  const before = levelOf(previous);
  if (!now || !before) return null;
  const diff = LEVEL_VALUE[now] - LEVEL_VALUE[before];
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
}
