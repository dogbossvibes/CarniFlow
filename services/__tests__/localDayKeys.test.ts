// Tages-Keys für Training müssen den LOKALEN Kalendertag verwenden.
import { createTrainingUnit } from '@/services/trainingUnitService';
import { computeUnitStats } from '@/services/trainingUnitStats';
import type { TrainingUnit } from '@/types/trainingUnit';

const mockInsert = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => { mockInsert(row); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
    }),
  },
}));

const unit = (session_date: string): TrainingUnit => ({ id: session_date, session_date, exercises: [] } as unknown as TrainingUnit);

// Zwei lokale Zeitpunkte am 17.11.2026: 00:30 und 23:30. Bei positiver UTC-Abweichung
// (CH) kippte 00:30 per toISOString() auf den 16.11., bei negativer (Amerika) 23:30 auf
// den 18.11. Der Fix muss in jeder Zeitzone den 17.11. liefern.
describe.each([
  ['00:30 lokal', new Date(2026, 10, 17, 0, 30)],
  ['23:30 lokal', new Date(2026, 10, 17, 23, 30)],
])('lokale Tages-Keys um %s', (_label, now) => {
  const previousTz = process.env.TZ;
  beforeAll(() => {
    if (!previousTz) process.env.TZ = 'Europe/Zurich'; // CI ohne TZ: wie in der Schweiz prüfen
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => {
    jest.useRealTimers();
    if (previousTz === undefined) delete process.env.TZ; else process.env.TZ = previousTz;
  });

  it('neue Einheit bekommt das lokale Datum als session_date', async () => {
    mockInsert.mockClear();
    await createTrainingUnit('owner-1', 'dog-1');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ session_date: '2026-11-17' }));
  });

  it('Aktivitätskalender endet mit dem lokalen Heute', () => {
    const stats = computeUnitStats([unit('2026-11-17')]);
    expect(stats.calendar[stats.calendar.length - 1]).toEqual({ date: '2026-11-17', active: true });
  });

  it('Serie zählt die Einheit von heute (lokal)', () => {
    expect(computeUnitStats([unit('2026-11-17')]).streak).toBe(1);
    expect(computeUnitStats([unit('2026-11-17'), unit('2026-11-16')]).streak).toBe(2);
  });

  it('Einheit vom Montag zählt zur laufenden Woche', () => {
    // 16.11.2026 ist ein Montag, 17.11. ein Dienstag.
    expect(computeUnitStats([unit('2026-11-16'), unit('2026-11-17')]).thisWeek).toBe(2);
    expect(computeUnitStats([unit('2026-11-15')]).thisWeek).toBe(0);
  });
});
