// Trainingsdoku neu, Etappe 2 (T-184): „Weitermachen“ – reine, lesende
// Zusammenfassung des letzten Trainings eines Hundes. Keine Schreibpfade.
//
// Eingaben sind bereits geladene Trainings (neue training_units und alte
// training_sessions als FeedItem, ohne Fährten) und Server-Hinweise.
import type { TrainingExercise, TrainingUnit } from '@/types/trainingUnit';
import type { ServerFocus } from '@/services/trainingDocumentService';
import { legacyStars, levelOf, trendOf, type LearningLevel, type Trend } from '@/features/training/documentation/learningLevel';
import { localDay } from '@/features/training/documentation/model';

export type SummaryUnit = TrainingUnit & { source?: 'unit' | 'session' };

export interface ExerciseSummary {
  name: string;
  discipline: string;
  level: LearningLevel | null;
  legacyStars: number | null;
  trend: Trend | null;
}

export interface TrainingSummary {
  last: {
    id: string;
    source: 'unit' | 'session';
    date: string;
    daysAgo: number | null;
    disciplines: string[];
    exercises: ExerciseSummary[];
  } | null;
  previous: { id: string; source: 'unit' | 'session'; date: string; disciplines: string[]; exerciseCount: number }[];
  openHint: { id: string; text: string; date: string } | null;
}

const dayNumber = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** Ganze Kalendertage zwischen Trainingstag und heute (lokal), nie negativ. */
export function daysSince(sessionDate: string, today: Date): number | null {
  const then = dayNumber(sessionDate);
  return Number.isFinite(then) ? Math.max(0, dayNumber(localDay(today)) - then) : null;
}

// Nach Kalendertag (alte Sessions können einen Zeitanteil haben), dann Erstellzeit.
const newestFirst = (a: SummaryUnit, b: SummaryUnit) =>
  b.session_date.slice(0, 10).localeCompare(a.session_date.slice(0, 10)) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

const disciplinesOf = (unit: SummaryUnit) => Array.from(new Set((unit.exercises ?? []).map(e => e.discipline)));

// Vorgänger nur über die stabile Übungsidentität – nie über den Namen raten
// (gleiche Regel wie im Erfassen-Screen).
function previousOf(exercise: TrainingExercise, older: SummaryUnit[]): TrainingExercise | null {
  if (!exercise.exercise_identity_id) return null;
  for (const unit of older) {
    const match = (unit.exercises ?? []).filter(e => e.exercise_identity_id === exercise.exercise_identity_id);
    if (match.length === 1) return match[0];
    if (match.length > 1) return null; // mehrdeutig: nicht auf noch ältere Trainings ausweichen
  }
  return null;
}

export function summarizeTraining(units: readonly SummaryUnit[], focuses: readonly ServerFocus[], today: Date): TrainingSummary {
  const sorted = [...units].filter(u => u.status === 'completed' || u.source === 'session').sort(newestFirst);
  const [lastUnit, ...older] = sorted;
  const open = focuses.filter(f => f.status === 'open' || f.status === 'practice')
    .sort((a, b) => b.source_date_snapshot.localeCompare(a.source_date_snapshot) || b.revision - a.revision || b.id.localeCompare(a.id))[0];
  return {
    last: lastUnit ? {
      id: lastUnit.id,
      source: lastUnit.source ?? 'unit',
      date: lastUnit.session_date,
      daysAgo: daysSince(lastUnit.session_date, today),
      disciplines: disciplinesOf(lastUnit),
      exercises: (lastUnit.exercises ?? []).slice().sort((a, b) => a.seq_index - b.seq_index).map(e => ({
        name: e.exercise_name,
        discipline: e.discipline,
        level: levelOf(e),
        legacyStars: legacyStars(e),
        trend: trendOf(e, previousOf(e, older)),
      })),
    } : null,
    previous: older.slice(0, 3).map(u => ({
      id: u.id, source: u.source ?? 'unit', date: u.session_date, disciplines: disciplinesOf(u), exerciseCount: u.exercises?.length ?? 0,
    })),
    openHint: open ? { id: open.id, text: open.text, date: open.source_date_snapshot } : null,
  };
}
