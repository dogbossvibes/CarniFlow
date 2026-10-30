import { updateOwnCalendarEvent, finishOwnCalendarEvent, deleteOwnCalendarEvent } from '../calendarService';
import { event } from '@/features/calendar/__tests__/fixture';
const mockSession = jest.fn(), mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: (...args: unknown[]) => mockSession(...args) }, from: (...args: unknown[]) => mockFrom(...args) } }));

let query: Record<string, jest.Mock>;
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ data: { session: { user: { id: 'owner-a' } } }, error: null });
  query = {};
  for (const key of ['delete', 'update', 'eq', 'is', 'filter', 'select']) query[key] = jest.fn(() => query);
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

it.each(['completed','cancelled'] as const)('finishes in place as %s without changing historical dates or other fields', async status => {
 query.maybeSingle.mockResolvedValue({ data: { ...event, status }, error: null });
 const result = await finishOwnCalendarEvent('owner-a', event, status);
 expect(result.data?.status).toBe(status); expect(query.update).toHaveBeenCalledWith({status});
 expect(query.eq).toHaveBeenCalledWith('status',event.status); expect(query.eq).toHaveBeenCalledWith('start_at',event.start_at);
 expect(query.eq).toHaveBeenCalledWith('owner_id','owner-a');
});
it.each([{...event,owner_id:'other'}, {...event,trainer_id:'trainer'}, {...event,source_type:'health_vaccination',source_id:'vaccination'}])('cannot mark noneditable or source-managed records completed', async original => {
 expect((await finishOwnCalendarEvent('owner-a',original as typeof event,'completed')).error).toBeTruthy(); expect(mockFrom).not.toHaveBeenCalled();
});
it('keeps conflict, offline and changed-account status writes as failures', async () => {
 query.maybeSingle.mockResolvedValue({data:null,error:null});
 expect((await finishOwnCalendarEvent('owner-a',event,'completed')).error?.message).toBe('CALENDAR_CONFLICT');

 mockSession.mockResolvedValue({data:{session:{user:{id:'other'}}},error:null});mockFrom.mockClear();
 expect((await finishOwnCalendarEvent('owner-a',event,'completed')).error).toBeTruthy();expect(mockFrom).not.toHaveBeenCalled();
});


describe('owner appointment deletion', () => {
  it.each([event, {...event,trainer_id:'trainer',created_by:'trainer'}])('allows the owner to delete an ordinary or trainer-created appointment with snapshot constraints', async original => {
    query.maybeSingle.mockResolvedValue({data:{id:event.id},error:null});
    const result = await deleteOwnCalendarEvent('owner-a',original);
    expect(result.data?.id).toBe(event.id);
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith('owner_id','owner-a');
    expect(query.eq).toHaveBeenCalledWith('status',original.status);
    expect(query.eq).toHaveBeenCalledWith('created_by',original.created_by);
    expect(query.is).toHaveBeenCalledWith('source_type',null);
    expect(query.is).toHaveBeenCalledWith('source_id',null);
    expect(query.select).toHaveBeenCalledWith('id');
    expect(query.update).not.toHaveBeenCalled();
  });
  it.each([{...event,owner_id:'other'}, {...event,source_id:'source'}, {...event,source_type:'health_vaccination'}])('does not delete foreign or source-managed appointments', async original => {
    expect((await deleteOwnCalendarEvent('owner-a',original as typeof event)).error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it('blocks an account change before any delete', async () => {
    mockSession.mockResolvedValue({data:{session:{user:{id:'other'}}},error:null});
    expect((await deleteOwnCalendarEvent('owner-a',event)).error).toBeTruthy();
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it.each([{data:null,error:null},{data:null,error:{message:'permission denied'}}])('does not report a zero-row or denied deletion as success', async response => {
    query.maybeSingle.mockResolvedValue(response);
    const result = await deleteOwnCalendarEvent('owner-a',event);
    expect(result.data).toBeNull(); expect(result.error).toBeTruthy();
  });
});
