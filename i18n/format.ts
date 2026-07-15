import type { AppLocale } from './config';
import { getLocale } from './index';

// ── Zentrale Intl-Formatter (Datum, Zeit, Zahl, Distanz) ──
// Locale-Mapping auf BCP-47: de → de-CH, gsw → de-CH, fr → fr-CH.
// Noch NICHT flächendeckend eingesetzt — nur bereitgestellt (Phase 1).

const INTL_LOCALE: Record<AppLocale, string> = {
  de:  'de-CH',
  gsw: 'de-CH',
  fr:  'fr-CH',
};

function intl(locale?: AppLocale): string {
  return INTL_LOCALE[locale ?? getLocale()];
}

export function formatDate(
  d: Date,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  locale?: AppLocale,
): string {
  return new Intl.DateTimeFormat(intl(locale), opts).format(d);
}

export function formatTime(
  d: Date,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
  locale?: AppLocale,
): string {
  return new Intl.DateTimeFormat(intl(locale), opts).format(d);
}

export function formatNumber(
  n: number,
  opts: Intl.NumberFormatOptions = {},
  locale?: AppLocale,
): string {
  return new Intl.NumberFormat(intl(locale), opts).format(n);
}

// Distanz: < 1000 m → „x m", sonst „x.x km" (locale-korrektes Dezimaltrennzeichen).
export function formatDistance(meters: number, locale?: AppLocale): string {
  if (!isFinite(meters)) meters = 0;
  if (meters < 1000) {
    return `${formatNumber(Math.round(meters), {}, locale)} m`;
  }
  return `${formatNumber(meters / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, locale)} km`;
}
