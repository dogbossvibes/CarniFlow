// Live Activity ausblenden → deterministisch der Notification-Pfad.
jest.mock('@/features/tracking/native/liegezeitLiveActivity', () => ({
  liegezeitActivityAvailable: () => false,
  startLiegezeitActivity: jest.fn(),
  endLiegezeitActivity: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  dismissNotificationAsync: jest.fn(async () => {}),
}));

import * as Notifications from 'expo-notifications';
import {
  liegezeitShouldBeActive, buildLiegezeitContent, fmtSince,
  startLiegezeitNotification, endLiegezeitNotification, LIEGEZEIT_NOTIFICATION_TYPE,
} from '@/features/tracking/native/liegezeitNotification';

const sched = Notifications.scheduleNotificationAsync as jest.Mock;
const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
const perms = Notifications.getPermissionsAsync as jest.Mock;

beforeEach(() => { sched.mockClear(); dismiss.mockClear(); perms.mockResolvedValue({ granted: true, status: 'granted' }); });

describe('P4 — Liegezeit-Anzeige: reine Logik', () => {
  it('1. aktiv bei resting', () => expect(liegezeitShouldBeActive('resting')).toBe(true));
  it('2. NICHT aktiv bei laid', () => expect(liegezeitShouldBeActive('laid')).toBe(false));
  it('3./4./5. NICHT aktiv bei searching/completed/cancelled', () => {
    expect(liegezeitShouldBeActive('searching')).toBe(false);
    expect(liegezeitShouldBeActive('completed')).toBe(false);
    expect(liegezeitShouldBeActive('cancelled')).toBe(false);
  });
  it('6. Deep-Link-Inhalt enthält type=liegezeit + sessionId', () => {
    const c = buildLiegezeitContent({ sessionId: 'sess-42', dogName: 'Malu', startedAt: 0 }, 65_000);
    expect(c.data.type).toBe(LIEGEZEIT_NOTIFICATION_TYPE);
    expect(c.data.sessionId).toBe('sess-42');
    expect(c.sticky).toBe(true);
    expect(c.title).toContain('Malu');
  });
  it('fmtSince rechnet aus Zeitstempeln', () => {
    expect(fmtSince(0, 5 * 60_000)).toBe('5 min');
    expect(fmtSince(0, 3 * 3600_000 + 12 * 60_000)).toBe('3 h 12 min');
  });
});

describe('P4 — Liegezeit-Anzeige: native (best-effort)', () => {
  it('8. fehlende Notification-Permission → kein Crash, keine Notification', async () => {
    perms.mockResolvedValue({ granted: false, status: 'denied' });
    await expect(startLiegezeitNotification({ sessionId: 's', startedAt: 0 })).resolves.toBeUndefined();
    expect(sched).not.toHaveBeenCalled();
  });

  it('startet Notification mit type=liegezeit; end entfernt sie', async () => {
    await startLiegezeitNotification({ sessionId: 's1', dogName: 'Rex', startedAt: Date.now() });
    expect(sched).toHaveBeenCalledTimes(1);
    const content = sched.mock.calls[0][0].content;
    expect(content.data.type).toBe('liegezeit');
    expect(content.data.sessionId).toBe('s1');

    await endLiegezeitNotification();
    expect(dismiss).toHaveBeenCalled();
  });

  it('endLiegezeitNotification ohne aktive Notification wirft nicht', async () => {
    await expect(endLiegezeitNotification()).resolves.toBeUndefined();
  });
});

describe('P4 — Store-Compliance / keine verbotenen Abhängigkeiten', () => {
  const fs = require('fs');
  const src = (p: string) => fs.readFileSync(require('path').join(__dirname, '..', p), 'utf8');
  it('15. startet keine GPS/Standort-API (kein expo-location import)', () => {
    expect(src('liegezeitNotification.ts')).not.toMatch(/expo-location/);
    expect(src('liegezeitLiveActivity.ts')).not.toMatch(/expo-location/);
  });
  it('16. kein Background-Audio (kein expo-av / expo-audio)', () => {
    expect(src('liegezeitNotification.ts')).not.toMatch(/expo-a(v|udio)/);
    expect(src('liegezeitLiveActivity.ts')).not.toMatch(/expo-a(v|udio)/);
  });
});
