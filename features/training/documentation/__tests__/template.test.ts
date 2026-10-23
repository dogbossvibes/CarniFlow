import { planTemplate, readTemplateHints, templateExerciseKey, type TemplateChoice } from '../template';
import type { TrainingUnit } from '@/types/trainingUnit';
import { historyDate } from '../historyDate';
const mockLocal = jest.fn();
const mockRemote = jest.fn();
jest.mock('../focus', () => ({ readTrainingFocuses: (...args: unknown[]) => mockLocal(...args) }));
jest.mock('@/services/trainingDocumentService', () => ({ listServerTrainingFocuses: (...args: unknown[]) => mockRemote(...args) }));
const ex = { id: 'old-row', exercise_identity_id: 'stable', discipline: 'Fährte', discipline_key: 'system:faehrte', exercise_name: 'Suche', rating: 5, notes: 'Old result', duration_sec: 55, seq_index: 0 };
const unit = { id: 'old', owner_id: 'owner', dog_id: 'dog', status: 'completed', session_date: '2026-10-14', exercises: [ex], notes: 'Old note', score: 9, photos: ['private'], started_at: 'yesterday' } as unknown as TrainingUnit;
const choice: TemplateChoice = { owner: 'owner', dog: 'dog', discipline: 'Fährte', disciplineKey: 'system:faehrte', exercises: [templateExerciseKey(ex)], focuses: ['local:focus'] };
const hints = [{ id: 'local:focus', text: 'Langsam starten', date: '2026-10-14' }];
const uuid = () => 'new-row';
beforeEach(() => { mockLocal.mockReset().mockResolvedValue([]); mockRemote.mockReset().mockResolvedValue({ data: [], error: null }); });
test('whitelists a plan and read-only hints, keeping all historical results unchanged', () => {
  const before = JSON.stringify(unit);
  const seed = planTemplate(unit, 'owner', choice, hints, uuid);
  expect(seed.exercises).toEqual([{ key: 'new-row', discipline: 'Fährte', name: 'Suche', rating: null, notes: null, performed: false, sourceUnitId: 'old', sourceExerciseId: 'old-row', exerciseKey: 'stable', disciplineKey: 'system:faehrte', identityNew: false }]);
  expect(seed.context.hints).toEqual(hints); expect(seed.context.hints[0]).not.toBe(hints[0]);
  expect(seed).not.toHaveProperty('score'); expect(seed).not.toHaveProperty('photos'); expect(seed.exercises[0]).not.toHaveProperty('durationSec');
  expect(JSON.stringify(unit)).toBe(before);
});
test.each([{ owner: 'other' }, { dog: 'other' }, { discipline: 'Other' }, { disciplineKey: 'system:other' }, { exercises: [] }, { exercises: ['id:unknown'] }, { exercises: ['id:old-row', 'id:old-row'] }, { focuses: ['removed'] }])('rejects mismatching or stale selection %j', patch => {
  expect(() => planTemplate(unit, 'owner', { ...choice, ...patch }, hints, uuid)).toThrow();
});
test('rejects foreign, active and ambiguous sources', () => {
  for (const patch of [{ owner_id: 'other' }, { dog_id: 'other' }, { status: 'active' as const }, { exercises: [ex, ex] }]) {
    expect(() => planTemplate({ ...unit, ...patch }, 'owner', choice, hints, uuid)).toThrow();
  }
});
test('keeps distinct stable identities despite identical names and gives legacy exercises a new identity', () => {
  const old = { ...ex, id: undefined, exercise_identity_id: null };
  const seed = planTemplate({ ...unit, exercises: [old] }, 'owner', { ...choice, exercises: [templateExerciseKey(old)], focuses: [] }, [], uuid);
  expect(seed.exercises[0]).toMatchObject({ identityNew: true, exerciseKey: 'new-row', performed: false });
  expect(templateExerciseKey({ ...ex, id: 'another' })).not.toBe(templateExerciseKey(ex));
});
test('reads only open local and server hints within owner/dog/discipline, without writes', async () => {
  mockLocal.mockResolvedValue([{ id: 'l', dogId: 'dog', discipline: 'Fährte', status: 'practice', text: 'local', originDate: '2026-10-14' }, { id: 'wrong', dogId: 'other', discipline: 'Fährte', status: 'open' }]);
  mockRemote.mockResolvedValue({ data: [{ id: 's', owner_id: 'owner', dog_id: 'dog', discipline_key: 'system:faehrte', status: 'open', text: 'server', source_date_snapshot: '2026-10-15' }, { id: 'done', status: 'done' }], error: null });
  expect(await readTemplateHints('owner', 'dog', 'Fährte', 'system:faehrte')).toEqual([{ id: 'local:l', text: 'local', date: '2026-10-14' }, { id: 'server:s', text: 'server', date: '2026-10-15' }]);
});
test('errors and stale account generations never become empty successful selections', async () => {
  mockRemote.mockResolvedValue({ data: null, error: { code: 'OFFLINE' } });
  await expect(readTemplateHints('owner', 'dog', 'Fährte', 'system:faehrte')).rejects.toThrow();
  await expect(readTemplateHints('owner', 'dog', 'Fährte', 'system:faehrte', () => false)).rejects.toThrow();
});
test('history dates use local calendar dates and the requested language', () => {
  expect(historyDate('2026-10-14', 'de')).toBe('14.10.2026');
  expect(historyDate('2026-10-14', 'en')).toBe('14/10/2026');
});

jest.mock('@/i18n', () => ({ getLocale: () => 'de' }));
