import { healthDayDiff, healthDueItems, healthSummaryKey } from '../healthOverview';
import { buildHealthTimeline } from '../healthTimeline';
import type { HealthOverviewData } from '@/services/healthService';

const empty: HealthOverviewData = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
const now = new Date('2026-10-08T12:00:00');
const vaccine = (id: string, next_due_on: string | null) => ({ id, owner_id: 'o', dog_id: 'd', vaccine_type: 'Rabies', administered_on: '2026-01-01', next_due_on, vaccine_name: null, clinic_name: null, note: null, document_id: null, batch_number: null, created_at: '2026-01-01', updated_at: '2026-01-01' });
const med = (id: string, is_active: boolean, starts_on: string, ends_on: string | null = null) => ({ id, owner_id: 'o', dog_id: 'd', name: id, is_active, starts_on, ends_on, dosage: null, frequency: null, note: null, dose_amount: null, dose_unit: null, administration_route: null, prescribing_vet: null, created_at: starts_on, updated_at: starts_on });

describe('Health overview priorities', () => {
  it('keeps every due row and its exact detail reference, overdue first', () => {
    const data = { ...empty, vaccinations: [vaccine('later', '2026-12-01'), vaccine('overdue', '2026-10-01'), vaccine('today', '2026-10-08'), vaccine('fourth', '2026-11-01')] };
    const result = healthDueItems(data, buildHealthTimeline(data), now);
    expect(result.map(item => item.itemId)).toEqual(['vaccination:overdue', 'vaccination:today', 'vaccination:fourth', 'vaccination:later']);
    expect(result.map(item => item.days)).toEqual([-7, 0, 24, 54]);
  });
  it('excludes invalid/missing dates and inactive, started or contradictory medication', () => {
    const data = { ...empty, vaccinations: [vaccine('bad', 'invalid'), vaccine('none', null)], medications: [med('inactive', false, '2026-10-09'), med('started', true, '2026-10-07'), med('bad-range', true, '2026-10-10', '2026-10-09'), med('future', true, '2026-10-09')] };
    expect(healthDueItems(data, buildHealthTimeline(data), now).map(item => item.itemId)).toEqual(['medication:future']);
  });
  it('compares local calendar days across DST and time-of-day differences', () => {
    expect(healthDayDiff('2026-10-26', new Date('2026-10-25T23:59:00'))).toBe(1);
    expect(healthDayDiff('2026-10-08', now)).toBe(0);
  });
  it('reports missing sections before drawing any reassuring summary', () => {
    expect(healthSummaryKey({ ...empty, sectionErrors: { vaccinations: 'offline' } }, false, [])).toBe('health.uxPartial');
    expect(healthSummaryKey(empty, true, [])).toBe('health.uxPartial');
    expect(healthSummaryKey(empty, false, [])).toBe('health.recordNoDue');
    expect(healthSummaryKey({ ...empty, sectionLimits: { vaccinations: true } }, false, [])).toBe('health.uxLimitedSummary');
    const data = { ...empty, vaccinations: [vaccine('due', '2026-10-09')] };
    expect(healthSummaryKey(data, false, healthDueItems(data, buildHealthTimeline(data), now))).toBe('health.uxAttention');
  });
});
