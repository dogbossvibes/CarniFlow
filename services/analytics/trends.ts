import type { TrendPoint, TrendSummary } from '@/types/analytics';
import type { TrainingSession } from '@/types';
import { calculateScores } from './scoring';

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/** Converts an array of sessions into plottable trend points. */
export function buildTrendPoints(sessions: TrainingSession[]): TrendPoint[] {
  return sessions
    .filter(s => s.motivation || s.konzentration || s.praezision || s.rating)
    .map(s => {
      const scored = calculateScores({
        motivation:      s.motivation,
        konzentration:   s.konzentration,
        praezision:      s.praezision,
        ausdauer:        s.ausdauer,
        trieblage:       s.trieblage,
        impulskontrolle: s.impulskontrolle,
      });
      // Fall back to rating-based score if no metrics filled
      const score = scored.gesamtscore > 0
        ? scored.gesamtscore
        : s.rating ? s.rating * 20 : 0;
      return {
        date:          s.session_date,
        score,
        motivation:    scored.motivation,
        konzentration: scored.konzentration,
        praezision:    scored.praezision,
      };
    })
    .filter(p => p.score > 0)
    .reverse(); // chronological order for charting
}

/** Computes a trend summary for the given window in days. */
export function computeTrend(points: TrendPoint[], windowDays: number): TrendSummary {
  if (!points.length) {
    return { direction: 'stable', deltaPct: 0, stabilität: 0, durchschnitt: 0, sessions: 0 };
  }

  const now = Date.now();
  const ms  = windowDays * 24 * 60 * 60 * 1000;

  const inWindow = points.filter(p => now - new Date(p.date).getTime() <= ms);
  if (!inWindow.length) {
    return { direction: 'stable', deltaPct: 0, stabilität: 0, durchschnitt: 0, sessions: 0 };
  }

  const scores = inWindow.map(p => p.score);
  const mean   = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd     = stdDev(scores);

  // Coefficient of variation → stability (lower CV = higher stability)
  const cv        = mean > 0 ? (sd / mean) * 100 : 100;
  const stabilität = Math.max(0, Math.round(100 - cv));

  // Trend: compare first half vs second half of window
  const half    = Math.floor(inWindow.length / 2);
  const firstH  = inWindow.slice(0, Math.max(1, half)).map(p => p.score);
  const secondH = inWindow.slice(half).map(p => p.score);
  const avgFirst  = firstH.reduce((a, b) => a + b, 0) / firstH.length;
  const avgSecond = secondH.reduce((a, b) => a + b, 0) / secondH.length;

  const deltaPct = avgFirst > 0 ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100) : 0;

  return {
    direction:    deltaPct > 4 ? 'up' : deltaPct < -4 ? 'down' : 'stable',
    deltaPct:     Math.abs(deltaPct),
    stabilität,
    durchschnitt: Math.round(mean),
    sessions:     inWindow.length,
  };
}
