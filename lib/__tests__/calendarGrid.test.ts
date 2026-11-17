import { toWeekRows } from '@/lib/calendarGrid';
import { getMonthGrid } from '@/features/dogs/heatCalendar';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const weekdayOf = (iso: string) => WD[(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay() + 6) % 7];

describe('toWeekRows', () => {
  it('liefert immer genau 7 Zellen pro Woche', () => {
    for (let y = 2024; y <= 2028; y++) for (let m = 0; m < 12; m++) {
      const rows = toWeekRows(getMonthGrid(y, m));
      rows.forEach(row => expect(row).toHaveLength(7));
    }
  });

  it('jedes Datum steht in der Spalte seines Wochentags (Mo–So)', () => {
    for (let y = 2024; y <= 2028; y++) for (let m = 0; m < 12; m++) {
      toWeekRows(getMonthGrid(y, m)).forEach(row => row.forEach((key, col) => {
        if (key) expect(weekdayOf(key)).toBe(WD[col]);
      }));
    }
  });

  it('November 2026: der 17. ist ein Dienstag, der 1. ein Sonntag', () => {
    const rows = toWeekRows(getMonthGrid(2026, 10));
    expect(rows[0][6]).toBe('2026-11-01');
    expect(rows[3][1]).toBe('2026-11-17');
  });

  it('verliert keine Tage', () => {
    const grid = getMonthGrid(2026, 1);
    expect(toWeekRows(grid).flat().filter(Boolean)).toEqual(grid.filter(Boolean));
  });
});
