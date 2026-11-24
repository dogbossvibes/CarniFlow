jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'reminder-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelLayReminder, cancelLayRemindersForSession, layReminderFireAt, reconcileLayReminders, scheduleLayReminder } from '../liegezeitReminder';

const sched = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const perms = Notifications.getPermissionsAsync as jest.Mock;
const input = (startedAt: number) => ({ dogId: 'd1', sessionId: 's1', startedAt, minutes: 30, title: 'Liegezeit erreicht', body: 'x' });

beforeEach(async () => {
  sched.mockClear(); cancel.mockClear(); perms.mockResolvedValue({ granted: true, status: 'granted' });
  await AsyncStorage.clear();
});

describe('Liegezeit-Erinnerung', () => {
  it('Zeitpunkt = Liegezeit-Beginn + Minuten; vorbei → keine Erinnerung', () => {
    expect(layReminderFireAt(0, 30, 0)).toBe(30 * 60_000);
    expect(layReminderFireAt(0, 30, 30 * 60_000)).toBeNull();
    expect(layReminderFireAt(0, 0, 0)).toBeNull();
    expect(layReminderFireAt(NaN, 30, 0)).toBeNull();
  });

  it('plant genau eine Erinnerung je Hund und Fährte (idempotent)', async () => {
    const start = Date.now();
    await scheduleLayReminder(input(start));
    await scheduleLayReminder(input(start));
    expect(sched).toHaveBeenCalledTimes(1);
    expect(sched.mock.calls[0][0].trigger.date.getTime()).toBe(start + 30 * 60_000);
  });

  it('ohne Berechtigung: nichts planen, keine Anfrage', async () => {
    perms.mockResolvedValue({ granted: false, status: 'denied' });
    await scheduleLayReminder(input(Date.now()));
    expect(sched).not.toHaveBeenCalled();
  });

  it('Abbruch/Absuchebeginn entfernt die geplante Erinnerung', async () => {
    await scheduleLayReminder(input(Date.now()));
    await cancelLayReminder('d1');
    expect(cancel).toHaveBeenCalledWith('reminder-1');
    await cancelLayReminder('d1');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('Fehler der Benachrichtigung werfen nie', async () => {
    sched.mockRejectedValueOnce(new Error('boom'));
    await expect(scheduleLayReminder(input(Date.now()))).resolves.toBeUndefined();
  });

  it('Abbruch mit Fährten-ID entfernt nie die Erinnerung einer anderen Fährte', async () => {
    await scheduleLayReminder(input(Date.now()));
    await cancelLayReminder('d1', 'other-session');
    expect(cancel).not.toHaveBeenCalled();
    await cancelLayReminder('d1', 's1');
    expect(cancel).toHaveBeenCalledWith('reminder-1');
  });

  it('Löschen einer Fährte entfernt ihre Erinnerung, ohne den Hund zu kennen', async () => {
    await scheduleLayReminder(input(Date.now()));
    await cancelLayRemindersForSession('other');
    expect(cancel).not.toHaveBeenCalled();
    await cancelLayRemindersForSession('s1');
    expect(cancel).toHaveBeenCalledWith('reminder-1');
  });

  it('Abgleich: bleibt, solange dieselbe Fährte liegt; sonst entfernt', async () => {
    await scheduleLayReminder(input(Date.now()));
    expect(await reconcileLayReminders({ d1: { status: 'resting', sessionId: 's1' } })).toEqual([]);
    expect(cancel).not.toHaveBeenCalled();
    expect(await reconcileLayReminders({ d1: { status: 'searching', sessionId: 's1' } })).toEqual(['d1']);
    expect(cancel).toHaveBeenCalledWith('reminder-1');
  });

  it.each([
    ['Fährte nicht mehr offen (abgebrochen, verworfen, gelöscht)', {}],
    ['andere Fährte liegt jetzt', { d1: { status: 'resting', sessionId: 's2' } }],
  ])('Abgleich entfernt die Erinnerung: %s', async (_name, byDog) => {
    await scheduleLayReminder(input(Date.now()));
    expect(await reconcileLayReminders(byDog as never)).toEqual(['d1']);
  });
});
