import type { EvalMetrics } from '@/features/tracking-exchange/groups/evaluationService';
import type { TranslationKey } from '@/i18n';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** «420 m · 18:40 · 2 von 3 Gegenständen». Dauer als m:ss bzw. h:mm:ss. */
export function formatEvalDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export function formatEvalLine(metrics: EvalMetrics, t: T): string {
  const parts = [`${Math.round(metrics.distanceM)} m`, formatEvalDuration(metrics.durationS)];
  if (metrics.articlesTotal > 0) parts.push(t('groups.evalArticles', { found: metrics.articlesFound, total: metrics.articlesTotal }));
  return parts.join(' · ');
}
