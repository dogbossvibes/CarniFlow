import { subscribeDailyWidgetDataChanged } from '../dailyWidgetRefresh';
import { addDog, updateDog, deleteDog } from '@/services/dogs';
import { updateCalendarEvent, setEventStatus, deleteCalendarEvent } from '@/services/calendarService';

let mockError = false;
const mockResult = () => ({ data: { id: 'existing' }, error: mockError ? new Error('denied') : null });
const mockBuilder: { insert: jest.Mock; update: jest.Mock; delete: jest.Mock; eq: jest.Mock;
  select: jest.Mock; single: jest.Mock; then: (fn: (result: ReturnType<typeof mockResult>) => unknown) => Promise<unknown> } = {
  insert: jest.fn(() => mockBuilder), update: jest.fn(() => mockBuilder), delete: jest.fn(() => mockBuilder),
  eq: jest.fn(() => mockBuilder), select: jest.fn(() => mockBuilder), single: jest.fn(async () => mockResult()),
  then: (fn: (result: ReturnType<typeof mockResult>) => unknown) => Promise.resolve(mockResult()).then(fn),
};
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => mockBuilder } }));
beforeEach(() => { jest.clearAllMocks(); mockError = false; });

it('preserves original mutation payloads/results and notifies only on success', async () => {
  const listener = jest.fn(); const off = subscribeDailyWidgetDataChanged(listener);
  try {
    expect(await updateDog('existing-dog', { name: 'Rex' })).toEqual(mockResult());
    expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'existing-dog');
    expect(mockBuilder.update).toHaveBeenCalledWith({ name: 'Rex' });
    await setEventStatus('existing-event', 'completed');
    expect(mockBuilder.update).toHaveBeenCalledWith({ status: 'completed' });
    await updateCalendarEvent('existing-event', { status: 'cancelled' });
    await deleteCalendarEvent('existing-event'); await deleteDog('existing-dog');
    expect(listener).toHaveBeenCalledTimes(5);
    mockError = true; await updateDog('existing-dog', { name: 'Rex' }); await setEventStatus('existing-event', 'completed');
    expect(listener).toHaveBeenCalledTimes(5);
  } finally { off(); }
});
it('a failing widget subscriber never changes an otherwise successful customer write', async () => {
  const off = subscribeDailyWidgetDataChanged(() => { throw new Error('widget unavailable'); });
  try {
    // Test the real service with all network/storage mocked; no customer data touched.
    const result = await addDog('owner', { name: 'Rex' } as Parameters<typeof addDog>[1]);
    expect(result.error).toBeNull(); expect(mockBuilder.insert).toHaveBeenCalledWith({ name: 'Rex', owner_id: 'owner' });
  } finally { off(); }
});
