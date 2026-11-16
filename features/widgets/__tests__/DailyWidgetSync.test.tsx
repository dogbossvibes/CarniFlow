import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DailyWidgetSync } from '../DailyWidgetSync';
import { notifyDailyWidgetDataChanged } from '../dailyWidgetRefresh';

let mockOwner = 'a'; let mockLoading = false; let mockAvailable = true; let mockError = false;
let mockAuth: ((event: string, session: { user: { id: string } } | null) => void) | null = null;
const mockBegin = jest.fn<string, [string | null]>(owner => `token-${owner}`);
const mockWrite = jest.fn<Promise<boolean>, [string, number, string]>(async () => true);
const mockAvailability = jest.fn<Promise<boolean>, [string, number, 'offline' | 'error']>(async () => true);
const mockDogs = jest.fn((owner: string) => ({ select: () => ({ limit: async () => ({ data: [{ id: 'dog-'+owner, owner_id: owner, name: 'Rex' }], error: null }) }) }));
const mockCalendar = jest.fn((_owner: string) => {
  const builder: { select: jest.Mock; eq: jest.Mock; in: jest.Mock; or: jest.Mock; limit: () => Promise<{ data: never[]; error: Error | null }> } = { select: jest.fn(() => builder), eq: jest.fn(() => builder), in: jest.fn(() => builder), or: jest.fn(() => builder),
    limit: async () => ({ data: [], error: mockError ? new Error('data unavailable') : null }) };
  return builder;
});
jest.mock('@/modules/anyvo-daily-widget', () => ({ dailyWidgetTransport: {
  isAvailable: () => mockAvailable,
  beginSession: (owner: string | null) => mockBegin(owner),
  updateSnapshot: (token: string, sequence: number, json: string) => mockWrite(token, sequence, json),
  updateAvailability: (token: string, sequence: number, state: 'offline' | 'error') => mockAvailability(token, sequence, state),
} }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } }, loading: mockLoading }) }));
jest.mock('@/services/dogs', () => ({ getDogs: (owner: string) => mockDogs(owner) }));
jest.mock('@/services/calendarService', () => ({ getCalendarEvents: (owner: string) => mockCalendar(owner) }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: async () => true, addNetListener: () => () => {} }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { getQueryCache: () => ({ subscribe: () => () => {} }) } }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: (fn: typeof mockAuth) => {
  mockAuth = fn; return { data: { subscription: { unsubscribe: () => {} } } };
} } } }));
let renderer: ReturnType<typeof TestRenderer.create> | null = null;
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); mockOwner = 'a'; mockLoading = false; mockAvailable = true; mockError = false; mockAuth = null; });
afterEach(() => { act(() => renderer?.unmount()); renderer = null; });
it('makes no data/auth calls for an unsupported binary or pending session bootstrap', async () => {
  mockAvailable = false; await act(async () => { renderer = TestRenderer.create(<DailyWidgetSync />); await settle(); });
  expect(mockDogs).not.toHaveBeenCalled(); expect(mockBegin).not.toHaveBeenCalled();
  mockAvailable = true; mockLoading = true; await act(async () => { renderer!.update(<DailyWidgetSync />); await settle(); });
  expect(mockDogs).not.toHaveBeenCalled(); expect(mockBegin).not.toHaveBeenCalled();
});
it('sends a whitelist snapshot, clears directly on auth logout and invalidates on source mutation', async () => {
  await act(async () => { renderer = TestRenderer.create(<DailyWidgetSync />); await settle(); });
  expect(mockWrite).toHaveBeenCalledTimes(1);
  const first = JSON.parse(mockWrite.mock.calls[0][2]);
  expect(first.dogs).toEqual([{ id: 'dog-a', name: 'Rex' }]);
  expect(mockCalendar.mock.results[0].value.eq).toHaveBeenCalledWith('owner_id', 'a');
  await act(async () => { notifyDailyWidgetDataChanged(); await settle(); });
  expect(mockBegin.mock.calls.map(call => call[0])).toEqual(['a', null, 'a']);
  act(() => { mockAuth?.('SIGNED_OUT', null); });
  expect(mockBegin).toHaveBeenLastCalledWith(null);
});
it('marks a calendar failure as error instead of exporting a successful empty day', async () => {
  mockError = true; await act(async () => { renderer = TestRenderer.create(<DailyWidgetSync />); await settle(); });
  expect(mockWrite).not.toHaveBeenCalled();
  expect(mockAvailability).toHaveBeenLastCalledWith('token-a', 1, 'error');
});
