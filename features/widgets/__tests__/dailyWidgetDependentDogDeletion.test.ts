import { deleteDogWithDependents } from '@/services/dogs';
import { subscribeDailyWidgetDataChanged } from '../dailyWidgetRefresh';

type DeleteResult = { error: { message: string } | null };
type DeleteBuilder = { delete: jest.Mock; eq: jest.Mock; then: Promise<DeleteResult>['then'] };
const mockFailures = new Map<string, { message: string }>();
const mockRejections = new Map<string, Error>();
const mockBuilders: DeleteBuilder[] = [];
const mockFrom = jest.fn((table: string) => {
  const builder: DeleteBuilder = {
    delete: jest.fn(), eq: jest.fn(),
    then: (resolve, reject) => {
      const result: Promise<DeleteResult> = mockRejections.has(table)
        ? Promise.reject(mockRejections.get(table))
        : Promise.resolve({ error: mockFailures.get(table) ?? null });
      return result.then(resolve, reject);
    },
  };
  builder.delete.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  mockBuilders.push(builder); return builder;
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

const dogId = 'synthetic-own-widget-test-dog';
let listener: jest.Mock;
let unsubscribe: () => void;
beforeEach(() => {
  mockFailures.clear(); mockRejections.clear(); mockBuilders.length = 0; mockFrom.mockClear();
  listener = jest.fn(); unsubscribe = subscribeDailyWidgetDataChanged(listener);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { unsubscribe(); jest.restoreAllMocks(); });

it('the actual editor deletion invalidates once and preserves deletion order, filters and result', async () => {
  await expect(deleteDogWithDependents(dogId)).resolves.toEqual({ error: null });
  expect(mockFrom.mock.calls.map(([table]) => table)).toEqual([
    'training_recommendations', 'training_embeddings', 'ai_insights', 'training_analysis',
    'calendar_events', 'shared_trainings', 'training_units', 'training_sessions', 'dogs',
  ]);
  mockBuilders.forEach((builder, index) => {
    expect(builder.delete).toHaveBeenCalledWith();
    expect(builder.eq).toHaveBeenCalledWith(index === 8 ? 'id' : 'dog_id', dogId);
  });
  expect(listener).toHaveBeenCalledTimes(1);
});
it('dependency errors remain best effort when the dog deletion succeeds', async () => {
  mockFailures.set('calendar_events', { message: 'dependency denied' });
  await expect(deleteDogWithDependents(dogId)).resolves.toEqual({ error: null });
  expect(console.warn).toHaveBeenCalledWith('[deleteDog] calendar_events:', 'dependency denied');
  expect(listener).toHaveBeenCalledTimes(1);
});
it('failed dog and calendar deletions preserve the original error without notifying', async () => {
  mockFailures.set('calendar_events', { message: 'calendar denied' });
  mockFailures.set('dogs', { message: 'dog denied' });
  await expect(deleteDogWithDependents(dogId)).resolves.toEqual({ error: new Error('dog denied') });
  expect(listener).not.toHaveBeenCalled();
});
it('successful calendar removal invalidates even if the final dog deletion fails', async () => {
  mockFailures.set('dogs', { message: 'dog denied' });
  await expect(deleteDogWithDependents(dogId)).resolves.toEqual({ error: new Error('dog denied') });
  expect(listener).toHaveBeenCalledTimes(1);
});
it('a later rejected request still invalidates already removed calendar data and preserves rejection', async () => {
  const failure = new Error('network interruption'); mockRejections.set('shared_trainings', failure);
  await expect(deleteDogWithDependents(dogId)).rejects.toBe(failure);
  expect(mockFrom).not.toHaveBeenCalledWith('dogs');
  expect(listener).toHaveBeenCalledTimes(1);
});
it('widget subscriber failure never changes the successful editor deletion result', async () => {
  const stop = subscribeDailyWidgetDataChanged(() => { throw new Error('widget failure'); });
  try { await expect(deleteDogWithDependents(dogId)).resolves.toEqual({ error: null }); }
  finally { stop(); }
  expect(listener).toHaveBeenCalledTimes(1);
});
