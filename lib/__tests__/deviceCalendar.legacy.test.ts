// expo-calendar 56+ (SDK 58, Build 60): Die …Async-Funktionen im Hauptimport
// werfen beim Aufruf. Der Geräte-Kalender-Export muss die Legacy-API nutzen.
jest.mock('expo-calendar/legacy', () => ({
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getDefaultCalendarAsync: jest.fn(async () => ({ id: 'default-cal' })),
  getCalendarsAsync: jest.fn(async () => []),
  createCalendarAsync: jest.fn(async () => 'new-cal'),
  createEventAsync: jest.fn(async () => 'event-1'),
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: { OWNER: 'owner' },
}), { virtual: true });
jest.mock('expo-calendar', () => {
  const fail = () => { throw new Error('Method imported from "expo-calendar" is deprecated.'); };
  return {
    requestCalendarPermissionsAsync: fail, getDefaultCalendarAsync: fail, getCalendarsAsync: fail,
    createCalendarAsync: fail, createEventAsync: fail,
    EntityTypes: { EVENT: 'event' }, CalendarAccessLevel: { OWNER: 'owner' },
  };
}, { virtual: true });
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { addEventToDeviceCalendar, DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';

const legacy = jest.requireMock('expo-calendar/legacy') as {
  requestCalendarPermissionsAsync: jest.Mock; createEventAsync: jest.Mock;
};

describe('Geräte-Kalender-Export (Legacy-API)', () => {
  it('ist verfügbar und legt den Termin über expo-calendar/legacy an', async () => {
    expect(DEVICE_CALENDAR_AVAILABLE).toBe(true);
    const res = await addEventToDeviceCalendar({
      id: 'e1', title: 'Training', start_at: '2026-11-20T10:00:00.000Z', end_at: null, location: null, notes: null,
    } as never);
    expect(res).toEqual({ ok: true });
    expect(legacy.createEventAsync).toHaveBeenCalledWith('default-cal', expect.objectContaining({ title: 'Training' }));
    const call = legacy.createEventAsync.mock.calls[0][1] as { startDate: Date; endDate: Date };
    expect(call.endDate.getTime() - call.startDate.getTime()).toBe(60 * 60 * 1000);
  });

  it('meldet fehlende Berechtigung ohne Termin anzulegen', async () => {
    legacy.requestCalendarPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    legacy.createEventAsync.mockClear();
    const res = await addEventToDeviceCalendar({ id: 'e2', title: 'X', start_at: '2026-11-20T10:00:00.000Z' } as never);
    expect(res.ok).toBe(false);
    expect(legacy.createEventAsync).not.toHaveBeenCalled();
  });
});
