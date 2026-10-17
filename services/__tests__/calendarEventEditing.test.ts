import { updateOwnCalendarEvent } from '../calendarService';
import { event } from '@/features/calendar/__tests__/fixture';
const mockSession = jest.fn(), mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: (...args: unknown[]) => mockSession(...args) }, from: (...args: unknown[]) => mockFrom(...args) } }));

let query: Record<string, jest.Mock>;
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ data: { session: { user: { id: 'owner-a' } } }, error: null });
  query = {};
  for (const key of ['update', 'eq', 'is', 'filter', 'select']) query[key] = jest.fn(() => query);
  query.maybeSingle = jest.fn().mockResolvedValue({ data: { ...event, title: 'new' }, error: null });
  mockFrom.mockReturnValue(query);
});
it('updates in place with owner and original-data constraints, preserving all non-form fields', async () => {
  const result = await updateOwnCalendarEvent('owner-a', event, { title: 'new', status: 'cancelled', owner_id: 'owner-b' } as never);
  expect(result.error).toBeNull();
  expect(query.update).toHaveBeenCalledWith({ title: 'new' });
  expect(query.eq).toHaveBeenCalledWith('id', event.id);
  expect(query.eq).toHaveBeenCalledWith('owner_id', 'owner-a');
  expect(query.eq).toHaveBeenCalledWith('status', 'confirmed');
  expect(query.is).toHaveBeenCalledWith('trainer_id', null);
  expect(query.eq).toHaveBeenCalledWith('title', event.title);
  expect(query.filter).toHaveBeenCalledWith('dog_ids', 'eq', '{"dog-a","dog-b"}');
});
it('blocks account change and nonowner access before a write', async () => {
  mockSession.mockResolvedValue({ data: { session: { user: { id: 'owner-b' } } }, error: null });
  expect((await updateOwnCalendarEvent('owner-a', event, { title: 'new' })).error).toBeTruthy();
  expect((await updateOwnCalendarEvent('owner-b', event, { title: 'new' })).error).toBeTruthy();
  expect(mockFrom).not.toHaveBeenCalled();
});
it('does not recreate a changed/deleted event or emit widget success', async () => {
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await updateOwnCalendarEvent('owner-a', event, { notes: null })).error?.message).toBe('CALENDAR_CONFLICT');
  expect(query.update).toHaveBeenCalledTimes(1);
});
it('keeps server RLS failures as failure and does not notify success', async () => {
  query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
  expect((await updateOwnCalendarEvent('owner-a', event, { title: 'new' })).error).toBeTruthy();
});
it('does not write when the reopened form was unchanged', async () => {
  expect((await updateOwnCalendarEvent('owner-a', event, {})).data).toEqual(event);
  expect(mockFrom).not.toHaveBeenCalled();
});

it('does not bypass trainer negotiation even for the calendar owner', async () => {
  const result = await updateOwnCalendarEvent('owner-a', { ...event, trainer_id: 'trainer' }, { start_at: '2026-10-26T10:00:00Z' });
  expect(result.error).toBeTruthy(); expect(mockFrom).not.toHaveBeenCalled();
});

it('does not rewrite trainer-created events as the owner', async () => {
  const result = await updateOwnCalendarEvent('owner-a', { ...event, created_by: 'trainer' }, { title: 'new' });
  expect(result.error).toBeTruthy(); expect(mockFrom).not.toHaveBeenCalled();
});
