import type { TrainingExercise, TrainingUnit } from '@/types/trainingUnit';
import { planFromHistory } from './model';
import { readTrainingFocuses } from './focus';
import { listServerTrainingFocuses } from '@/services/trainingDocumentService';

export const templateEntryContext = (source: string, dog: string, discipline: string) => JSON.stringify(['template', source, dog, discipline]);

export interface TemplateHint { id: string; text: string; date: string }
export interface TemplateChoice {
  owner: string; dog: string; discipline: string; disciplineKey: string;
  exercises: string[]; focuses: string[];
}
export interface TemplateContext {
  sourceId: string; sourceDate: string; dogId: string; discipline: string;
  hints: TemplateHint[];
}

// Stable row identity, with an explicit legacy signature rather than name matching.
export function templateExerciseKey(exercise: TrainingExercise): string {
  return exercise.id ? `id:${exercise.id}` : JSON.stringify([exercise.seq_index, exercise.discipline, exercise.exercise_name]);
}

export async function readTemplateHints(owner: string, dog: string, discipline: string, disciplineKey: string, current: () => boolean = () => true): Promise<TemplateHint[]> {
  const local = await readTrainingFocuses(owner);
  if (!current()) throw new Error('Template scope changed');
  const hints: TemplateHint[] = local.filter(f => f.dogId === dog && f.discipline === discipline && f.status !== 'done')
    .map(f => ({ id: `local:${f.id}`, text: f.text, date: f.originDate }));
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await listServerTrainingFocuses(owner, dog, disciplineKey, after, current);
    if (!current() || result.error) throw new Error('Template focuses unavailable');
    hints.push(...result.data.filter(f => f.owner_id === owner && f.dog_id === dog && f.discipline_key === disciplineKey && f.status !== 'done')
      .map(f => ({ id: `server:${f.id}`, text: f.text, date: f.source_date_snapshot })));
    if (result.data.length < 100) return hints;
    const next = result.data[result.data.length - 1].id;
    if (next === after) throw new Error('Invalid focus page');
    after = next;
  }
  throw new Error('Incomplete template focuses');
}

export function planTemplate(unit: TrainingUnit, owner: string, choice: TemplateChoice, hints: TemplateHint[], uuid: () => string) {
  if (unit.owner_id !== owner || choice.owner !== owner || unit.dog_id !== choice.dog || unit.status !== 'completed'
      || !choice.discipline || !choice.disciplineKey || !Array.isArray(choice.exercises) || !Array.isArray(choice.focuses)
      || !choice.exercises.length || new Set(choice.exercises).size !== choice.exercises.length
      || new Set(choice.focuses).size !== choice.focuses.length) throw new Error('Invalid template scope');
  const exercises = choice.exercises.map(key => {
    const matches = unit.exercises?.filter(e => templateExerciseKey(e) === key && e.discipline === choice.discipline
      && (!e.discipline_key || e.discipline_key === choice.disciplineKey)) ?? [];
    if (matches.length !== 1) throw new Error('Template exercise unavailable');
    const exercise = matches[0];
    return { ...planFromHistory(unit, exercise, uuid()), exerciseKey: exercise.exercise_identity_id ?? uuid(),
      identityNew: !exercise.exercise_identity_id, disciplineKey: choice.disciplineKey };
  });
  const selectedHints = choice.focuses.map(id => {
    const matches = hints.filter(h => h.id === id);
    if (matches.length !== 1) throw new Error('Template focus unavailable');
    return { ...matches[0] };
  });
  return { exercises, context: { sourceId: unit.id, sourceDate: unit.session_date, dogId: unit.dog_id,
    discipline: choice.discipline, hints: selectedHints } satisfies TemplateContext };
}
