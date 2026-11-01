import { journalMeasurements, weightChart, weightDay, weightSeries } from '../weightJournal';
import type { DogHealthEntryRow } from '@/services/dogHub';

function row(id: string, entry_date: string, weight_kg: number | null): DogHealthEntryRow {
  return { id, dog_id: 'dog', entry_date, weight_kg, created_at: `${entry_date}T12:00:00Z`, load_level: 'mittel', is_rest_day: false, is_intense: true, note: 'Original note' };
}

it('keeps equal and same-day measurements distinct, with all original fields and input order untouched', () => {
  const entries = [row('second', '2026-10-15', 31.6), row('load-only', '2026-10-16', null), row('first', '2026-10-01', 31.6)];
  const snapshot = JSON.stringify(entries);
  const measurements = journalMeasurements(entries);
  expect(measurements.map(entry => entry.id)).toEqual(['first', 'second']);
  expect(measurements[1]).toBe(entries[0]);
  expect(JSON.stringify(entries)).toBe(snapshot);
});

it('validates actual calendar days and accepts legacy ISO timestamps without interpreting them in UTC-local time', () => {
  expect(weightDay('2024-02-29')).toBe(Date.UTC(2024, 1, 29));
  expect(weightDay('2026-10-01T09:00:00Z')).toBe(Date.UTC(2026, 9, 1));
  for (const invalid of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-01-00', 'not-a-date']) expect(weightDay(invalid)).toBeNull();
});

it('uses calendar months, clamps month-end, and never drops rows from the measurement history when filtering a chart', () => {
  const entries = journalMeasurements([row('before', '2026-02-27', 31), row('boundary', '2026-02-28', 31.2), row('today', '2026-03-31', 31.3), row('future', '2026-04-01', 31.4)]);
  expect(weightSeries(entries, 'month', new Date(2026, 2, 31)).map(value => value.entry.id)).toEqual(['boundary', 'today']);
  expect(weightSeries(entries, 'all', new Date(2026, 2, 31))).toHaveLength(4);
  expect(entries).toHaveLength(4);
});

it('keeps undated legacy measurements in history while excluding only their undrawable chart points', () => {
  const entries = journalMeasurements([row('unknown', 'legacy date', 22), row('valid', '2026-10-01', 23)]);
  expect(entries).toHaveLength(2);
  expect(weightSeries(entries, 'all').map(value => value.entry.id)).toEqual(['valid']);
});

it('positions points by elapsed calendar time rather than equally spaced sample indices', () => {
  const series = weightSeries(journalMeasurements([row('a', '2026-10-01', 31), row('b', '2026-10-02', 32), row('c', '2026-10-11', 33)]), 'all');
  const chart = weightChart(series, 320, 200)!;
  expect((chart.points[1].x - chart.points[0].x) / (chart.points[2].x - chart.points[0].x)).toBeCloseTo(0.1);
});

it.each([[0.12, 0.15], [31.6, 31.6], [105, 112], [-1, 2]])('uses a finite kilogram scale for %j, without the old 100-point ceiling', (...weights) => {
  const entries = journalMeasurements(weights.map((value, i) => row(String(i), `2026-10-0${i + 1}`, value)));
  const chart = weightChart(weightSeries(entries, 'all'), 320, 240)!;
  expect(chart.path).not.toMatch(/NaN|Infinity/);
  for (const point of chart.points) {
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(chart.bottom);
  }
});

it('supports a single measurement and same-day measurements without fabricating an interval or invalid coordinates', () => {
  const entries = journalMeasurements([row('a', '2026-10-01', 31.6), row('b', '2026-10-01', 31.7)]);
  for (const values of [entries.slice(0, 1), entries]) {
    const chart = weightChart(weightSeries(values, 'all'), 320, 200)!;
    expect(chart.path).not.toMatch(/NaN|Infinity/);
    expect(new Set(chart.points.map(point => point.x)).size).toBe(1);
  }
  expect(weightChart([], 320, 200)).toBeNull();
});

it('uses readable rounded kilogram ticks instead of arbitrary thousandths', () => {
  const entries = journalMeasurements([row('a', '2026-10-01', 31.6), row('b', '2026-10-31', 32.4)]);
  const chart = weightChart(weightSeries(entries, 'all'), 320, 200)!;
  expect(chart.ticks.map(tick => Number(tick.value.toFixed(3)))).toEqual([31.4, 32, 32.6]);
});
