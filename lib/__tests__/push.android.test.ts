const calls: string[] = [];
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'pid' } } } } }));
const mockUpdate = jest.fn(() => ({ eq: jest.fn(async () => ({})) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ update: mockUpdate }) } }));
let mockStatus = 'undetermined';
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => { calls.push('channel'); }),
  getPermissionsAsync: jest.fn(async () => { calls.push('get'); return { status: mockStatus }; }),
  requestPermissionsAsync: jest.fn(async () => { calls.push('request'); return { status: 'granted' }; }),
  getExpoPushTokenAsync: jest.fn(async () => { calls.push('token'); return { data: 'ExponentPushToken[x]' }; }),
}));

import { registerForPush } from '../push';

beforeEach(() => { calls.length = 0; mockStatus = 'undetermined'; mockUpdate.mockClear(); });

it('Android: legt den Kanal vor der Berechtigungsanfrage an (Android 13+ zeigt die Abfrage sonst nicht)', async () => {
  await registerForPush('user-1');
  expect(calls.indexOf('channel')).toBeGreaterThanOrEqual(0);
  expect(calls.indexOf('channel')).toBeLessThan(calls.indexOf('request'));
  expect(calls).toContain('token');
  expect(mockUpdate).toHaveBeenCalledWith({ push_token: 'ExponentPushToken[x]' });
});

it('Android ohne Abfrage (prompt: false): Kanal ja, keine Berechtigungsanfrage, kein Token ohne Berechtigung', async () => {
  await registerForPush('user-1', { prompt: false });
  expect(calls).toEqual(['channel', 'get']);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('ein Fehler beim Token bricht nichts ab', async () => {
  const n = jest.requireMock('expo-notifications');
  n.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('SERVICE_NOT_AVAILABLE'));
  await expect(registerForPush('user-1')).resolves.toBeUndefined();
  expect(mockUpdate).not.toHaveBeenCalled();
});
