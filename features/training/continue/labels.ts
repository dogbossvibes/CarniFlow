import type { TranslationKey } from '@/i18n';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** „heute“ / „gestern“ / „vor X Tagen“ (T-184 Etappe 2). */
export function relativeDays(t: T, daysAgo: number | null): string {
  if (daysAgo == null) return '—';
  if (daysAgo <= 0) return t('continueTraining.today');
  if (daysAgo === 1) return t('continueTraining.yesterday');
  return t('continueTraining.daysAgo', { count: daysAgo });
}

/** „Letztes Training: vor 3 Tagen · Unterordnung“ */
export function lastTrainingText(t: T, daysAgo: number | null, disciplines: string[]): string {
  const when = relativeDays(t, daysAgo);
  return t('continueTraining.lastLine', { when, discipline: disciplines.join(', ') || '—' });
}
