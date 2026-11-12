/* eslint-disable import/first */
const mockFrom = jest.fn();
const mockGetUser = jest.fn();
const mockCreateEvent = jest.fn();
const mockUpdateEvent = jest.fn();
const mockDeleteEvent = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), auth: { getUser: () => mockGetUser() } } }));
jest.mock('@/services/calendarService', () => ({ createOwnEvent: (...args: unknown[]) => mockCreateEvent(...args), updateCalendarEvent: (...args: unknown[]) => mockUpdateEvent(...args), deleteCalendarEvent: (...args: unknown[]) => mockDeleteEvent(...args) }));
jest.mock('@/services/connectionService', () => ({ listConnections: jest.fn() }));
import { createMedication, retryHealthReminder, updateVetVisit } from '../healthService';
const row = { id: 'm', dog_id: 'd', owner_id: 'o', name: 'Medication', starts_on: '2099-01-01', is_active: true };
function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), insert: jest.fn(), update: jest.fn(), maybeSingle: jest.fn().mockResolvedValue(result), single: jest.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.insert.mockReturnValue(chain); chain.update.mockReturnValue(chain);
  return chain;
}
beforeEach(() => { jest.resetAllMocks(); mockGetUser.mockResolvedValue({ data: { user: { id: 'o' } } }); mockCreateEvent.mockResolvedValue({ error: null }); mockUpdateEvent.mockResolvedValue({ error: null }); mockDeleteEvent.mockResolvedValue({ error: null }); });
describe('safe health calendar retry', () => {
  it('preserves successful primary save when calendar sync throws', async () => {
    mockFrom.mockImplementation((table: string) => { if (table === 'calendar_events') throw new Error('offline'); return query({ data: row, error: null }); });
    const result = await createMedication('d', { name: 'Medication', starts_on: '2099-01-01', is_active: true, ends_on: null, note: null, dosage: null, frequency: null, dose_amount: null, dose_unit: null, administration_route: null, prescribing_vet: null });
    expect(result).toEqual({ data: row, error: null, reminderSync: 'failed' });
  });
  it('rereads the owned row and updates an existing event without inserting a health duplicate', async () => {
    const health = query({ data: row, error: null });
    mockFrom.mockImplementation((table: string) => table === 'calendar_events' ? query({ data: { id: 'event' }, error: null }) : health);
    expect(await retryHealthReminder({ kind: 'medication', dogId: 'd', id: 'm' })).toBe('synced');
    expect(health.eq.mock.calls).toEqual([['id', 'm'], ['dog_id', 'd'], ['owner_id', 'o']]);
    expect(health.insert).not.toHaveBeenCalled(); expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(mockUpdateEvent).toHaveBeenCalledWith('event', expect.objectContaining({ source_id: 'm', dog_id: 'd', start_at: '2099-01-01T00:00:00.000Z' }));
  });
  it('removes obsolete calendar reminders for inactive medication', async () => {
    mockFrom.mockImplementation((table: string) => query({ data: table === 'calendar_events' ? { id: 'event' } : { ...row, is_active: false }, error: null }));
    expect(await retryHealthReminder({ kind: 'medication', dogId: 'd', id: 'm' })).toBe('not_required');
    expect(mockDeleteEvent).toHaveBeenCalledWith('event'); expect(mockCreateEvent).not.toHaveBeenCalled();
  });
  it('fails closed for deleted/inaccessible rows or a missing authenticated user', async () => {
    mockFrom.mockReturnValue(query({ data: null, error: null }));
    expect(await retryHealthReminder({ kind: 'medication', dogId: 'd', id: 'm' })).toBe('failed');
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await retryHealthReminder({ kind: 'vaccination', dogId: 'd', id: 'v' })).toBe('failed');
    expect(mockCreateEvent).not.toHaveBeenCalled(); expect(mockUpdateEvent).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled'])('cleans up a future vet reminder after the saved visit becomes %s', async status => {
    const health = query({ data: { id: 'v', status, appointment_at: '2099-01-01', reason: 'Checkup' }, error: null });
    mockFrom.mockImplementation((table: string) => table === 'calendar_events' ? query({ data: { id: 'event' }, error: null }) : health);
    expect(await retryHealthReminder({ kind: 'vet', dogId: 'd', id: 'v' })).toBe('not_required');
    expect(mockDeleteEvent).toHaveBeenCalledWith('event');
    expect(mockCreateEvent).not.toHaveBeenCalled(); expect(mockUpdateEvent).not.toHaveBeenCalled();
    expect(health.insert).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled'])('does not create a missing calendar event for a %s visit', async status => {
    mockFrom.mockImplementation((table: string) => query({ data: table === 'calendar_events' ? null : { id: 'v', status, appointment_at: '2099-01-01' }, error: null }));
    expect(await retryHealthReminder({ kind: 'vet', dogId: 'd', id: 'v' })).toBe('not_required');
    expect(mockCreateEvent).not.toHaveBeenCalled(); expect(mockUpdateEvent).not.toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled'])('also cleans up the reminder during a normal %s visit update', async status => {
    const saved = { ...row, id: 'v', status, appointment_at: '2099-01-01' };
    mockFrom.mockImplementation((table: string) => query({ data: table === 'calendar_events' ? { id: 'event' } : saved, error: null }));
    expect(await updateVetVisit('v', { status })).toEqual({ data: saved, error: null, reminderSync: 'not_required' });
    expect(mockDeleteEvent).toHaveBeenCalledWith('event');
    expect(mockCreateEvent).not.toHaveBeenCalled(); expect(mockUpdateEvent).not.toHaveBeenCalled();
  });

});
