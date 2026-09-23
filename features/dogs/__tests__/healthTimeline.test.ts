import { buildHealthTimeline, filterHealthTimeline } from '@/features/dogs/healthTimeline';
import type { HealthOverviewData } from '@/services/healthService';

const empty: HealthOverviewData = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };

describe('health timeline aggregation', () => {
  it('combines sources and sorts newest first without duplicating rows', () => {
    const data: HealthOverviewData = {
      ...empty,
      entries: [{ id: 'weight', dog_id: 'd', entry_date: '2026-09-20', weight_kg: 20, load_level: null, is_rest_day: false, is_intense: false, note: null, created_at: '2026-09-20T08:00:00Z' }],
      conditions: [{ id: 'condition', owner_id: 'o', dog_id: 'd', kind: 'allergy', name: 'Huhn', status: 'active', started_on: '2026-09-19', ended_on: null, note: null, created_at: '2026-09-19T08:00:00Z', updated_at: '2026-09-19T08:00:00Z' }],
      vaccinations: [{ id: 'vaccine', owner_id: 'o', dog_id: 'd', vaccine_type: 'Tollwut', administered_on: '2026-09-21', next_due_on: null, clinic_name: null, vaccine_name: null, note: null, document_id: null, created_at: '2026-09-21T08:00:00Z', updated_at: '2026-09-21T08:00:00Z' }],
    };
    const result = buildHealthTimeline(data);
    expect(result.map(item => item.id)).toEqual(['vaccination:vaccine', 'weight:weight', 'condition:condition']);
    expect(new Set(result.map(item => item.id)).size).toBe(result.length);
  });

  it('puts malformed and null dates last without crashing', () => {
    const data: HealthOverviewData = { ...empty, medications: [
      { id: 'bad', owner_id: 'o', dog_id: 'd', name: 'A', dosage: null, frequency: null, starts_on: 'not-a-date', ends_on: null, is_active: false, note: null, created_at: 'bad', updated_at: 'bad' },
      { id: 'good', owner_id: 'o', dog_id: 'd', name: 'B', dosage: null, frequency: null, starts_on: '2026-09-22', ends_on: null, is_active: true, note: null, created_at: '2026-09-22', updated_at: '2026-09-22' },
    ] };
    const result = buildHealthTimeline(data);
    expect(result.map(item => item.id)).toEqual(['medication:good', 'medication:bad']);
    expect(result[1].date).toBeNull();
  });

  it('maps legacy health documents and intolerance conditions', () => {
    const data: HealthOverviewData = { ...empty, documents: [{ id: 'doc', dog_id: 'd', kind: 'impfpass', title: null, category: null, subtype: null, file_url: null, issued_on: '2026-01-01', note: null, created_at: '2026-01-01' }], conditions: [{ id: 'int', owner_id: 'o', dog_id: 'd', kind: 'intolerance', name: 'Laktose', status: 'active', started_on: null, ended_on: null, note: null, created_at: '2026-01-02', updated_at: '2026-01-02' }] };
    const result = buildHealthTimeline(data);
    expect(result.map(item => item.id)).toEqual(['condition:int', 'document:doc']);
    expect(result[0].detail).toBe('Unverträglichkeit');
  });

  it('keeps condition filters separate from medication and weight', () => {
    const items = buildHealthTimeline({ ...empty, conditions: [{ id: 'c', owner_id: 'o', dog_id: 'd', kind: 'diagnosis', name: 'Arthrose', status: 'active', started_on: '2026-01-01', ended_on: null, note: null, created_at: '2026-01-01', updated_at: '2026-01-01' }] });
    expect(filterHealthTimeline(items, 'condition_group').map(item => item.id)).toEqual(['condition:c']);
    expect(filterHealthTimeline(items, 'medication')).toEqual([]);
  });
});
