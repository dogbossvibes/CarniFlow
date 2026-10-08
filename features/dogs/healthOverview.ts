import type { HealthOverviewData } from '@/services/healthService';
import type { HealthTimelineItem } from './healthTimeline';
import type { TranslationKey } from '@/i18n';

export interface HealthDueItem {
  id: string;
  title: string;
  date: string;
  days: number;
  itemId: string;
}

// Calendar dates are compared as local days, not elapsed 24-hour periods (DST).
export function healthDayDiff(value: string, now: Date): number {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export function healthDueItems(data: HealthOverviewData, timeline: HealthTimelineItem[], now = new Date()): HealthDueItem[] {
  const items: HealthDueItem[] = [];
  const add = (id: string, itemId: string, date: string | null | undefined) => {
    const item = timeline.find(entry => entry.id === itemId);
    if (!date || !item || !Number.isFinite(Date.parse(date))) return;
    items.push({ id, itemId, title: item.title, date, days: healthDayDiff(date, now) });
  };
  data.vaccinations.forEach(row => add(`v-${row.id}`, `vaccination:${row.id}`, row.next_due_on));
  data.parasites.forEach(row => add(`p-${row.id}`, `parasite:${row.id}`, row.next_due_date));
  data.vetVisits.filter(row => row.status !== 'cancelled' && row.status !== 'completed' && row.appointment_at && new Date(row.appointment_at) >= now).forEach(row => add(`vet-${row.id}`, `vet:${row.id}`, row.appointment_at));
  data.medications.filter(row => row.is_active && new Date(row.starts_on) > now && (!row.ends_on || new Date(row.ends_on) >= new Date(row.starts_on))).forEach(row => add(`med-${row.id}`, `medication:${row.id}`, row.starts_on));
  return items.sort((a, b) => a.days - b.days || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function healthHasLimitedData(data: HealthOverviewData): boolean {
  return Object.values(data.sectionLimits ?? {}).some(Boolean);
}

export function healthSummaryKey(data: HealthOverviewData, heatFailed: boolean, due: HealthDueItem[]): TranslationKey {
  if (heatFailed || Object.keys(data.sectionErrors ?? {}).length) return 'health.uxPartial';
  if (healthHasLimitedData(data)) return 'health.uxLimitedSummary';
  return due.some(item => item.days <= 30) ? 'health.uxAttention' : due.length ? 'health.uxNoNearDue' : 'health.recordNoDue';
}
