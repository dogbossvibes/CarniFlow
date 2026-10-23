import { loadTrainingContext, prepareTrainingHistoryDraft } from '../trainingContext';
import { loadTrainingPreparation, type PreparationUnit } from '../trainingPreparation';
import { templateExerciseKey, type TemplateChoice } from '@/features/training/documentation/template';

jest.mock('../trainingPreparation', () => ({ loadTrainingPreparation: jest.fn() }));
jest.mock('@/features/training/documentation/focus', () => ({ readTrainingFocuses: jest.fn() }));
jest.mock('../trainingDocumentService', () => ({ listServerTrainingFocuses: jest.fn() }));
const load = jest.mocked(loadTrainingPreparation);
const exercise = { id: 'row', exercise_identity_id: 'identity', discipline: 'Unterordnung', discipline_key: 'system:uo',
  exercise_name: 'Fuss', rating: 5, notes: 'Yesterday', duration_sec: 120, seq_index: 0 };
const unit = { id: 'source', originalId: 'source', historySource: 'unit', owner_id: 'owner', dog_id: 'dog',
  status: 'completed', session_date: '2026-10-22', exercises: [exercise], notes: 'Historical', photos: ['private-photo'],
  audio_files: [{ url: 'private-audio' }], score: 10 } as unknown as PreparationUnit;
const scope = { ownerId: 'owner', dogId: 'dog', discipline: 'Unterordnung' };
const choice = (): TemplateChoice => ({ owner: 'owner', dog: 'dog', discipline: 'Unterordnung', disciplineKey: 'system:uo',
  exercises: [templateExerciseKey(exercise)], focuses: [] });
const current = () => true;
const uuid = () => 'new-id';
beforeEach(() => { load.mockReset().mockResolvedValue({ units: [unit], limited: false }); });

it('preserves separate original provenance and observation date, including colliding legacy IDs', async () => {
  load.mockResolvedValue({ units: [unit, { ...unit, id: 'legacy-session:source', historySource: 'session' }], limited: true });
  const started = Date.now();
  const result = await loadTrainingContext(scope, current);
  expect(load).toHaveBeenCalledWith('owner', 'dog', 'Unterordnung');
  expect(result.context).toEqual({ scope, loadedAt: expect.any(String), limited: true, sources: [
    { kind: 'unit', originalId: 'source', viewId: 'source', sourceDate: '2026-10-22' },
    { kind: 'session', originalId: 'source', viewId: 'legacy-session:source', sourceDate: '2026-10-22' },
  ] });
  expect(Date.parse(result.context.loadedAt)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(result.context.loadedAt)).toBeLessThanOrEqual(Date.now());
  expect(JSON.stringify(result.context)).not.toMatch(/private-photo|private-audio|Historical|Yesterday/);
});
it('captures caller scope before awaiting, never relabelling the response for another dog', async () => {
  let resolve!: (value: { units: PreparationUnit[]; limited: boolean }) => void;
  load.mockReturnValue(new Promise(r => { resolve = r; }));
  const mutable = { ...scope }; const pending = loadTrainingContext(mutable, current);
  mutable.dogId = 'another'; resolve({ units: [unit], limited: false });
  expect((await pending).context.scope.dogId).toBe('dog');
});
it('fails before querying for unavailable scope or an already cancelled generation', async () => {
  await expect(loadTrainingContext({ ...scope, ownerId: '' }, current)).rejects.toThrow();
  await expect(loadTrainingContext(scope, () => false)).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
});
it('rejects responses after account, dog, route or resume invalidation', async () => {
  let active = true;
  load.mockImplementation(async () => { active = false; return { units: [unit], limited: false }; });
  await expect(prepareTrainingHistoryDraft('source', choice(), uuid, () => active)).rejects.toThrow('changed');
});
it('propagates network failures rather than manufacturing empty history or an offline claim', async () => {
  const failure = new Error('Fetch failed'); load.mockRejectedValue(failure);
  await expect(loadTrainingContext(scope, current)).rejects.toBe(failure);
});
it('revalidates source, builds a new unperformed plan and never copies historical facts', async () => {
  const before = JSON.stringify(unit);
  const plan = await prepareTrainingHistoryDraft('source', choice(), uuid, current);
  expect(plan.exercises).toEqual([{ key: 'new-id', discipline: 'Unterordnung', name: 'Fuss', rating: null, notes: null,
    performed: false, sourceUnitId: 'source', sourceExerciseId: 'row', exerciseKey: 'identity', identityNew: false, disciplineKey: 'system:uo' }]);
  expect(plan.source).toEqual({ kind: 'unit', originalId: 'source', viewId: 'source', sourceDate: '2026-10-22' });
  expect(plan.context.hints).toEqual([]);
  expect(JSON.stringify(plan)).not.toMatch(/private-photo|private-audio|Historical|Yesterday/);
  expect(JSON.stringify(unit)).toBe(before);
});
it('captures selected IDs before a slow reload', async () => {
  let resolve!: (value: { units: PreparationUnit[]; limited: boolean }) => void;
  load.mockReturnValue(new Promise(r => { resolve = r; }));
  const selected = choice(); const pending = prepareTrainingHistoryDraft('source', selected, uuid, current);
  selected.owner = 'other'; selected.exercises[0] = 'another-row';
  resolve({ units: [unit], limited: false });
  expect((await pending).exercises[0].sourceExerciseId).toBe('row');
});
it.each([{ units: [] }, { units: [unit, unit] }])('rejects deleted, missing or ambiguous sources even with incomplete history', async ({ units }) => {
  load.mockResolvedValue({ units, limited: true });
  await expect(prepareTrainingHistoryDraft('source', choice(), uuid, current)).rejects.toThrow('source unavailable');
});
it.each([{ owner_id: 'other' }, { dog_id: 'other' }, { status: 'active' }, { exercises: [] },
  { exercises: [{ ...exercise, discipline: 'Other' }] }, { exercises: [{ ...exercise, discipline_key: 'system:other' }] }])(
  'retains planner validation for stale or foreign source %j', async patch => {
    load.mockResolvedValue({ units: [{ ...unit, ...patch } as PreparationUnit], limited: false });
    await expect(prepareTrainingHistoryDraft('source', choice(), uuid, current)).rejects.toThrow();
  });
it('keeps focus selection in the existing template path', async () => {
  await expect(prepareTrainingHistoryDraft('source', { ...choice(), focuses: ['focus'] }, uuid, current)).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
});
it('keeps colliding legacy and unit sources distinct when drafting', async () => {
  load.mockResolvedValue({ units: [unit, { ...unit, id: 'legacy-session:source', historySource: 'session' }], limited: false });
  const plan = await prepareTrainingHistoryDraft('legacy-session:source', choice(), uuid, current);
  expect(plan.source.kind).toBe('session'); expect(plan.exercises[0].sourceUnitId).toBe('legacy-session:source');
});
