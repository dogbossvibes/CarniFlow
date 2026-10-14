import { buildDailyWidgetSnapshot, DAILY_WIDGET_EXPIRES_MS, DAILY_WIDGET_FRESH_MS } from '../dailyWidgetSnapshot';
import type { CalendarEvent } from '@/types/calendar';

const now = Date.parse('2026-10-14T10:00:00Z');
const dog = (id = 'dog-a', owner_id = 'a') => ({ id, owner_id, name: 'Rex' });
const event = (changes: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', owner_id: 'a', created_by: 'a', dog_id: 'dog-a', dog_ids: ['dog-a'], trainer_id: null,
  type: 'custom', types: ['custom'], title: 'SECRET MEDICATION TITLE', start_at: '2026-10-14T11:00:00Z',
  end_at: null, status: 'confirmed', location: 'SECRET ADDRESS', notes: 'SECRET NOTES',
  discipline: null, reminder_minutes: [15], repeat: 'none', created_at: '2026-10-14T00:00:00Z', ...changes,
});
const build = (events: CalendarEvent[], dogs = [dog()], timeZone = 'Europe/Zurich', nowMs = now) =>
  buildDailyWidgetSnapshot({ ownerId: 'a', dogs, events, timeZone, nowMs });

it('projects only owned dogs/events and rejects an unknown or foreign associated dog', () => {
  const snapshot = build([event(), event({ id: 'foreign', owner_id: 'b', created_by: 'a' }),
    event({ id: 'mixed', dog_ids: ['dog-a', 'dog-b'] }), event({ id: 'legacy', dog_ids: [], dog_id: 'dog-a' })],
  [dog(), dog('dog-b', 'b')]);
  expect(snapshot.dogs).toEqual([{ id: 'dog-a', name: 'Rex' }]);
  expect(snapshot.items.map(x => x.id)).toEqual(['e1', 'legacy']);
});
it('deduplicates multi-dog events and excludes cancelled/completed/invalid timestamps', () => {
  const multi = event({ dog_ids: ['dog-a', 'dog-b', 'dog-a'] });
  const snapshot = build([multi, multi, event({ id: 'done', status: 'completed' }),
    event({ id: 'cancelled', status: 'cancelled' }), event({ id: 'bad', start_at: 'nonsense' })], [dog(), dog('dog-b')]);
  expect(snapshot.items).toHaveLength(1);
  expect(snapshot.items[0].dogIds).toEqual(['dog-a', 'dog-b']);
});
it('keeps explicit due-today reminders but never invents missed tasks or recurrences', () => {
  const snapshot = build([event({ id: 'old-appointment', start_at: '2026-10-14T08:00:00Z' }),
    event({ id: 'today-reminder', type: 'reminder', start_at: '2026-10-14T08:00:00Z' }),
    event({ id: 'old-repeat', type: 'reminder', repeat: 'daily', start_at: '2026-10-13T08:00:00Z' }),
    event({ id: 'ongoing', start_at: '2026-10-14T09:00:00Z', end_at: '2026-10-14T12:00:00Z' })]);
  expect(snapshot.items.map(x => x.id)).toEqual(['today-reminder', 'ongoing']);
});
it('uses the provided timezone at midnight and across the DST fallback', () => {
  const beforeMidnight = event({ type: 'reminder', start_at: '2026-10-14T21:55:00Z' });
  expect(build([beforeMidnight], [dog()], 'Europe/Zurich', Date.parse('2026-10-14T22:10:00Z')).items).toEqual([]);
  const first = event({ id: 'first', type: 'reminder', start_at: '2026-10-25T00:30:00Z' });
  const second = event({ id: 'second', type: 'reminder', start_at: '2026-10-25T01:30:00Z' });
  expect(build([second, first], [dog()], 'Europe/Zurich', Date.parse('2026-10-25T02:00:00Z')).items.map(x => x.id)).toEqual(['first', 'second']);
});
it('exports no customer title, notes, location, user/account identifier or health payload', () => {
  const snapshot = build([event({ source_type: 'health_medication', source_id: 'HEALTH-SECRET' })]);
  expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|owner_id|created_by|source_id|health_|trainer_id|reminder_minutes|title|notes|location/);
  expect(snapshot.items[0].carPlayEligible).toBe(false);
  expect(snapshot.freshUntilMs - now).toBe(DAILY_WIDGET_FRESH_MS);
  expect(snapshot.expiresAtMs - now).toBe(DAILY_WIDGET_EXPIRES_MS);
});
it('CarPlay permits only confirmed non-health appointments', () => {
  const snapshot = build([event(), event({ id: 'pending', status: 'pending' }),
    event({ id: 'health', source_type: 'health_vet_visit' }), event({ id: 'reminder', types: ['custom', 'reminder'] })]);
  expect(snapshot.items.filter(x => x.carPlayEligible).map(x => x.id)).toEqual(['e1']);
});
it('bounds snapshots and marks incomplete coverage instead of claiming an empty complete day', () => {
  const dogs = Array.from({ length: 129 }, (_, i) => dog(`d${i}`));
  const events = Array.from({ length: 257 }, (_, i) => event({ id: String(i), dog_id: 'd0', dog_ids: ['d0'] }));
  const snapshot = build(events, dogs);
  expect(snapshot.dogs).toHaveLength(128); expect(snapshot.items).toHaveLength(256); expect(snapshot.truncated).toBe(true);
});
it('rejects unknown identity/timezone rather than exporting an unbound snapshot', () => {
  expect(() => buildDailyWidgetSnapshot({ ownerId: '', nowMs: now, timeZone: 'UTC', dogs: [], events: [] })).toThrow();
  expect(() => build([], [], 'not-a-timezone')).toThrow();
});
