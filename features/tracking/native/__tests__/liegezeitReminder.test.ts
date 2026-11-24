jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'reminder-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelLayReminder, layReminderFireAt, scheduleLayReminder } from '../liegezeitReminder';

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
});
