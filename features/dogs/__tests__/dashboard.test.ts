jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import type { CalendarEvent } from '@/types/calendar';
import {
  toDogAppointments, backpackStatus, buildTodayHints, isSameDay, isTomorrow,
  type DogAppointment,
} from '@/features/dogs/dashboard';

const NOW = new Date(2026, 7, 2, 12, 0); // Mi? 2. Aug 2026, 12:00

let seq = 0;
function mkEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: over.id ?? `e${seq++}`,
    owner_id: 'u1', created_by: 'u1',
    dog_id: 'dog_id' in over ? (over.dog_id ?? null) : 'dogA',
    dog_ids: over.dog_ids ?? [],
    trainer_id: null,
    type: over.type ?? 'training',
    types: [over.type ?? 'training'],
    title: over.title ?? 'Termin',
    start_at: over.start_at ?? '2026-08-05T18:00:00',
    end_at: null, location: null,
    discipline: over.discipline ?? null,
    notes: null,
    status: over.status ?? 'confirmed',
    reminder_minutes: [], repeat: 'none',
    created_at: '2026-07-01T00:00:00',
    dog: null,
  };
}

const iso = (d: Date) => d.toISOString();
const plusDays = (n: number, h = 12) => iso(new Date(2026, 7, 2 + n, h, 0));

describe('toDogAppointments', () => {
  it('filtert nach dog_id UND dog_ids, schliesst cancelled/completed aus', () => {
    const events = [
      mkEvent({ id: 'a', dog_id: 'dogA' }),
      mkEvent({ id: 'b', dog_id: 'dogB' }),                       // anderer Hund
      mkEvent({ id: 'c', dog_id: null, dog_ids: ['dogA', 'dogX'] }), // via dog_ids
      mkEvent({ id: 'd', dog_id: 'dogA', status: 'cancelled' }),  // abgesagt
      mkEvent({ id: 'e', dog_id: 'dogA', status: 'completed' }),  // erledigt
    ];
    const r = toDogAppointments(events, 'dogA', NOW).map(a => a.id).sort();
    expect(r).toEqual(['a', 'c']);
  });

  it('8) sortiert überfällig zuerst, dann chronologisch aufsteigend', () => {
    const events = [
      mkEvent({ id: 'future2', start_at: plusDays(5) }),
      mkEvent({ id: 'overdue', start_at: plusDays(-3) }),
      mkEvent({ id: 'future1', start_at: plusDays(1) }),
    ];
    const r = toDogAppointments(events, 'dogA', NOW);
    expect(r.map(a => a.id)).toEqual(['overdue', 'future1', 'future2']);
    expect(r[0].overdue).toBe(true);
    expect(r[1].overdue).toBe(false);
  });

  it('31) Hund A bekommt nicht die Termine von Hund B', () => {
    const events = [mkEvent({ id: 'b1', dog_id: 'dogB' }), mkEvent({ id: 'b2', dog_id: null, dog_ids: ['dogB'] })];
    expect(toDogAppointments(events, 'dogA', NOW)).toHaveLength(0);
  });
});

describe('backpackStatus', () => {
  it('18-20) empty / all_ready / none_packed / partial', () => {
    expect(backpackStatus(0, 0)).toBe('empty');
    expect(backpackStatus(5, 5)).toBe('all_ready');
    expect(backpackStatus(5, 0)).toBe('none_packed');
    expect(backpackStatus(5, 3)).toBe('partial');
  });
});

describe('isSameDay / isTomorrow', () => {
  it('erkennt heute und morgen', () => {
    expect(isSameDay(plusDays(0), NOW)).toBe(true);
    expect(isSameDay(plusDays(1), NOW)).toBe(false);
    expect(isTomorrow(plusDays(1), NOW)).toBe(true);
    expect(isTomorrow(plusDays(2), NOW)).toBe(false);
  });
});

const appt = (over: Partial<DogAppointment>): DogAppointment => ({
  id: over.id ?? 'x', title: over.title ?? 'T', startAt: over.startAt ?? plusDays(1),
  discipline: over.discipline ?? null, type: over.type ?? 'training', overdue: over.overdue ?? false,
});

describe('buildTodayHints', () => {
  it('6) keine Daten → keine Hinweise (Empty State)', () => {
    expect(buildTodayHints({ appointments: [], now: NOW })).toEqual([]);
  });

  it('1) Termin heute wird angezeigt', () => {
    const hints = buildTodayHints({ appointments: [appt({ startAt: plusDays(0) })], now: NOW });
    expect(hints[0].kind).toBe('appointment_today');
  });

  it('2) überfälliger Termin priorisiert (nach heute)', () => {
    const hints = buildTodayHints({
      appointments: [appt({ id: 'o', overdue: true, startAt: plusDays(-2) })], now: NOW,
    });
    expect(hints[0].kind).toBe('appointment_overdue');
  });

  it('3) Läufigkeit bald wird angezeigt (nur wenn ≤45 T oder aktiv)', () => {
    expect(buildTodayHints({ appointments: [], heat: { daysUntil: 18, active: false }, now: NOW })[0].kind).toBe('heat');
    expect(buildTodayHints({ appointments: [], heat: { daysUntil: 200, active: false }, now: NOW })).toEqual([]);
    expect(buildTodayHints({ appointments: [], heat: { daysUntil: -1, active: true }, now: NOW })[0].kind).toBe('heat');
  });

  it('4) Ziel angezeigt', () => {
    expect(buildTodayHints({ appointments: [], goalTitle: 'IBGH 2', now: NOW })[0].kind).toBe('goal');
  });

  it('5) Backpack offen angezeigt (aktiv > gepackt)', () => {
    expect(buildTodayHints({ appointments: [], backpackActive: 5, backpackPacked: 3, now: NOW })[0].kind).toBe('backpack');
    expect(buildTodayHints({ appointments: [], backpackActive: 5, backpackPacked: 5, now: NOW })).toEqual([]);
  });

  it('Priorität + max. 4 Hinweise', () => {
    const hints = buildTodayHints({
      appointments: [appt({ startAt: plusDays(0) }), appt({ id: 'o', overdue: true, startAt: plusDays(-1) })],
      heat: { daysUntil: 10, active: false },
      goalTitle: 'IBGH 2',
      backpackActive: 4, backpackPacked: 1,
      lastTrainingLabel: 'Fährte · gestern',
      now: NOW,
    });
    expect(hints).toHaveLength(4);
    expect(hints.map(h => h.kind)).toEqual(['appointment_today', 'appointment_overdue', 'heat', 'goal']);
  });
});

describe('37) keine neue Persistenz/Migration im Dashboard-Modul', () => {
  const src = readFileSync('features/dogs/dashboard.ts', 'utf8');
  it('spricht weder Supabase noch AsyncStorage an', () => {
    expect(src).not.toMatch(/@\/lib\/supabase/);
    expect(src).not.toMatch(/async-storage/i);
    expect(src).not.toMatch(/supabase\./);
  });
});
