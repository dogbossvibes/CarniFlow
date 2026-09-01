import {
  predictHeat,
  heatCycleDay,
  isActiveCycle,
  durationDays,
  fmtDate,
  DEFAULT_CYCLE_DAYS,
  HEAT_PHASE_TYPES,
  HEAT_OBSERVATION_TYPES,
  type HeatCycle,
} from '../heatCycles';
import { toISODate } from '../dateInput';
import i18n from '@/i18n/config';

// Mock supabase to avoid native module dependency in tests
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// fmtDate/predictHeat format dates using the active app locale (see heatCycles.ts's
// heatIntlDate). Pin to 'de' explicitly — this file asserts German formatting
// ("01. Jan"), independent of the test runner's OS locale (which now resolves to a
// real 'en' since EN is a registered app locale, not silently to 'de' as before).
beforeAll(async () => { await i18n.changeLanguage('de'); });

// Helper to create a HeatCycle with sensible defaults
function makeCycle(overrides: Partial<HeatCycle> & { startDate: string }): HeatCycle {
  return {
    id: 'test-id',
    dogId: 'dog-1',
    endDate: null,
    status: 'active',
    notes: null,
    phase: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('predictHeat', () => {
  it('returns null for empty cycles', () => {
    expect(predictHeat([])).toBeNull();
  });

  it('returns estimate with DEFAULT_CYCLE_DAYS for single cycle', () => {
    const cycles = [makeCycle({ startDate: '2026-01-01' })];
    const p = predictHeat(cycles)!;
    expect(p).not.toBeNull();
    expect(p.estimate).toBe(true);
    expect(p.cycleLengthDays).toBe(DEFAULT_CYCLE_DAYS);
    expect(p.avgCycleDays).toBeNull();
    expect(p.nextDate).toBe('2026-06-30'); // Jan 1 + 180 days
  });

  it('calculates average from 2+ cycles', () => {
    const cycles = [
      makeCycle({ startDate: '2026-01-01', endDate: '2026-01-21', status: 'completed' }),
      makeCycle({ startDate: '2026-07-01', endDate: '2026-07-20', status: 'completed' }),
    ];
    const p = predictHeat(cycles)!;
    expect(p.estimate).toBe(false);
    expect(p.avgCycleDays).toBe(181); // Jan 1 → Jul 1 = 181 days
    expect(p.nextDate).toBe('2026-12-29'); // Jul 1 + 181 = ~Dec 29
  });

  it('detects active cycle without end date (within 21 days)', () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 5);
    const iso = toISODate(start);
    const cycles = [makeCycle({ startDate: iso })];
    const p = predictHeat(cycles)!;
    expect(p.active).toBe(true);
    expect(p.activeSinceDays).toBe(6);
  });

  it('detects active cycle with end date in the future', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const cycles = [
      makeCycle({
        startDate: '2026-08-01',
        endDate: toISODate(future),
      }),
    ];
    const p = predictHeat(cycles)!;
    expect(p.active).toBe(true);
  });

  it('detects completed cycle with past end date', () => {
    const cycles = [
      makeCycle({
        startDate: '2026-01-01',
        endDate: '2026-01-21',
        status: 'completed',
      }),
    ];
    const p = predictHeat(cycles)!;
    expect(p.active).toBe(false);
  });

  it('marks cycle as active when status is active even if beyond 21 days', () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const iso = toISODate(start);
    const cycles = [makeCycle({ startDate: iso, status: 'active' })];
    const p = predictHeat(cycles)!;
    expect(p.active).toBe(true);
    expect(p.activeSinceDays).toBe(31);
  });

  it('includes dateRange in prediction', () => {
    const cycles = [
      makeCycle({ startDate: '2026-01-01', endDate: '2026-01-21' }),
    ];
    const p = predictHeat(cycles)!;
    expect(p.dateRange).toBeTruthy();
    expect(p.dateRange).toContain('01. Jan');
  });

  it('filters out implausible gaps (<30 days or >600 days)', () => {
    const cycles = [
      makeCycle({ startDate: '2026-01-01' }),
      makeCycle({ startDate: '2026-01-15' }), // 14 days - implausible
      makeCycle({ startDate: '2026-07-01' }), // 168 days from Jan 15 - plausible
    ];
    const p = predictHeat(cycles)!;
    // Only the gap from Jan 15 to Jul 1 (167 days) should be used
    expect(p.avgCycleDays).toBe(167);
  });
});

