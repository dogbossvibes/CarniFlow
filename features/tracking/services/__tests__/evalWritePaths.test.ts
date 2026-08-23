// Supabase-Mock: pro Tabelle konfigurierbare Antwort; Builder ist thenable + bietet
// order/maybeSingle/single/select/eq/insert/update/upsert.
type Resp = { data: unknown; error: unknown };
const mockResp: Record<string, Resp> = {};
const mockUpsertCalls: { payload: any; opts: any }[] = [];
function mockBuilder(table: string) {
  const r = (): Resp => mockResp[table] ?? { data: null, error: null };
  const b: Record<string, any> = {};
  b.select = () => b; b.eq = () => b; b.order = () => Promise.resolve(r());
  b.maybeSingle = () => Promise.resolve(r()); b.single = () => Promise.resolve(r());
  b.update = () => b; b.insert = () => b;
  b.upsert = (payload: any, opts: any) => { mockUpsertCalls.push({ payload, opts }); return { select: () => ({ single: async () => r() }) }; };
  (b as any).then = (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(r()).then(res, rej);
  return b;
}
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockBuilder(t) } }));
jest.mock('@/services/mediaService', () => ({ uploadImage: jest.fn(), uploadVideo: jest.fn(), uploadAudio: jest.fn() }));

import { getTrackSessionById } from '@/features/tracking/services/trackService';
import { createRemoteTrainingSession } from '@/features/sync/services/remoteTrainingSyncService';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

function set(map: Record<string, Resp>) { for (const k of Object.keys(mockResp)) delete mockResp[k]; Object.assign(mockResp, map); }
function localTrack(over: Partial<LocalTrainingSession> & { score?: number | null; payload?: Record<string, unknown> }): LocalTrainingSession {
  const { payload, ...rest } = over;
  return {
    local_id: 'sess-1', remote_id: null, user_id: 'u1', dog_id: 'd1', category: 'IGP', type: 'track',
    status: 'completed', title: 'Fährte', notes: null, score: null, visibility: null,
    started_at: '2026-08-23T10:00:00.000Z', ended_at: null, created_at: '2026-08-23T10:00:00.000Z',
    duration_seconds: 600, location_name: null, latitude: null, longitude: null, temperature: null,
    weather_condition: null, wind_speed: null, humidity: null, surface_types: null, terrain_conditions: null,
    sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null,
    dirty_fields: null, deleted_at: null, payload_json: payload ? JSON.stringify(payload) : null, ...rest,
  } as unknown as LocalTrainingSession;
}

let errSpy: jest.SpyInstance;
beforeEach(() => { mockUpsertCalls.length = 0; errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => errSpy.mockRestore());

describe('getTrackSessionById — local-first (B4, kein PGRST116-LogBox)', () => {
  it('0 remote rows → {data:null, error:null}, KEIN console.error', async () => {
    set({ training_sessions: { data: null, error: null } });
    const res = await getTrackSessionById('local-x');
    expect(res).toEqual({ data: null, error: null });
    expect(errSpy).not.toHaveBeenCalled();
  });
  it('PGRST116-Code → still not-found, kein console.error', async () => {
    set({ training_sessions: { data: null, error: { code: 'PGRST116', message: '0 rows' } } });
    const res = await getTrackSessionById('local-x');
    expect(res.data).toBeNull(); expect(res.error).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });
  it('echter Fehler (RLS/Netz) → error + console.error', async () => {
    set({ training_sessions: { data: null, error: { code: '42501', message: 'permission denied' } } });
    const res = await getTrackSessionById('s1');
    expect(res.error).toBe('permission denied'); expect(errSpy).toHaveBeenCalled();
  });
  it('synced Track → Remote-Daten inkl. points/markers', async () => {
    set({
      training_sessions: { data: { id: 's1', track_data: { legs: [], score: 90 } }, error: null },
      track_points: { data: [{ id: 'p1' }], error: null },
      track_markers: { data: [{ id: 'm1' }], error: null },
    });
    const res = await getTrackSessionById('s1');
    expect(res.data.id).toBe('s1'); expect(res.data.points).toHaveLength(1);
  });
});

describe('createRemoteTrainingSession — Fährten-Score nie in rating (B1/B3 Fälle 9/11/12)', () => {
  for (const score of [83, 100, 95]) {
    it(`Score ${score} → rating null, track_data.score=${score}`, async () => {
      set({ training_sessions: { data: { id: 'sess-1' }, error: null } });
      const res = await createRemoteTrainingSession(localTrack({ score, payload: { score, legs: [{ name: 'A', score: 8, max: 10 }], evaluated_at: '2026-08-23T11:00:00Z' } }));
      expect(res.error).toBeNull();
      const p = mockUpsertCalls[0].payload;
      expect(p.rating).toBeNull();                 // NIE 0–100 in rating
      expect(p.track_data.score).toBe(score);      // Score in track_data
      expect(p.track_data.legs).toHaveLength(1);
    });
  }
  it('gültiges 1–5-Rating (score=4) → durchgereicht', async () => {
    set({ training_sessions: { data: { id: 'sess-1' }, error: null } });
    await createRemoteTrainingSession(localTrack({ score: 4 }));
    expect(mockUpsertCalls[0].payload.rating).toBe(4);
  });
  it('Retry: idempotenter Upsert onConflict id (Fall 9 — gleiche Eval-Daten, kein Duplikat)', async () => {
    set({ training_sessions: { data: { id: 'sess-1' }, error: null } });
    await createRemoteTrainingSession(localTrack({ score: 95, payload: { score: 95, legs: [{ name: 'A', score: 9, max: 10 }] } }));
    await createRemoteTrainingSession(localTrack({ score: 95, payload: { score: 95, legs: [{ name: 'A', score: 9, max: 10 }] } }));
    expect(mockUpsertCalls[0].payload.id).toBe('sess-1');
    expect(mockUpsertCalls[0].opts).toEqual({ onConflict: 'id' });
    expect(mockUpsertCalls[1].payload.track_data.score).toBe(mockUpsertCalls[0].payload.track_data.score);
  });
  it('Sync-Fehler bleibt sichtbar (kein Verschlucken)', async () => {
    set({ training_sessions: { data: null, error: { code: '23514', message: 'violates check constraint' } } });
    const res = await createRemoteTrainingSession(localTrack({ score: 95, payload: { score: 95 } }));
    expect(res.error).toContain('check constraint'); expect(errSpy).toHaveBeenCalled();
  });
});
