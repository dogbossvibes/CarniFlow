import type { TranslationKey } from '@/i18n';

// Kleine Anzeigehilfen für Mantrailing (rein, testbar).
type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** 0.86 → «86 %»; null → «–». */
export function formatPercent(share: number | null | undefined): string {
  return share == null || !Number.isFinite(share) ? '–' : `${Math.round(share * 100)} %`;
}

/** Minuten → «45 min» bzw. «2 h 10». */
export function formatTrailAge(minutes: number | null | undefined, t: T): string {
  if (minutes == null || !Number.isFinite(minutes)) return '–';
  const m = Math.round(minutes);
  if (m < 60) return t('mantrail.minutes', { n: m });
  return t('mantrail.hoursMinutes', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

/** Sekunden → «18:05». */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '–';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