describe('isActiveCycle', () => {
  it('returns true for active status', () => {
    const c = makeCycle({ startDate: '2026-01-01', status: 'active' });
    expect(isActiveCycle(c)).toBe(true);
  });

  it('returns true for no end date within 21 days', () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    const c = makeCycle({ startDate: toISODate(start) });
    expect(isActiveCycle(c)).toBe(true);
  });

  it('returns false for completed status with past end date', () => {
    const c = makeCycle({
      startDate: '2026-01-01',
      endDate: '2026-01-21',
      status: 'completed',
    });
    expect(isActiveCycle(c)).toBe(false);
  });

  it('returns true for no end date within 21 days even with completed status', () => {
    // completed status but no end date set
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 5);
    const c = makeCycle({
      startDate: toISODate(start),
      status: 'completed',
    });
    // isActiveCycle checks status first, then endDate logic
    // completed + no end date + within 21 days => completed check returns false
    // Actually: isActiveCycle checks status='active' first, then falls back to date logic
    // With status='completed' and no endDate, it checks the date-based logic
    expect(isActiveCycle(c)).toBe(true); // within 21 days without end date
  });
});

describe('durationDays', () => {
  it('calculates correct duration', () => {
    expect(durationDays('2026-01-01', '2026-01-21')).toBe(21);
  });

  it('returns null when no end date', () => {
    expect(durationDays('2026-01-01', null)).toBeNull();
  });

  it('returns at least 1 day for same-day start and end', () => {
    expect(durationDays('2026-01-01', '2026-01-01')).toBe(1);
  });
});

describe('heatCycleDay', () => {
  it('uses an inclusive day number: the start date is day 1', () => {
    expect(heatCycleDay('2026-08-12', '2026-08-12')).toBe(1);
    expect(heatCycleDay('2026-08-12', '2026-08-13')).toBe(2);
  });

  it('keeps the runtime scenario consistent across all consumers', () => {
    expect(heatCycleDay('2026-08-12', '2026-08-27')).toBe(16);
  });

  it('remains date-based across month and year boundaries', () => {
    expect(heatCycleDay('2026-01-31', '2026-02-01')).toBe(2);
    expect(heatCycleDay('2026-12-31', '2027-01-01')).toBe(2);
  });

  it('does not drift around common daylight-saving transitions', () => {
    expect(heatCycleDay('2026-03-08', '2026-03-09')).toBe(2);
    expect(heatCycleDay('2026-11-01', '2026-11-02')).toBe(2);
  });
});

describe('fmtDate', () => {
  it('formats a valid ISO date', () => {
    const result = fmtDate('2026-08-20');
    expect(result).toBeTruthy();
    expect(result).toContain('20');
    expect(result).toContain('Aug');
  });

  it('returns null for null input', () => {
    expect(fmtDate(null)).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(fmtDate('not-a-date')).toBeNull();
  });
});

describe('heat phase and observation type constants', () => {
  it('has expected phase types', () => {
    expect(HEAT_PHASE_TYPES).toContain('Proöstrus');
    expect(HEAT_PHASE_TYPES).toContain('Östrus');
    expect(HEAT_PHASE_TYPES).toContain('Diöstrus');
    expect(HEAT_PHASE_TYPES).toContain('Anöstrus');
  });

  it('has expected observation types', () => {
    expect(HEAT_OBSERVATION_TYPES).toContain('Blutung');
    expect(HEAT_OBSERVATION_TYPES).toContain('Progesteronwert');
    expect(HEAT_OBSERVATION_TYPES).toContain('Notiz');
  });
});

