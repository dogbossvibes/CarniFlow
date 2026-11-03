import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { DatabaseSync } from 'node:sqlite';
import { SessionProvider } from '../session-context';
import { RAW_CAPTURE_DB_SCHEMA } from '@/features/tracking/storage/gpsCaptureDb';
import { beginGpsCapture, readGpsCapture, type GpsCaptureRecord } from '@/features/tracking/storage/gpsCapture';
import { setGpsCaptureAccount } from '@/features/tracking/storage/gpsCaptureScope';
let mockDb: DatabaseSync;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  // Each authenticated fixture owns a saved parent; unresolved parents have dedicated storage tests.
  getFirstAsync: async () => ({local_id: 'track', deleted_at: null}),
}) }));
jest.mock('@/features/tracking/storage/gpsCaptureDb', () => ({
  ...jest.requireActual('@/features/tracking/storage/gpsCaptureDb'),
  getGpsCaptureDb: async () => ({
  withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
    const tx = {
      getFirstAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).get(...args) ?? null,
      getAllAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).all(...args),
      runAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).run(...args),
    };
    mockDb.exec('BEGIN IMMEDIATE');
    try { await work(tx); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));

let mockAuthEvent: (event: string, session: unknown) => void;
let mockFinishBootstrap: (value: unknown) => void;
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: () => new Promise(resolve => { mockFinishBootstrap = resolve; }),
  onAuthStateChange: (cb: typeof mockAuthEvent) => { mockAuthEvent = cb; return { data: { subscription: { unsubscribe: jest.fn() } } }; },
} } }));
jest.mock('@/services/localeSync', () => ({ initLocaleSync: jest.fn(), stopLocaleSync: jest.fn() }));
jest.mock('@/hooks/useSubscriptionSyncRecovery', () => ({ useSubscriptionSyncRecovery: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
let renderer: ReactTestRenderer | null;
let handles: ReturnType<typeof beginGpsCapture>[];
const point: GpsCaptureRecord = { measuredAtMs: 1000, receivedAtMs: 1001, latitude: 47, longitude: 8,
  accuracy: 4, altitude: null, speed: 1, heading: null, source: 'expo', delivery: 'foreground', timing: 'live' };
const session = (owner: string | null) => owner ? { user: { id: owner } } : null;
const auth = (event: string, owner: string | null) => act(() => mockAuthEvent(event, session(owner)));
async function bootstrap(owner: string) {
  await act(async () => { mockFinishBootstrap({ data: { session: session(owner) } }); await Promise.resolve(); });
}
function open() { const handle = beginGpsCapture('track', 'lay'); handles.push(handle); return handle; }
beforeEach(() => {
  jest.useFakeTimers(); setGpsCaptureAccount(null); handles = [];
  mockDb = new DatabaseSync(':memory:'); mockDb.exec('PRAGMA foreign_keys=ON');
  mockDb.exec(RAW_CAPTURE_DB_SCHEMA);
  act(() => { renderer = TestRenderer.create(<SessionProvider>{null}</SessionProvider>); });
});
afterEach(async () => {
  await Promise.all(handles.map(handle => handle.close(false)));
  act(() => renderer?.unmount()); renderer = null;
  mockDb.close(); jest.useRealTimers();
});
it('bootstrap authorizes A, same-user refresh preserves its handle, and A→B fences it and isolates rows', async () => {
  await bootstrap('A');
  const old = open(); expect(await old.capture(point)).toBe(true);
  auth('TOKEN_REFRESHED', 'A');
  expect(await old.capture({ ...point, measuredAtMs: 2000 })).toBe(true);
  expect((await readGpsCapture('track', 'lay')).map(row => row.measuredAtMs)).toEqual([1000, 2000]);
  auth('SIGNED_IN', 'B');
  expect(await old.capture(point)).toBe(false);
  expect(await readGpsCapture('track', 'lay')).toEqual([]);
  const current = open(); expect(await current.capture({ ...point, latitude: 48 })).toBe(true);
  expect((await readGpsCapture('track', 'lay')).map(row => row.latitude)).toEqual([48]);
  expect(mockDb.prepare('select owner_id,count(*) n from raw_capture_measurements group by owner_id order by owner_id').all())
    .toEqual([{ owner_id: 'A', n: 2 }, { owner_id: 'B', n: 1 }]);
});
it('logout immediately fences an open handle and rejects reads without deleting its saved coordinates', async () => {
  await bootstrap('A'); const handle = open(); expect(await handle.capture(point)).toBe(true);
  auth('SIGNED_OUT', null);
  expect(await handle.capture(point)).toBe(false);
  await expect(readGpsCapture('track', 'lay')).rejects.toThrow('RAW_ACCOUNT_UNAVAILABLE');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
  auth('SIGNED_IN', 'A');
  expect(await handle.capture(point)).toBe(false);
  expect(await readGpsCapture('track', 'lay')).toEqual([point]);
});
it('late bootstrap after logout cannot restore archive authorization', async () => {
  auth('SIGNED_IN', 'A'); const handle = open(); expect(await handle.capture(point)).toBe(true);
  auth('SIGNED_OUT', null); await bootstrap('A');
  expect(await handle.capture(point)).toBe(false);
  await expect(readGpsCapture('track', 'lay')).rejects.toThrow('RAW_ACCOUNT_UNAVAILABLE');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
});
it('late bootstrap cannot replace B after an auth event selected the new account', async () => {
  auth('SIGNED_IN', 'B'); const handle = open(); expect(await handle.capture(point)).toBe(true);
  await bootstrap('A');
  expect(await handle.capture({ ...point, measuredAtMs: 2000 })).toBe(true);
  expect((await readGpsCapture('track', 'lay')).map(row => row.measuredAtMs)).toEqual([1000, 2000]);
  expect(mockDb.prepare('select distinct owner_id from raw_capture_measurements').all()).toEqual([{ owner_id: 'B' }]);
});
it('provider unmount revokes an existing handle and archive reads', async () => {
  await bootstrap('A'); const handle = open(); expect(await handle.capture(point)).toBe(true);
  act(() => renderer?.unmount()); renderer = null;
  expect(await handle.capture(point)).toBe(false);
  await expect(readGpsCapture('track', 'lay')).rejects.toThrow('RAW_ACCOUNT_UNAVAILABLE');
});
