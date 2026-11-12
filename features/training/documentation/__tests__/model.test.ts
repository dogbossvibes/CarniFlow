import { filterFeed, disciplinesOf, summarize } from '@/features/training/journal';
import { relevantUnits, planFromHistory, lastExerciseHistory, performedExercises, localDay, measuredMinutes } from '../model';
import { isConfirmedDocumentedRetry } from '../retry';
import type { TrainingUnit } from '@/types/trainingUnit';

const exercise = { id: 'row-a', exercise_identity_id: 'identity-a', discipline: 'Obedience', exercise_name: 'Sit', rating: 5,
  notes: 'Yesterday only', duration_sec: 90, seq_index: 0 };
const unit = (patch: Partial<TrainingUnit> = {}): TrainingUnit => ({
  id: 'unit-a', owner_id: 'owner-a', dog_id: 'dog-a', status: 'completed', session_date: '2026-10-14',
  created_at: '2026-10-14T12:00:00Z', exercises: [exercise], notes: 'Past observation',
  photos: ['private-photo'], videos: [], shared_with_trainer: true, ...patch,
} as TrainingUnit);

test('history is scoped to owner AND dog AND discipline AND completed status', () => {
  const valid = unit();
  expect(relevantUnits([valid, unit({ owner_id: 'other' }), unit({ dog_id: 'other' }), unit({ status: 'active' }),
    unit({ exercises: [{ ...exercise, discipline: 'other' }] })], 'owner-a', 'dog-a', 'Obedience')).toEqual([valid]);
});
test('history ordering follows session date before creation date', () => {
  expect(relevantUnits([unit(), unit({ id: 'new', session_date: '2026-10-15' })], 'owner-a', 'dog-a', 'Obedience')[0].id).toBe('new');
});
// T-184: vorgewählte Übungen gelten als heute trainiert (Spec-Entscheid 2).
// Notizen, Medien und Dauer werden weiterhin nie kopiert; eine alte
// Sternebewertung (ohne rating_scale) wird nie als Lernstufe vorbelegt.
test('explicit reuse marks as trained but copies no notes, media, repetitions or legacy stars', () => {
  const planned = planFromHistory(unit(), exercise, 'new-key');
  expect(planned).toMatchObject({ performed: true, rating: null, ratingScale: null, notes: null, sourceUnitId: 'unit-a', sourceExerciseId: 'row-a' });
  expect(planned).not.toHaveProperty('photos');
  expect(planned).not.toHaveProperty('durationSec');
  expect(performedExercises([planned])).toEqual([expect.objectContaining({ rating: null, notes: null, duration_sec: null })]);
  expect(performedExercises([planned])[0]).toHaveProperty('rating_scale', null);
});
test('reuse pre-fills only an explicitly marked learning level', () => {
  const learned = { ...exercise, rating: 2, rating_scale: 'lernstufe' as const };
  expect(planFromHistory(unit(), learned, 'k')).toMatchObject({ rating: 2, ratingScale: 'lernstufe', performed: true });
  // 2 ohne Markierung ist eine alte Sternebewertung → keine Vorbelegung.
  expect(planFromHistory(unit(), { ...exercise, rating: 2 }, 'k')).toMatchObject({ rating: null, ratingScale: null });
  expect(performedExercises([planFromHistory(unit(), learned, 'k')])[0]).toMatchObject({ rating: 2, rating_scale: 'lernstufe' });
});
test('rating_scale wird immer ausdrücklich gesendet: Sterne und gelöschte Stufe → null (T-184)', () => {
  const planned = planFromHistory(unit(), exercise, 'k');
  expect(performedExercises([{ ...planned, rating: 3, ratingScale: null }])[0]).toMatchObject({ rating: 3, rating_scale: null });
  expect(performedExercises([{ ...planned, rating: null, ratingScale: 'lernstufe' }])[0]).toMatchObject({ rating: null, rating_scale: null });
  expect(performedExercises([{ ...planned, rating: 4, ratingScale: 'lernstufe' }])[0]).toMatchObject({ rating: 4, rating_scale: 'lernstufe' });
});
test('planned/not-trained exercises never enter performance rows', () => {
  const planned = planFromHistory(unit(), exercise, 'new-key');
  expect(performedExercises([{ ...planned, performed: false, rating: 5, notes: 'old' }])).toEqual([]);
  expect(performedExercises([{ ...planned, performed: true, rating: 3 }])).toEqual([
    expect.objectContaining({ rating: 3, duration_sec: null, seq_index: 0 }),
  ]);
});
test('a stable identity finds the exercise beyond the immediately previous training, including renamed labels', () => {
  const selected = { ...planFromHistory(unit(), exercise, 'new-key'), name: 'New display name' };
  const older = unit({ id: 'older', session_date: '2026-10-13' });
  const latestWithout = unit({ id: 'latest', exercises: [{ ...exercise, exercise_identity_id: 'different' }] });
  expect(lastExerciseHistory([latestWithout, older], selected).map(x => x.unit.id)).toEqual(['older']);
});
test('duplicate display names do not link legacy or unrelated identities', () => {
  const selected = { ...planFromHistory(unit(), { ...exercise, exercise_identity_id: null }, 'key'), sourceExerciseId: undefined };
  expect(lastExerciseHistory([unit()], selected)).toEqual([]);
});
test('legacy reuse reads only the explicitly selected row; renaming retains that pointer', () => {
  const legacy = { ...exercise, exercise_identity_id: null };
  const selected = { ...planFromHistory(unit(), legacy, 'key'), name: 'Renamed' };
  expect(lastExerciseHistory([unit({ exercises: [legacy] }), unit({ id: 'other-unit', exercises: [legacy] })], selected)).toHaveLength(1);
  expect(lastExerciseHistory([unit({ exercises: [legacy, legacy] })], selected)).toEqual([]);
});
test('duration comes only from valid measured input, and dates use the local calendar', () => {
  for (const input of [undefined, '', 'NaN', 'Infinity', '-4', '0']) expect(measuredMinutes(input)).toBeNull();
  expect(measuredMinutes('120')).toBe(2);
  expect(localDay(new Date(2026, 9, 15, 0, 15))).toBe('2026-10-15');
});
test('lost acknowledgement reconciliation accepts only the exact completed aggregate', () => {
  const payload = { dog_id: 'dog-a', notes: 'Past observation', photos: ['private-photo'] };
  expect(isConfirmedDocumentedRetry(unit(), 'owner-a', payload, [exercise])).toBe(true);
  // T-184: ausdrückliches rating_scale null passt zur Zeile ohne Markierung; Lernstufe nicht.
  expect(isConfirmedDocumentedRetry(unit(), 'owner-a', payload, [{ ...exercise, rating_scale: null }])).toBe(true);
  expect(isConfirmedDocumentedRetry(unit(), 'owner-a', payload, [{ ...exercise, rating_scale: 'lernstufe' }])).toBe(false);
  expect(isConfirmedDocumentedRetry(unit({ exercises: [] }), 'owner-a', payload, [exercise])).toBe(false);
  expect(isConfirmedDocumentedRetry(unit(), 'other', payload, [exercise])).toBe(false);
  expect(isConfirmedDocumentedRetry(unit(), 'owner-a', { ...payload, notes: 'changed' }, [exercise])).toBe(false);
  expect(isConfirmedDocumentedRetry(unit({ exercises: [exercise, exercise] }), 'owner-a', payload, [exercise])).toBe(false);
});


test('the Journal finds secondary disciplines and notes without changing track routing', () => {
  const multi = { ...unit({ exercises: [exercise, { ...exercise, id: 'second', discipline: 'Unterordnung', exercise_name: 'Heel', notes: 'Quiet start', seq_index: 1 }] }), source: 'unit' as const };
  expect(filterFeed([multi], { discipline: 'Unterordnung' })).toEqual([multi]);
  expect(filterFeed([multi], { query: 'quiet start' })).toEqual([multi]);
  expect(disciplinesOf([multi])).toEqual(['Obedience', 'Unterordnung']);
  expect(summarize([multi], 2026).disciplineCount).toBe(2);
});
