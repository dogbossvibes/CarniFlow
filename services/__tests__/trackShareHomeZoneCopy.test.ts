import { getSharedTrack, isShareCopyUnsupported, listSharedTracksForTrainer, revokeTrackShare, shareTrack, updateTrackShareCopy } from '../trackShareService';

// Heimzone bei Trainer-Freigaben (#121): Dienst liest und schreibt die gekürzte Kopie.
type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };
const mockCalls: Call[] = [];
let mockRows: Record<string, unknown>[] = [];
let mockError: { code: string; message: string } | null = null;
jest.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    mockCalls.push(call);
    const done = () => ({ data: mockError ? null : mockRows, error: mockError });
    const api: Record<string, unknown> = {
      select: () => api, order: () => api,
      insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return api; },
      update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return api; },
      eq: (...args: unknown[]) => { call.filters.push(['eq', ...args]); return api; },
      is: (...args: unknown[]) => { call.filters.push(['is', ...args]); return api; },
      single: async () => ({ data: mockError ? null : mockRows[0] ?? null, error: mockError }),
      maybeSingle: async () => ({ data: mockError ? null : mockRows[0] ?? null, error: mockError }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(done()).then(resolve, reject),
    };
    return api;
  };
  return { supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: (table: string) => builder(table),
    rpc: async () => ({ data: [{ dog_name: 'Hund', owner_name: 'Besitzerin' }], error: null }),
  } };
});
jest.mock('@/services/connectionService', () => ({ listConnections: jest.fn(async () => []) }));

const copy = { copy: { points: [], homeZoneApplied: true, distance_meters: 480 }, digest: 'a'.repeat(64) };
beforeEach(() => { mockCalls.length = 0; mockRows = []; mockError = null; });

it('speichert die Kopie mit der Freigabe und nur, wenn eine übergeben wird', async () => {
  mockRows = [{ id: 's1' }];
  await shareTrack('t', 'trainer', copy);
  expect(mockCalls[0].payload).toEqual({ track_id: 't', owner_user_id: 'me', trainer_user_id: 'trainer', shared_copy: copy.copy, shared_copy_digest: copy.digest });
  await shareTrack('t', 'trainer');
  expect(mockCalls[1].payload).toEqual({ track_id: 't', owner_user_id: 'me', trainer_user_id: 'trainer' });
});

it('erkennt einen Server ohne die Kopie-Spalten', () => {
  expect(isShareCopyUnsupported({ code: 'PGRST204', message: "Could not find the 'shared_copy' column" })).toBe(true);
  expect(isShareCopyUnsupported({ code: '42703', message: 'column "shared_copy_digest" does not exist' })).toBe(true);
  expect(isShareCopyUnsupported({ code: '42501', message: 'row-level security' })).toBe(false);
  expect(isShareCopyUnsupported(null)).toBe(false);
});

it('Trainer:in erhält die Kopie statt der Originalzeile', async () => {
  mockRows = [{ id: 's1', track_id: 't', track: null, shared_copy: copy.copy }];
  const { data } = await getSharedTrack('t');
  expect(data).toMatchObject({ hasSharedCopy: true, track: { id: 't', homeZoneApplied: true, distance_meters: 480, dog: { name: 'Hund' }, owner_name: 'Besitzerin' } });
  const list = await listSharedTracksForTrainer();
  expect(list.data[0].track).toMatchObject({ id: 't', homeZoneApplied: true, dog: { name: 'Hund' } });
});

it('Freigaben ohne Kopie verhalten sich wie bisher', async () => {
  mockRows = [{ id: 's1', track_id: 't', track: { id: 't', distance_meters: 500 }, shared_copy: null }];
  const { data } = await getSharedTrack('t');
  expect(data).toMatchObject({ hasSharedCopy: false, track: { id: 't', distance_meters: 500 } });
});

it('ändert die Kopie nur an aktiven Freigaben und entfernt sie beim Beenden', async () => {
  await updateTrackShareCopy('s1', null);
  expect(mockCalls[0]).toMatchObject({ op: 'update', payload: { shared_copy: null, shared_copy_digest: null }, filters: [['eq', 'id', 's1'], ['is', 'revoked_at', null]] });
  mockCalls.length = 0;
  await revokeTrackShare('s1');
  expect(mockCalls[0].payload).toEqual({ revoked_at: expect.any(String) });
  expect(mockCalls[1].payload).toEqual({ shared_copy: null, shared_copy_digest: null });
});

it('beendet die Freigabe auch, wenn das Entfernen der Kopie nicht möglich ist', async () => {
  const result = await revokeTrackShare('s1');
  expect(result.error).toBeNull();
});
