import { canEditOwnEvent, eventEditPatch, eventFormInstant } from '../eventEditing';
import type { CalendarEvent } from '@/types/calendar';

import { event } from './fixture';

describe('calendar owner edit', () => {
  it('distinguishes calendar appointments from private training records and health projections', () => {
    expect(canEditOwnEvent(event, 'owner-a')).toBe(true);
    expect(canEditOwnEvent({ ...event, trainer_id: 'trainer' }, 'owner-a')).toBe(false);
    expect(canEditOwnEvent({ ...event, created_by: 'trainer' }, 'owner-a')).toBe(false);
    expect(canEditOwnEvent(event, 'trainer')).toBe(false);
    expect(canEditOwnEvent(event, 'owner-b')).toBe(false);
    expect(canEditOwnEvent(event)).toBe(false);
    expect(canEditOwnEvent({ ...event, source_type: 'health_vet_visit', source_id: 'health-1' } as CalendarEvent, 'owner-a')).toBe(false);
  });
  it('changes only the edited title, retaining trainer/status/recurrence/IDs and metadata', () => {
    expect(eventEditPatch(event, { ...event, title: 'UO revised', status: 'pending', trainer_id: null } as CalendarEvent)).toEqual({ title: 'UO revised' });
    expect(eventEditPatch(event, event)).toEqual({});
  });
  it('sends explicit note/end/reminder removal without deleting and recreating the event', () => {
    expect(eventEditPatch(event, { ...event, notes: null, reminder_minutes: [] })).toEqual({ notes: null, reminder_minutes: [] });
  });
  it('preserves seconds and the original DST occurrence when no day/time was changed', () => {
    for (const iso of ['2026-10-25T02:30:37+01:00', '2026-10-25T02:30:37+02:00']) {
      const day = new Date(iso);
      expect(eventFormInstant(day, day, iso)).toBe(iso);
    }
  });
  it('moves an overnight end by calendar days, preserving its next-day relationship', () => {
    const start = new Date(2026, 9, 24, 23, 30).toISOString();
    const end = new Date(2026, 9, 25, 1, 30).toISOString();
    const moved = new Date(eventFormInstant(new Date(2026, 9, 26), new Date(end), end, start));
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([2026, 9, 27, 1, 30]);
  });
});