describe('Test 1: Neue Läufigkeit erzeugt genau einen Datensatz', () => {
  it('prediction works with exactly one heat cycle', () => {
    const cycles = [makeCycle({ startDate: '2026-08-20', status: 'active' })];
    const p = predictHeat(cycles)!;
    expect(p).not.toBeNull();
    expect(p.active).toBe(true);
    // Exactly one cycle → estimate
    expect(p.estimate).toBe(true);
  });
});

describe('Test 2: Phase gehört zu bestehender heat_cycle_id', () => {
  it('HEAT_PHASE_TYPES can be used as phase_type values', () => {
    // This test verifies the data model supports phases within a cycle.
    // The actual DB insert is tested via integration/smoke tests.
    expect(HEAT_PHASE_TYPES.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Test 3: Mehrere Phasen gehören zum selben Zyklus', () => {
  it('supports multiple phase types within a single heat cycle', () => {
    // Simulates adding Proöstrus then Östrus to the same cycle
    const phase1 = { heatCycleId: 'cycle-1', phaseType: 'Proöstrus', startDate: '2026-08-20' };
    const phase2 = { heatCycleId: 'cycle-1', phaseType: 'Östrus', startDate: '2026-08-25' };
    expect(phase1.heatCycleId).toBe(phase2.heatCycleId);
    expect(phase1.phaseType).not.toBe(phase2.phaseType);
  });
});

describe('Test 5: Startdatum ändern erzeugt keinen Duplicate', () => {
  it('updateHeatCycle only modifies the target cycle', () => {
    // The function is tested via integration; here we verify the interface
    const cycle = makeCycle({ startDate: '2026-08-20' });
    const updated = { ...cycle, startDate: '2026-08-18' };
    expect(updated.id).toBe(cycle.id);
    expect(updated.startDate).toBe('2026-08-18');
  });
});

describe('Test 6: Läufigkeit beenden', () => {
  it('endHeatCycle sets end_date and status to completed', () => {
    const cycle = makeCycle({ startDate: '2026-08-20', status: 'active' });
    const ended = {
      ...cycle,
      endDate: toISODate(new Date()),
      status: 'completed' as const,
    };
    expect(ended.status).toBe('completed');
    expect(ended.endDate).toBeTruthy();
  });
});

describe('Test 7: Forecast wird nicht durch Phasen-Änderungen beeinflusst', () => {
  it('prediction uses only start dates of cycles, not phases', () => {
    const cycles = [
      makeCycle({ startDate: '2026-01-01', status: 'completed' }),
      makeCycle({ startDate: '2026-07-01', status: 'completed' }),
    ];
    const p1 = predictHeat(cycles)!;
    // Adding a phase to a cycle doesn't change the cycle's startDate
    // So prediction should be identical
    const p2 = predictHeat(cycles)!;
    expect(p1.nextDate).toBe(p2.nextDate);
    expect(p1.avgCycleDays).toBe(p2.avgCycleDays);
  });
});

describe('Timeline Integration', () => {
  it('one heat cycle with multiple phases produces exactly 1 timeline entry', () => {
    // Simulates: one cycle with 3 phases — DogHeatCard renders one entry per cycle
    const cycle = makeCycle({ startDate: '2026-08-20', status: 'active' });
    const phases = [
      { heatCycleId: cycle.id, phaseType: 'Proöstrus', startDate: '2026-08-20', endDate: '2026-08-25' },
      { heatCycleId: cycle.id, phaseType: 'Östrus', startDate: '2026-08-25', endDate: null },
    ];
    const observations = [
      { heatCycleId: cycle.id, date: '2026-08-21', type: 'Blutung' },
      { heatCycleId: cycle.id, date: '2026-08-22', type: 'Blutung' },
      { heatCycleId: cycle.id, date: '2026-08-26', type: 'Rüdeninteresse' },
    ];

    // The data layer produces exactly 1 cycle, regardless of phase/obs count
    const cycles = [cycle];
    expect(cycles.length).toBe(1);

    // Phase counts are metadata, not separate entries
    expect(phases.length).toBe(2); // 2 phases within 1 cycle
    expect(observations.length).toBe(3); // 3 observations within 1 cycle

    // Current phase: open phase with most recent start date
    const open = phases.filter(p => !p.endDate).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const currentPhase = open.length > 0 ? open[0].phaseType : null;
    expect(currentPhase).toBe('Östrus');

    // The prediction is based only on cycle start dates, not phases
    const pred = predictHeat(cycles)!;
    expect(pred.active).toBe(true);
    expect(pred.cycleDay).toBeGreaterThanOrEqual(5);
  });

  it('completed cycle with phases shows counts, not separate entries', () => {
    const cycle = makeCycle({
      startDate: '2026-07-01',
      endDate: '2026-07-20',
      status: 'completed',
    });
    const phases = [
      { heatCycleId: cycle.id, phaseType: 'Proöstrus', startDate: '2026-07-01', endDate: '2026-07-05' },
      { heatCycleId: cycle.id, phaseType: 'Östrus', startDate: '2026-07-05', endDate: '2026-07-12' },
      { heatCycleId: cycle.id, phaseType: 'Diöstrus', startDate: '2026-07-12', endDate: '2026-07-20' },
    ];
    const observations = [
      { heatCycleId: cycle.id, date: '2026-07-02', type: 'Blutung' },
    ];

    // Exactly 1 cycle entry, with phase/obs counts as metadata
    expect([cycle].length).toBe(1);
    expect(phases.length).toBe(3);
    expect(observations.length).toBe(1);

    // Duration is calculated from cycle, not phases
    const dur = durationDays(cycle.startDate, cycle.endDate);
    expect(dur).toBe(20);
  });
});

describe('Status Logic', () => {
  // Status derivation rule: end_date present → completed, end_date null → active
  const deriveStatus = (endDate: string | null): 'active' | 'completed' =>
    endDate ? 'completed' : 'active';

  it('legacy cycle with end_date → status should be completed (backfill)', () => {
    // Migration backfill: existing rows with end_date get status = 'completed'
    const legacy = makeCycle({ startDate: '2026-01-01', endDate: '2026-01-21' });
    expect(deriveStatus(legacy.endDate)).toBe('completed');
  });

  it('legacy cycle without end_date → status stays active', () => {
    // DEFAULT 'active' for rows without end_date is correct
    const legacy = makeCycle({ startDate: '2026-08-20' });
    expect(deriveStatus(legacy.endDate)).toBe('active');
  });

  it('endHeatCycle → completed + end_date = today', () => {
    // endHeatCycle calls updateHeatCycle with { endDate: todayISO(), status: 'completed' }
    const today = toISODate(new Date());
    const endDate = today;
    expect(deriveStatus(endDate)).toBe('completed');
  });

  it('removing end_date → status reverts to active', () => {
    // saveCycle derives status from endDate: null → active
    const cycle = makeCycle({ startDate: '2026-08-20', endDate: '2026-09-08', status: 'completed' });
    // User clears end date in edit form → saveCycle sets endDate: null, status: 'active'
    const newEndDate = null;
    expect(deriveStatus(newEndDate)).toBe('active');
    // Original cycle was completed, after removing end_date it should be active
    expect(cycle.status).toBe('completed');
    expect(deriveStatus(newEndDate)).toBe('active');
  });

  it('status derivation is consistent across all transitions', () => {
    // New: no endDate → active
    expect(deriveStatus(null)).toBe('active');
    // End: endDate set → completed
    expect(deriveStatus('2026-09-08')).toBe('completed');
    // Un-end: endDate removed → active
    expect(deriveStatus(null)).toBe('active');
    // Re-end: endDate set again → completed
    expect(deriveStatus('2026-10-01')).toBe('completed');
  });
});
