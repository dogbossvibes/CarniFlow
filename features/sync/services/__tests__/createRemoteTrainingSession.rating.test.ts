// Supabase-Upsert mocken (lazy, mock-präfixiert wg. jest-Hoisting).
const mockUpsertResult = { data: { id: 'sess-1' }, error: null as unknown };
const mockUpsert = jest.fn((_payload?: Record<string, any>, _opts?: Record<string, any>) => ({ select: () => ({ single: async () => mockUpsertResult }) }));
const mockFrom = jest.fn((_t?: string) => ({ upsert: mockUpsert }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t?: string) => mockFrom(t) } }));
// mediaService zieht native Deps → für diesen Test neutralisieren.
jest.mock('@/services/mediaService', () => ({ uploadImage: jest.fn(), uploadVideo: jest.fn(), uploadAudio: jest.fn() }));

import { createRemoteTrainingSession } from '@/features/sync/services/remoteTrainingSyncService';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

function localTrack(over: Partial<LocalTrainingSession> & { score?: number | null; payload?: Record<string, unknown> }): LocalTrainingSession {
  const { payload, ...rest } = over;
  return {
    local_id: 'sess-1', remote_id: null, user_id: 'u1', dog_id: 'd1',
    category: 'IGP', type: 'track', status: 'completed', title: 'Fährte', notes: null,
    score: null, visibility: null, started_at: '2026-08-22T10:00:00.000Z', ended_at: null,
    created_at: '2026-08-22T10:00:00.000Z', duration_seconds: 600,
    location_name: null, latitude: null, longitude: null, temperature: null,
    weather_condition: null, wind_speed: null, humidity: null,
    surface_types: null, terrain_conditions: null,
    sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null,
    dirty_fields: null, deleted_at: null,
    payload_json: payload ? JSON.stringify(payload) : null,
    ...rest,
  } as unknown as LocalTrainingSession;
}
const lastPayload = () => mockUpsert.mock.calls[mockUpsert.mock.calls.length - 1][0] as Record<string, any>;
const lastOpts = () => mockUpsert.mock.calls[mockUpsert.mock.calls.length - 1][1] as Record<string, any>;

beforeEach(() => { mockUpsert.mockClear(); mockFrom.mockClear(); mockUpsertResult.error = null; });

describe('createRemoteTrainingSession — rating_check (23514) behoben', () => {
  it('neue Fährte OHNE Bewertung → rating null, kein track_data.score, Erfolg', async () => {
    const res = await createRemoteTrainingSession(localTrack({ score: null, payload: { distanceMeters: 280 } }));
    expect(res.error).toBeNull();
    expect(lastPayload().rating).toBeNull();
    expect(lastPayload().track_data).toBeUndefined();   // kein score/legs/segments → kein track_data
  });

  for (const score of [100, 95, 83]) {
    it(`Fährte Score ${score}% → rating null, track_data.score=${score} (kein 23514)`, async () => {
      const res = await createRemoteTrainingSession(localTrack({
        score, payload: { score, legs: [{ name: 'Schenkel 1', score: 8, max: 10 }], evaluated_at: '2026-08-22T11:00:00.000Z' },
      }));
      expect(res.error).toBeNull();
      expect(lastPayload().rating).toBeNull();
      expect(lastPayload().track_data.score).toBe(score);
    });
  }

  it('Legs vorhanden → in track_data erhalten', async () => {
    const legs = [{ name: 'Schenkel 1', score: 8, max: 10 }, { name: 'Schenkel 2', score: 7, max: 10 }];
    await createRemoteTrainingSession(localTrack({ score: 90, payload: { score: 90, legs } }));
    expect(lastPayload().track_data.legs).toEqual(legs);
  });

  it('gültiges 1–5-Rating (score=4) → wird als rating durchgereicht', async () => {
    await createRemoteTrainingSession(localTrack({ score: 4 }));
    expect(lastPayload().rating).toBe(4);
  });

  it('idempotenter Retry: upsert onConflict "id" (keine Duplikat-Session)', async () => {
    await createRemoteTrainingSession(localTrack({ score: 95, payload: { score: 95 } }));
    expect(lastPayload().id).toBe('sess-1');           // client-UUID == training_sessions.id
    expect(lastOpts()).toEqual({ onConflict: 'id' });
  });

  it('echter DB-Fehler bleibt sichtbar (kein Verschlucken)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsertResult.error = { code: '23514', message: 'violates check constraint' };
    const res = await createRemoteTrainingSession(localTrack({ score: 95, payload: { score: 95 } }));
    expect(res.data).toBeNull();
    expect(res.error).toContain('check constraint');
    expect(errSpy).toHaveBeenCalled();   // echter Constraint-Fehler wird weiterhin geloggt
    errSpy.mockRestore();
  });
});
