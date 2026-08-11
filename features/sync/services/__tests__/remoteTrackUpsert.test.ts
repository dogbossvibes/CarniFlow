// Supabase-Builder mocken (mock-präfixiert wg. jest-Hoisting): Upsert-Payload +
// Delete-Filter inspizieren, ohne echtes Netz.
const mockSingle = jest.fn(async () => ({ data: { id: 'uuid-1' }, error: null }));
const mockSelect = jest.fn((_cols?: string) => ({ single: mockSingle }));
const mockUpsert = jest.fn((_row?: any, _opts?: any) => ({ select: mockSelect }));

const mockDeleteEqCalls: [string, unknown][] = [];
function makeDeleteQuery() {
  const q: any = {};
  q.eq = jest.fn((col: string, val: unknown) => { mockDeleteEqCalls.push([col, val]); return q; });
  q.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null });   // thenable → await
  return q;
}
const mockDelete = jest.fn(() => makeDeleteQuery());
const mockInsert = jest.fn(async () => ({ error: null }));

const mockFromCalls: string[] = [];
const mockFrom = jest.fn((table: string) => {
  mockFromCalls.push(table);
  return { upsert: mockUpsert, delete: mockDelete, insert: () => mockInsert() };
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import {
  createRemoteTrainingSession, deleteRemoteLayTrackPoints, deleteRemoteTrackMarkers,
} from '@/features/sync/services/remoteTrainingSyncService';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

const localBase: LocalTrainingSession = {
  local_id: 'uuid-1', remote_id: null, user_id: 'owner-1', dog_id: 'dog-1', category: 'IGP',
  type: 'track', status: 'completed', title: 'Fährte', notes: null, score: null, visibility: null,
  started_at: '2026-08-11T10:00:00.000Z', ended_at: '2026-08-11T10:20:00.000Z', duration_seconds: 1200,
  location_name: null, latitude: 47.1, longitude: 8.2, temperature: 12.3, weather_condition: 'bewölkt',
  wind_speed: 4, humidity: 80, surface_types: '["Wiese"]', terrain_conditions: '["Nass"]',
  created_at: '2026-08-11T10:00:00.000Z', updated_at: '2026-08-11T10:20:00.000Z', deleted_at: null,
  sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null,
  dirty_fields: null,
  payload_json: JSON.stringify({ distanceMeters: 250, articlesTotal: 2, cornersTotal: 3, gpsQualityAverage: 4.5, segments: [{ id: 's1' }] }),
};

beforeEach(() => {
  mockFrom.mockClear(); mockUpsert.mockClear(); mockDelete.mockClear();
  mockFromCalls.length = 0; mockDeleteEqCalls.length = 0;
});

describe('createRemoteTrainingSession — idempotenter Upsert (id=clientUuid, onConflict:id)', () => {
  it('upsertet auf training_sessions mit id + onConflict', async () => {
    const res = await createRemoteTrainingSession(localBase);
    expect(res.error).toBeNull();
    expect(mockFromCalls[0]).toBe('training_sessions');
    const [row, opts] = mockUpsert.mock.calls[0];
    expect(row.id).toBe('uuid-1');            // clientseitige UUID = training_sessions.id
    expect(opts).toEqual({ onConflict: 'id' });
  });

  it('setzt alle NOT-NULL-Pflichtfelder', async () => {
    await createRemoteTrainingSession(localBase);
    const [row] = mockUpsert.mock.calls[0];
    expect(row.owner_id).toBe('owner-1');
    expect(row.dog_id).toBe('dog-1');
    expect(row.category).toBe('IGP');
    expect(row.training_type).toBe('privat');
    expect(row.session_date).toBe('2026-08-11');   // aus started_at
  });

  it('mappt Summary aus payload_json (distance/articles/corners/gps/segments)', async () => {
    await createRemoteTrainingSession(localBase);
    const [row] = mockUpsert.mock.calls[0];
    expect(row.distance_meters).toBe(250);
    expect(row.articles_total).toBe(2);
    expect(row.corners_total).toBe(3);
    expect(row.gps_quality_average).toBe(4.5);
    expect(row.track_data).toEqual({ segments: [{ id: 's1' }] });
  });
});

describe('Replace-by-session Deletes — owner-scoped, idempotent', () => {
  it('deleteRemoteLayTrackPoints filtert session_id + point_type=lay', async () => {
    const res = await deleteRemoteLayTrackPoints('uuid-1');
    expect(res.error).toBeNull();
    expect(mockFromCalls[0]).toBe('track_points');
    expect(mockDeleteEqCalls).toContainEqual(['session_id', 'uuid-1']);
    expect(mockDeleteEqCalls).toContainEqual(['point_type', 'lay']);
  });

  it('deleteRemoteTrackMarkers filtert session_id', async () => {
    const res = await deleteRemoteTrackMarkers('uuid-1');
    expect(res.error).toBeNull();
    expect(mockFromCalls[0]).toBe('track_markers');
    expect(mockDeleteEqCalls).toContainEqual(['session_id', 'uuid-1']);
  });
});
