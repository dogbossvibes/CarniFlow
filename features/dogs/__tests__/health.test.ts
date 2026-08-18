import type { DogDewormingEntryRow, DogHealthEntryRow } from '@/services/dogHub';
import { latestDeworming, toDateKey, weightChange, weightMeasurements } from '@/features/dogs/health';

function healthEntry(overrides: Partial<DogHealthEntryRow>): DogHealthEntryRow {
  return {
    id: 'health', dog_id: 'dog', entry_date: '2026-08-01', weight_kg: null,
    load_level: null, is_rest_day: false, is_intense: false, note: null, created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

function dewormingEntry(overrides: Partial<DogDewormingEntryRow>): DogDewormingEntryRow {
  return {
    id: 'deworming', dog_id: 'dog', treatment_date: '2026-08-01', product: null,
    note: null, next_due_date: null, created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

describe('dog health helpers', () => {
  it('keeps only numeric weight measurements and sorts equal-day measurements by creation time', () => {
    const result = weightMeasurements([
      healthEntry({ id: 'empty' }),
      healthEntry({ id: 'later', weight_kg: 25.4, created_at: '2026-08-01T11:00:00Z' }),
      healthEntry({ id: 'early', weight_kg: 25.1, created_at: '2026-08-01T09:00:00Z' }),
      healthEntry({ id: 'older', entry_date: '2026-07-01', weight_kg: 24.8 }),
    ]);

    expect(result.map(entry => entry.id)).toEqual(['older', 'early', 'later']);
  });

  it('calculates the latest weight change without inventing a trend for one measurement', () => {
    expect(weightChange([healthEntry({ weight_kg: 20 })])).toEqual({ current: 20, previous: null, delta: null });
    const change = weightChange([
      healthEntry({ entry_date: '2026-08-01', weight_kg: 20 }),
      healthEntry({ entry_date: '2026-08-02', weight_kg: 20.35 }),
    ]);
    expect(change).toMatchObject({ current: 20.35, previous: 20 });
    expect(change?.delta).toBeCloseTo(0.35);
  });

  it('uses the actual newest deworming record and never calculates a medical interval', () => {
    expect(latestDeworming([
      dewormingEntry({ id: 'old', treatment_date: '2026-01-01' }),
      dewormingEntry({ id: 'new', treatment_date: '2026-08-01', next_due_date: '2026-09-01' }),
    ])?.id).toBe('new');
    expect(latestDeworming([])).toBeNull();
  });

  it('serializes the locally selected calendar day without a UTC date shift', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
