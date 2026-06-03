import type { TrainingMetrics, ScoredMetrics } from '@/types/analytics';
import { METRIC_WEIGHTS as WEIGHTS } from '@/types/analytics';

type MetricKey = keyof Omit<ScoredMetrics, 'gesamtscore'>;

/** Converts raw 1-5 value to 0-100 score. Null → null (not set). */
export function metricToPercent(v: number | null): number | null {
  if (v === null || v === 0) return null;
  return Math.round((v / 5) * 100);
}

/**
 * Calculates the full ScoredMetrics object from raw TrainingMetrics.
 * Missing metrics are excluded from the weighted average and weights are
 * redistributed proportionally so the gesamtscore stays meaningful.
 */
export function calculateScores(raw: TrainingMetrics): ScoredMetrics {
  const keys: MetricKey[] = ['motivation', 'konzentration', 'praezision', 'ausdauer', 'trieblage', 'impulskontrolle'];

  const converted: Partial<Record<MetricKey, number>> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  for (const key of keys) {
    const pct = metricToPercent(raw[key]);
    if (pct !== null) {
      converted[key] = pct;
      weightedSum += pct * WEIGHTS[key];
      totalWeight += WEIGHTS[key];
    } else {
      converted[key] = 0;
    }
  }

  const gesamtscore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    motivation:      converted.motivation      ?? 0,
    konzentration:   converted.konzentration   ?? 0,
    praezision:      converted.praezision      ?? 0,
    ausdauer:        converted.ausdauer        ?? 0,
    trieblage:       converted.trieblage       ?? 0,
    impulskontrolle: converted.impulskontrolle ?? 0,
    gesamtscore,
  };
}

/** Returns a label for a numeric score 0-100. */
export function scoreLabel(score: number): string {
  if (score >= 88) return 'Ausgezeichnet';
  if (score >= 75) return 'Sehr gut';
  if (score >= 62) return 'Gut';
  if (score >= 48) return 'Befriedigend';
  if (score >= 35) return 'Ausbaufähig';
  return 'Schwach';
}

/** Color for a score value. */
export function scoreColor(score: number): string {
  if (score >= 75) return '#00f0c8';
  if (score >= 50) return '#00FFCC';
  if (score >= 35) return '#FFB800';
  return '#FF3B30';
}
