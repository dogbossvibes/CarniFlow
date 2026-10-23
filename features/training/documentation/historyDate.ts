import { fromISODate } from '@/features/dogs/dateInput';
import { formatDate } from '@/i18n/format';
import type { AppLocale } from '@/i18n/config';

export function historyDate(value: string, locale: AppLocale = 'de'): string {
  const day = fromISODate(value);
  return day ? formatDate(day, undefined, locale) : value;
}
