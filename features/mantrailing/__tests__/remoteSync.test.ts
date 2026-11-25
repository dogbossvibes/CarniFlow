import { createRemoteTrainingSession } from '@/features/sync/services/remoteTrainingSyncService';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

// Server-Abgleich: track_data.mantrail nur bei type = 'mantrail'; IGP unverändert.
const mockUpsert = jest.fn((_p?: Record<string, any>, _o?: Record<string, any>) => ({ select: () => ({ single: async () => ({ data: { id: 's' }, error: null }) }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: mockUpsert }) } }));
jest.mock('@/services/mediaService', () => ({ uploadImage: jest.fn(), uploadVideo: jest.fn(), uploadAudio: jest.fn() }));

const local = (over: Partial<LocalTrainingSession>, payload: Record<string, unknown> | null): LocalTrainingSession => ({
  local_id: 's', remote_id: null, user_id: 'u', dog_id: 'd', category: 'IGP', type: 'track', status: 'completed', title: 'Fährte',
  notes: null, score: null, visibility: null, started_at: '2027-03-01T10:00:00.000Z', ended_at: null, created_at: '2027-03-01T10:00:00.000Z',
  duration_seconds: 600, location_name: null, latitude: null, longitude: null, temperature: null, weather_condition: null,
  wind_speed: null, humidity: null, surface_types: null, terrain_conditions: null, updated_at: 'x', deleted_at: null,
  sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null, dirty_fields: null,
  payload_json: payload ? JSON.stringify(payload) : null, ...over,
} as LocalTrainingSession);
const last = () => mockUpsert.mock.calls[mockUpsert.mock.calls.length - 1][0] as Record<string, any>;
const mantrail = { version: 1, result: 'found', scentArticle: 'sock' };

beforeEach(() => mockUpsert.mockClear());

it('Mantrail: type, category und track_data.mantrail gehen zum Server', async () => {
  await createRemoteTrainingSession(local({ type: 'mantrail', category: 'Mantrailing', title: 'Mantrailing' }, { mantrail, distanceMeters: 900 }));
  expect(last()).toMatchObject({ type: 'mantrail', category: 'Mantrailing', title: 'Mantrailing', distance_meters: 900 });
  expect(last().track_data).toEqual({ mantrail });
});

it('IGP-Fährte: ein zufälliger mantrail-Schlüssel wird NICHT übernommen', async () => {
  await createRemoteTrainingSession(local({}, { mantrail, distanceMeters: 300 }));
  expect(last().type).toBe('track');
  expect(last().track_data).toBeUndefined();
});

it('IGP-Fährte mit Auswertung: track_data unverändert wie bisher', async () => {
  await createRemoteTrainingSession(local({}, { score: 90, legs: [], evaluated_at: 'z' }));
  expect(last().track_data).toEqual({ score: 90, legs: [], evaluated_at: 'z' });
});
