import { fromISODate, toISODate } from '@/features/dogs/dateInput';
import { formatDate } from '@/i18n/format';

/** PostgreSQL date columns are local calendar dates; timestamps retain their actual instant. */
export function sharedRecordDate(value: string): string {
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dayOnly ? fromISODate(value) : new Date(value);
  if (!date || !Number.isFinite(date.getTime()) || (dayOnly && toISODate(date) !== value)) return '';
  return formatDate(date);
}
