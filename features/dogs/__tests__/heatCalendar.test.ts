import { buildHeatCalendarDays, currentHeatPhase, getMonthGrid, heatHistoryMetadata, phaseTone } from '../heatCalendar';
import type { HeatCycle, HeatPhase } from '../heatCycles';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const cycle = (overrides: Partial<HeatCycle> = {}): HeatCycle => ({
  id: 'cycle-1', dogId: 'dog-1', startDate: '2026-08-03', endDate: '2026-08-19', status: 'completed', notes: null, phase: null, createdAt: '2026-08-03T00:00:00Z', ...overrides,
});

const phase = (overrides: Partial<HeatPhase> = {}): HeatPhase => ({
  id: 'phase-1', heatCycleId: 'cycle-1', phaseType: 'Östrus', startDate: '2026-08-07', endDate: '2026-08-12', notes: null, createdAt: '2026-08-07T00:00:00Z', ...overrides,
});

describe('heat calendar ranges', () => {
  it('places a completed cycle in its correct month, including start and end', () => {
    const days = buildHeatCalendarDays({ year: 2026, month: 7, cycles: [cycle()], phases: [], observations: [], today: '2026-08-20' });
    expect(days.find(day => day.key === '2026-08-03')?.cycle?.id).toBe('cycle-1');
    expect(days.find(day => day.key === '2026-08-19')?.cycle?.id).toBe('cycle-1');
    expect(days.find(day => day.key === '2026-08-20')?.cycle).toBeNull();
  });

  it('keeps a cycle visible across a month boundary', () => {
    const boundaryCycle = cycle({ startDate: '2026-07-29', endDate: '2026-08-04' });
    const july = buildHeatCalendarDays({ year: 2026, month: 6, cycles: [boundaryCycle], phases: [], observations: [], today: '2026-08-20' });
    const august = buildHeatCalendarDays({ year: 2026, month: 7, cycles: [boundaryCycle], phases: [], observations: [], today: '2026-08-20' });
    expect(july.find(day => day.key === '2026-07-29')?.cycle?.id).toBe('cycle-1');
    expect(august.find(day => day.key === '2026-08-04')?.cycle?.id).toBe('cycle-1');
  });

  it('renders an active cycle without end date through today only', () => {
    const active = cycle({ startDate: '2026-08-03', endDate: null, status: 'active' });
    const days = buildHeatCalendarDays({ year: 2026, month: 7, cycles: [active], phases: [], observations: [], today: '2026-08-14' });
    expect(days.find(day => day.key === '2026-08-14')?.cycle?.id).toBe('cycle-1');
    expect(days.find(day => day.key === '2026-08-15')?.cycle).toBeNull();
  });

  it('does not extend a past cycle past its persisted end date', () => {
    const completed = cycle({ startDate: '2026-08-03', endDate: '2026-08-10', status: 'completed' });
    const days = buildHeatCalendarDays({ year: 2026, month: 7, cycles: [completed], phases: [], observations: [], today: '2026-08-20' });
    expect(days.find(day => day.key === '2026-08-10')?.cycle?.id).toBe('cycle-1');
    expect(days.find(day => day.key === '2026-08-11')?.cycle).toBeNull();
  });

  it('maps several phases within one cycle to their correct date ranges', () => {
    const phases = [
      phase({ id: 'proestrus', phaseType: 'Proöstrus', startDate: '2026-08-03', endDate: '2026-08-06' }),
      phase({ id: 'estrus', phaseType: 'Östrus', startDate: '2026-08-07', endDate: '2026-08-12' }),
      phase({ id: 'diestrus', phaseType: 'Diöstrus', startDate: '2026-08-13', endDate: '2026-08-19' }),
    ];
    const days = buildHeatCalendarDays({ year: 2026, month: 7, cycles: [cycle()], phases, observations: [], today: '2026-08-20' });
    expect(days.find(day => day.key === '2026-08-05')?.phase?.phaseType).toBe('Proöstrus');
    expect(days.find(day => day.key === '2026-08-10')?.phase?.phaseType).toBe('Östrus');
    expect(days.find(day => day.key === '2026-08-16')?.phase?.phaseType).toBe('Diöstrus');
  });

  it('recognizes a dated phase that includes today as the current phase', () => {
    const current = currentHeatPhase(cycle(), [phase({ startDate: '2026-08-07', endDate: '2026-08-12' })], '2026-08-10');
    expect(current?.phaseType).toBe('Östrus');
  });

  it('uses a Monday-first month grid and phase aliases for the visual tone', () => {
    expect(getMonthGrid(2026, 7).slice(0, 5)).toEqual([null, null, null, null, null]); // 1 Aug 2026 is Saturday
    expect(phaseTone('Metöstrus')).toBe('diestrus');
    expect(phaseTone('Anöstrus')).toBe('anestrus');
  });
});

describe('heat history metadata', () => {
  it('does not show zero child counts for legacy cycles', () => {
    expect(heatHistoryMetadata(21, 0, 0)).toBe('21 Tage');
  });

  it('shows only recorded phase and observation counts', () => {
    expect(heatHistoryMetadata(21, 3, 0)).toBe('21 Tage · 3 Phasen');
    expect(heatHistoryMetadata(21, 4, 7)).toBe('21 Tage · 4 Phasen · 7 Beobachtungen');
  });
});
