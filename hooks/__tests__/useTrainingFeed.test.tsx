import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrainingFeed } from '../useTrainingFeed';

const mockUnits = jest.fn();
const mockSessions = jest.fn();
const mockTracks = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('@/services/trainingUnitService', () => ({ getTrainingUnits: (...args: unknown[]) => mockUnits(...args) }));
jest.mock('@/services/training', () => ({ getTrainingSessions: (...args: unknown[]) => mockSessions(...args) }));
jest.mock('@/features/tracking/services/trackService', () => ({ getUserTrackSessions: (...args: unknown[]) => mockTracks(...args) }));

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, owner_id: 'owner', dog_id: 'dog', session_date: '2026-10-19', created_at: '2026-10-19T10:00:00Z',
  status: 'completed', ...extra,
});
const protection = row('unit', { exercises: [{ discipline: 'Schutzdienst', exercise_name: 'Bewachen' }] });
const track = row('gps', { type: 'track' });
const result = (data: unknown[]) => ({ data, error: null });
let latest: ReturnType<typeof useTrainingFeed>;
function Probe() { latest = useTrainingFeed(); return null; }
let client: QueryClient;
let renderer: ReactTestRenderer;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } } });
  await act(async () => { renderer = TestRenderer.create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
  await settle();
}
beforeEach(() => {
  mockUnits.mockReset().mockResolvedValue(result([]));
  mockSessions.mockReset().mockResolvedValue(result([track]));
  mockTracks.mockReset().mockResolvedValue(result([track]));
});
afterEach(() => { act(() => renderer?.unmount()); client?.clear(); });

it('lädt Schutzdienst aus beiden historischen Quellen und GPS genau einmal; aktive GPS bleiben ausgeschlossen', async () => {
  mockUnits.mockResolvedValue(result([protection]));
  mockSessions.mockResolvedValue(result([track, row('legacy', { type: null, category: 'Schutzdienst', title: 'Bewachen' })]));
  mockTracks.mockResolvedValue(result([track, row('active', { type: 'track', status: 'active' })]));
  await mount();
  expect(latest.feed.map(item => `${item.source}:${item.id}`).sort()).toEqual(['session:legacy', 'track:gps', 'unit:unit']);
  expect(mockUnits).toHaveBeenCalledWith('owner', undefined);
  expect(mockSessions).toHaveBeenCalledWith('owner', undefined);
  expect(mockTracks).toHaveBeenCalledWith('owner');
});

it('ersetzt nach Refresh einen noch frischen GPS-Cache durch den vollständigen Feed und erhält ihn bei Offlinefehler', async () => {
  await mount();
  expect(latest.feed.map(item => item.id)).toEqual(['gps']);
  mockUnits.mockResolvedValue(result([protection]));
  await act(async () => { await latest.refresh({ cancelRefetch: false }); }); await settle();
  expect(latest.feed.map(item => item.id).sort()).toEqual(['gps', 'unit']);
  mockUnits.mockResolvedValue({ data: null, error: new Error('offline') });
  await act(async () => { await latest.refresh({ cancelRefetch: false }); }); await settle();
  expect(latest.feed.map(item => item.id).sort()).toEqual(['gps', 'unit']);
  expect(latest.error).toEqual(new Error('offline'));
});

it.each(['units', 'sessions', 'tracks'] as const)('behandelt %s-Fehler nicht als leere erfolgreiche Historie', async source => {
  ({ units: mockUnits, sessions: mockSessions, tracks: mockTracks })[source].mockResolvedValue({ data: null, error: new Error(source) });
  await mount();
  expect(latest.error).toEqual(new Error(source));
  expect(client.getQueryState(['trainingFeed', 'owner', null])?.status).toBe('error');
});
