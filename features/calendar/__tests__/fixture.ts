import type { CalendarEvent } from '@/types/calendar';
export const event = {
  id: 'event-1', owner_id: 'owner-a', created_by: 'owner-a', trainer_id: null,
  title: 'UO / Fährte', type: 'uo', types: ['uo', 'tracking'],
  dog_id: 'dog-a', dog_ids: ['dog-a', 'dog-b'],
  start_at: new Date(2026, 9, 25, 9, 41, 37).toISOString(), end_at: null,
  notes: 'Existing notes', location: 'Field', discipline: 'UO', status: 'confirmed',
  reminder_minutes: [60, 1440], repeat: 'weekly', created_at: '2026-10-18T06:00:00Z',
} satisfies CalendarEvent;
