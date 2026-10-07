import { assertSupportPrivacy } from '../supportDiagnostics';
import {
  activeBackgroundLaySessionId, beginBackgroundLayDiagnostics, endBackgroundLayDiagnostics,
  loadBackgroundLayDiagnostics, recordActiveBackgroundLayEvent, recordBackgroundLayEvent,
} from '../backgroundLayDiagnostics';

const mockData = new Map<string, string>();
let mockId = 0;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => Promise.resolve(mockData.get(key) ?? null),
  setItem: (key: string, value: string) => { mockData.set(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { mockData.delete(key); return Promise.resolve(); },
  getAllKeys: () => Promise.resolve([...mockData.keys()]),
  multiGet: (keys: string[]) => Promise.resolve(keys.map(key => [key, mockData.get(key) ?? null])),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => `event-${++mockId}` }));

beforeEach(() => { mockData.clear(); mockId = 0; });

it('keeps concurrent event writes independent and aggregates counts by exact session', async () => {
  await beginBackgroundLayDiagnostics('session-a');
  await Promise.all(Array.from({ length: 20 }, () => recordBackgroundLayEvent('session-a', 'onFixReceived')));
  await recordBackgroundLayEvent('session-a', 'onFixRejected', 1, 'accuracy');
  await recordBackgroundLayEvent('session-b', 'onFixAccepted');
  const a = await loadBackgroundLayDiagnostics('session-a');
  expect(a?.counts.onFixReceived).toBe(20);
  expect(a?.counts.onFixAccepted).toBe(0);
  expect(a?.rejectReasons).toEqual({ accuracy: 1 });
  expect(await loadBackgroundLayDiagnostics('session-b')).toBeNull();
});

it('attributes headless events through the explicit active context, never a latest-session lookup', async () => {
  expect(await activeBackgroundLaySessionId()).toBeNull();
  await recordActiveBackgroundLayEvent('taskCallback');
  await beginBackgroundLayDiagnostics('session-a');
  await recordActiveBackgroundLayEvent('taskCallback');
  await endBackgroundLayDiagnostics('other-session');
  expect(await activeBackgroundLaySessionId()).toBe('session-a');
  await endBackgroundLayDiagnostics('session-a');
  await recordActiveBackgroundLayEvent('taskCallback');
  expect((await loadBackgroundLayDiagnostics('session-a'))?.counts.taskCallback).toBe(1);
});

it('exports relative times and reason codes without coordinates, IDs, or absolute dates', async () => {
  await beginBackgroundLayDiagnostics('session-a');
  await recordBackgroundLayEvent('session-a', 'taskStartFailure', 1, 'E_DENIED');
  await recordBackgroundLayEvent('session-a', 'backgroundPermission', 1, 'denied');
  const d = await loadBackgroundLayDiagnostics('session-a');
  expect(d?.taskStartFailureReason).toBe('E_DENIED');
  expect(d?.backgroundPermissionState).toBe('denied');
  expect(d?.timesMs.taskStartFailure).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(d)).not.toMatch(/latitude|longitude|session-a|dogId|2026-/);
  expect(() => assertSupportPrivacy({ backgroundLayDiagnostics: d })).not.toThrow();
});
