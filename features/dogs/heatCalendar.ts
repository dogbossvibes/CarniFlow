import { fromISODate, toISODate } from '@/features/dogs/dateInput';
import { durationDays, isActiveCycle, predictHeat, type HeatCycle, type HeatObservation, type HeatPhase } from '@/features/dogs/heatCycles';

export type HeatCalendarFilter = 'all' | 'current' | 'past';

export type HeatPhaseTone = 'proestrus' | 'estrus' | 'diestrus' | 'anestrus' | 'default';

export interface HeatCalendarDay {
  key: string;
  day: number;
  cycle: HeatCycle | null;
  phase: HeatPhase | null;
  observations: HeatObservation[];
}

export interface HeatCalendarStats {
  lastCompleted: HeatCycle | null;
  averageCycleDays: number | null;
  averageHeatDays: number | null;
  averageEstrusDays: number | null;
  nextExpected: string | null;
}

/** Omit unknown legacy subrecord counts instead of displaying misleading zeroes. */
export function heatHistoryMetadata(duration: number | null, phaseCount: number, observationCount: number): string {
  return [
    duration ? `${duration} Tage` : 'Dauer offen',
    phaseCount > 0 ? `${phaseCount} Phasen` : null,
    observationCount > 0 ? `${observationCount} Beobachtungen` : null,
  ].filter((value): value is string => !!value).join(' · ');
}

const dateAtStart = (iso: string): Date | null => fromISODate(iso);

export const dayKey = (date: Date) => toISODate(date);

export function addCalendarDays(iso: string, days: number): string {
  const date = dateAtStart(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function phaseTone(phaseType: string | null | undefined): HeatPhaseTone {
  const normalized = (phaseType ?? '').toLocaleLowerCase('de-DE');
  // Check compound names before Östrus: both Diöstrus and Anöstrus contain it.
  if (normalized.includes('diöstrus') || normalized.includes('diestrus') || normalized.includes('metöstrus') || normalized.includes('metoestrus')) return 'diestrus';
  if (normalized.includes('anöstrus') || normalized.includes('anoestrus')) return 'anestrus';
  if (normalized.includes('proöstrus') || normalized.includes('proestrus')) return 'proestrus';
  if (normalized.includes('östrus') || normalized.includes('oestrus')) return 'estrus';
  return 'default';
}

export function filterHeatCycles(cycles: HeatCycle[], filter: HeatCalendarFilter): HeatCycle[] {
  if (filter === 'all') return cycles;
  return cycles.filter(cycle => filter === 'current' ? isActiveCycle(cycle) : !isActiveCycle(cycle));
}

export function cycleVisibleEnd(cycle: HeatCycle, today: string): string {
  return cycle.endDate ?? (isActiveCycle(cycle) ? today : cycle.startDate);
}

function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function getMonthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array<string | null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => dayKey(new Date(year, month, index + 1))),
  ];
}

export function buildHeatCalendarDays({
  year, month, cycles, phases, observations, today = dayKey(new Date()),
}: {
  year: number;
  month: number;
  cycles: HeatCycle[];
  phases: HeatPhase[];
  observations: HeatObservation[];
  today?: string;
}): HeatCalendarDay[] {
  const phasesByCycle = new Map<string, HeatPhase[]>();
  phases.forEach(phase => {
    const list = phasesByCycle.get(phase.heatCycleId) ?? [];
    list.push(phase);
    phasesByCycle.set(phase.heatCycleId, list);
  });
  const observationsByDate = new Map<string, HeatObservation[]>();
  observations.forEach(observation => {
    const list = observationsByDate.get(observation.date) ?? [];
    list.push(observation);
    observationsByDate.set(observation.date, list);
  });

  return getMonthGrid(year, month).flatMap(key => {
    if (!key) return [];
    const matchingCycles = cycles
      .filter(cycle => isWithin(key, cycle.startDate, cycleVisibleEnd(cycle, today)))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const cycle = matchingCycles[0] ?? null;
    const phase = cycle
      ? (phasesByCycle.get(cycle.id) ?? [])
        .filter(item => isWithin(key, item.startDate, item.endDate ?? cycleVisibleEnd(cycle, today)))
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
      : null;
    return [{ key, day: Number(key.slice(-2)), cycle, phase, observations: observationsByDate.get(key) ?? [] }];
  });
}

export function currentHeatPhase(cycle: HeatCycle, phases: HeatPhase[], today = dayKey(new Date())): HeatPhase | null {
  return phases
    .filter(phase => phase.heatCycleId === cycle.id && isWithin(today, phase.startDate, phase.endDate ?? cycleVisibleEnd(cycle, today)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

export function getHeatCalendarStats(cycles: HeatCycle[], phases: HeatPhase[]): HeatCalendarStats {
  const completed = cycles
    .filter(cycle => cycle.endDate && !isActiveCycle(cycle))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const durations = completed
    .map(cycle => durationDays(cycle.startDate, cycle.endDate))
    .filter((duration): duration is number => duration != null);
  const estrusDurations = phases
    .filter(phase => phaseTone(phase.phaseType) === 'estrus')
    .map(phase => durationDays(phase.startDate, phase.endDate))
    .filter((duration): duration is number => duration != null);
  const prediction = predictHeat(cycles);
  const average = (values: number[]) => values.length >= 2
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;

  return {
    lastCompleted: completed[0] ?? null,
    averageCycleDays: prediction?.avgCycleDays ?? null,
    averageHeatDays: average(durations),
    averageEstrusDays: average(estrusDurations),
    nextExpected: prediction && !prediction.estimate ? prediction.nextDate : null,
  };
}
