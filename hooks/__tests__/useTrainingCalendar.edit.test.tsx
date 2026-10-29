import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrainingCalendar, nextEvent } from '../useTrainingCalendar';
import { event } from '@/features/calendar/__tests__/fixture';
let mockUser = 'owner-a';
const mockGet = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/services/calendarService', () => ({ getCalendarEvents: (...args: unknown[]) => mockGet(...args) }));
let current: ReturnType<typeof useTrainingCalendar>, node: ReactTestRenderer, client: QueryClient;
function Probe() { current = useTrainingCalendar(); return null; }
const view = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
beforeEach(async () => {
  mockUser = 'owner-a'; mockGet.mockReset(); mockGet.mockResolvedValue({ data: [event], error: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['calendar', mockUser], [event]);
  await act(async () => { node = TestRenderer.create(view()); });
});
afterEach(() => { act(() => node.unmount()); client.clear(); });
it('writes the confirmed server update to the shared calendar cache without duplicate IDs', () => {
  act(() => { current.upsert({ ...event, title: 'edited' }); });
  expect(client.getQueryData(['calendar', 'owner-a'])).toEqual([{ ...event, title: 'edited' }]);
});
it('retains a saved event on refresh failure instead of replacing it with an empty successful list', async () => {
  act(() => { current.upsert({ ...event, title: 'edited' }); });
  mockGet.mockResolvedValue({ data: null, error: new Error('offline') });
  await act(async () => { await current.refresh(); });
  expect(client.getQueryData(['calendar', 'owner-a'])).toEqual([{ ...event, title: 'edited' }]);
});
it('does not put the previous account’s events into the next account’s calendar', async () => {
  mockUser = 'owner-b'; mockGet.mockResolvedValue({ data: [], error: null });
  await act(async () => { node.update(view()); });
  await act(async () => { await current.refresh(); });
  expect(client.getQueryData(['calendar', 'owner-a'])).toEqual([event]);
  expect(client.getQueryData(['calendar', 'owner-b'])).toEqual([]);
});

it('does not present completed or cancelled future entries as the next appointment',()=>{
 const start_at=new Date(Date.now()+86400000).toISOString();
 expect(nextEvent([{...event,start_at,status:'completed'},{...event,id:'cancelled',start_at,status:'cancelled'}])).toBeNull();
 const open={...event,id:'open',start_at};expect(nextEvent([{...event,start_at,status:'completed'},open])?.id).toBe('open');
});
