// Trainingsdoku neu, Etappe 3 (T-184): Verlauf mit Übungs-Matrix – reine,
// lesende Aufbereitung. Zeilen pro Übung (stabile Identität; alte Einträge ohne
// Identität als eigene Zeile nach Sparte + Name), Spalten = letzte Trainings.
import type { TrainingExercise } from '@/types/trainingUnit';
import { legacyStars, levelOf, trendOf, type LearningLevel } from '@/features/training/documentation/learningLevel';
import { daysSince, type SummaryUnit } from './summary';
import { isGeneralExercise } from '@/features/training/documentation/generalExercise';

export const MATRIX_COLUMNS = 6;
export const FALLBACK_DAYS = 7;

export type MatrixCell =
  | { kind: 'level'; level: LearningLevel; down: boolean }
  | { kind: 'legacy'; stars: number }
  | { kind: 'unrated' }
  | { kind: 'none' };

export interface MatrixRow { key: string; name: string; discipline: string; cells: MatrixCell[] }
export interface MatrixColumn { unitId: string; source: 'unit' | 'session'; date: string }
export interface TrainingMatrix {
  disciplines: string[];
  columns: MatrixColumn[];
  rows: MatrixRow[];
  fallback: { name: string; days: number } | null;
  trainings: { id: string; source: 'unit' | 'session'; date: string; disciplines: string[]; names: string[]; durationSec: number | null }[];
}

const rowKey = (e: TrainingExercise) => e.exercise_identity_id ? `id:${e.exercise_identity_id}` : `name:${e.discipline}:${e.exercise_name.trim().toLowerCase()}`;
const byDay = (a: SummaryUnit, b: SummaryUnit) =>
  a.session_date.slice(0, 10).localeCompare(b.session_date.slice(0, 10)) || (a.created_at ?? '').localeCompare(b.created_at ?? '');
const inScope = (discipline: string | null) => (e: TrainingExercise) => !discipline || e.discipline === discipline;

function cellOf(exercise: TrainingExercise | undefined, previous: TrainingExercise | undefined): MatrixCell {
  if (!exercise) return { kind: 'none' };
  const level = levelOf(exercise);
  if (level) return { kind: 'level', level, down: trendOf(exercise, previous) === 'down' };
  const stars = legacyStars(exercise);
  return stars != null ? { kind: 'legacy', stars } : { kind: 'unrated' };
}

export function buildMatrix(units: readonly SummaryUnit[], discipline: string | null, today: Date): TrainingMatrix {
  const all = [...units].filter(u => u.status === 'completed' || u.source === 'session').sort(byDay); // alt → neu
  const disciplines: string[] = [];
  for (const u of [...all].reverse()) for (const e of u.exercises ?? []) if (!disciplines.includes(e.discipline)) disciplines.push(e.discipline);
  // Spalten nur aus Trainings mit Übungen der Ansicht; die Liste „Alle Trainings“
  // zeigt im Tab „Alle“ auch alte Einträge ohne Übungen (nichts verschwindet).
  const scoped = all.filter(u => (u.exercises ?? []).some(inScope(discipline)));
  const listed = discipline ? scoped : all;
  // „Allgemeines Training“ ohne bestimmte Übung: in „Alle Trainings“ sichtbar,
  // in der Matrix (Zeilen, Spalten, Trend, Rückfall-Hinweis) ausgeblendet.
  const inMatrix = (e: TrainingExercise) => inScope(discipline)(e) && !isGeneralExercise(e.exercise_name);
  const matrixUnits = scoped.filter(u => (u.exercises ?? []).some(inMatrix));

  // Vorgänger je Zeile über die gesamte geladene Historie (nicht nur sichtbare
  // Spalten) – nur über die stabile Identität, nie über den Namen (gleiche
  // Regel wie Etappe 2). Mehrfach in einem Training = mehrdeutig: kein Trend.
  const previousByUnit = new Map<string, Map<string, TrainingExercise>>();
  const lastSeen = new Map<string, TrainingExercise | null>();
  const last = new Map<string, { exercise: TrainingExercise; previous: TrainingExercise | undefined; date: string }>();
  for (const u of matrixUnits) {
    const prev = new Map<string, TrainingExercise>();
    const inUnit = (u.exercises ?? []).filter(inMatrix);
    const count = new Map<string, number>();
    for (const e of inUnit) count.set(rowKey(e), (count.get(rowKey(e)) ?? 0) + 1);
    for (const e of inUnit) {
      const k = rowKey(e);
      if (count.get(k)! > 1 || !e.exercise_identity_id) continue;
      const before = lastSeen.get(k);
      if (before) prev.set(k, before);
    }
    for (const [k, n] of count) {
      const e = inUnit.find(x => rowKey(x) === k)!;
      const ambiguous = n > 1 || !e.exercise_identity_id;
      last.set(k, { exercise: e, previous: ambiguous ? undefined : prev.get(k), date: u.session_date });
      lastSeen.set(k, ambiguous ? null : e);
    }
    previousByUnit.set(u.id, prev);
  }

  const visible = matrixUnits.slice(-MATRIX_COLUMNS);
  const rowsMap = new Map<string, MatrixRow & { last: string }>();
  for (const [ci, u] of visible.entries()) {
    for (const e of [...(u.exercises ?? [])].filter(inMatrix).sort((a, b) => a.seq_index - b.seq_index)) {
      const k = rowKey(e);
      const row = rowsMap.get(k) ?? { key: k, name: e.exercise_name, discipline: e.discipline, cells: visible.map(() => ({ kind: 'none' } as MatrixCell)), last: '' };
      if (row.cells[ci].kind === 'none') row.cells[ci] = cellOf(e, previousByUnit.get(u.id)?.get(k));
      row.name = e.exercise_name; row.last = u.session_date;
      rowsMap.set(k, row);
    }
  }
  const rows = [...rowsMap.values()].sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .map(({ last: _last, ...row }) => row);

  // Rückfall-Hinweis: letzte Bewertung war ein Rückschritt und die Übung ruht seit ≥ 7 Tagen.
  let fallback: TrainingMatrix['fallback'] = null;
  for (const { exercise, previous, date } of last.values()) {
    const cell = cellOf(exercise, previous);
    const days = daysSince(date, today);
    if (cell.kind === 'level' && cell.down && days != null && days >= FALLBACK_DAYS && (!fallback || days > fallback.days || (days === fallback.days && exercise.exercise_name.localeCompare(fallback.name) < 0))) {
      fallback = { name: exercise.exercise_name, days };
    }
  }

  return {
    disciplines,
    columns: visible.map(u => ({ unitId: u.id, source: u.source ?? 'unit', date: u.session_date })),
    rows,
    fallback,
    trainings: [...listed].reverse().map(u => ({
      id: u.id, source: u.source ?? 'unit', date: u.session_date,
      disciplines: Array.from(new Set((u.exercises ?? []).map(e => e.discipline))),
      names: (u.exercises ?? []).filter(inScope(discipline)).map(e => e.exercise_name),
      durationSec: u.duration_sec ?? null,
    })),
  };
}
