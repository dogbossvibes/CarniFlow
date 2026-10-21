// Supabase-Builder mocken (lazy referenziert wg. jest-Hoisting/TDZ).
// Pro Tabelle konfigurierbare Antwort; der Builder ist thenable (für Aufrufe, die
// direkt nach .eq() awaited werden) und bietet order()/maybeSingle()/single().
type Resp = { data: unknown; error: unknown };
const mockResp: Record<string, Resp> = {};
const mockTables: string[] = [];
const mockOrders: { table: string; column: string }[] = [];
function mockBuilder(table: string) {
  mockTables.push(table);
  const r = (): Resp => mockResp[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = (column: string) => { mockOrders.push({ table, column }); return b; };
  b.maybeSingle = () => Promise.resolve(r());
  b.single = () => Promise.resolve(r());
  (b as { then: unknown }).then = (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(r()).then(res, rej);
  return b;
}
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockBuilder(t) } }));

import { getTrackSessionById, getTrackCompletionById } from '@/features/tracking/services/trackService';

function setResponses(map: Record<string, Resp>) {
  for (const k of Object.keys(mockResp)) delete mockResp[k];
  mockOrders.length = 0; mockTables.length = 0;
  Object.assign(mockResp, map);
}

let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe('getTrackSessionById — local-first tolerant (T-59)', () => {
  it('local-only (Remote 0 rows via maybeSingle) → { data:null, error:null }, KEIN console.error', async () => {
    setResponses({ training_sessions: { data: null, error: null } });
    const res = await getTrackSessionById('local-123');
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();   // LogBox/PGRST116 darf NICHT eskalieren
  });

  it('synced Track → Remote-Daten inkl. points/markers/runs/engine', async () => {
    setResponses({
      training_sessions: { data: { id: 's1', distance_meters: 280, dog: { name: 'Rex' } }, error: null },
      track_points: { data: [{ id: 'p1' }], error: null },
      track_markers: { data: [{ id: 'm1' }], error: null },
      track_runs: { data: [{ id: 'r1' }], error: null },
      track_engine_sessions: { data: { session_id: 's1' }, error: null },
    });
    const res = await getTrackSessionById('s1');
    expect(res.error).toBeNull();
    expect(res.data.id).toBe('s1');
    expect(res.data.distance_meters).toBe(280);
    expect(res.data.points).toHaveLength(1);
    expect(res.data.markers).toHaveLength(1);
    expect(res.data.runs).toHaveLength(1);
    expect(res.data.engine).toEqual({ session_id: 's1' });
    expect(mockOrders.filter(order => order.table === 'track_markers')).toEqual([
      { table: 'track_markers', column: 'created_at' },
      { table: 'track_markers', column: 'distance_from_start' },
    ]);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('vorhandene Remote-Zeile hat Priorität (data != null → Caller nutzt Remote, kein Local-Fallback)', async () => {
    setResponses({ training_sessions: { data: { id: 's2' }, error: null } });
    const res = await getTrackSessionById('s2');
    expect(res.data).not.toBeNull();
    expect(res.data.id).toBe('s2');
  });

  it('weder Remote noch (später) lokal → Service liefert null → Screen zeigt Not-found', async () => {
    setResponses({ training_sessions: { data: null, error: null } });
    const res = await getTrackSessionById('ghost');
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it('echter Supabase-Fehler (RLS/Netzwerk/Auth) → fail(): error gesetzt + console.error', async () => {
    setResponses({ training_sessions: { data: null, error: { code: '42501', message: 'permission denied' } } });
    const res = await getTrackSessionById('s3');
    expect(res.data).toBeNull();
    expect(res.error).toBe('permission denied');
    expect(errSpy).toHaveBeenCalled();
  });

  it('defensiv: PGRST116-Code wird als Not-found behandelt (kein console.error)', async () => {
    setResponses({ training_sessions: { data: null, error: { code: 'PGRST116', message: '0 rows' } } });
    const res = await getTrackSessionById('s4');
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
  });
});


describe('critical detail children cannot silently become empty recordings', () => {
  it.each(['track_points', 'track_markers', 'track_runs'])('%s failure returns an error for the local detail fallback', async table => {
    setResponses({
      training_sessions: { data: { id: 'own-track', owner_id: 'owner' }, error: null },
      track_points: { data: [{ id: 'p' }], error: null },
      track_markers: { data: [{ id: 'm' }], error: null },
      track_runs: { data: [{ id: 'r' }], error: null },
      [table]: { data: null, error: { code: '57014', message: 'statement timeout' } },
    });
    const result = await getTrackSessionById('own-track');
    expect(result).toEqual({ data: null, error: 'statement timeout' });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
  it('optional legacy engine data can still be unavailable without hiding a complete track', async () => {
    setResponses({
      training_sessions: { data: { id: 'own-track' }, error: null },
      track_points: { data: [{ id: 'p' }], error: null },
      track_markers: { data: [], error: null }, track_runs: { data: [], error: null },
      track_engine_sessions: { data: null, error: { message: 'legacy table unavailable' } },
    });
    const result = await getTrackSessionById('own-track');
    expect(result.error).toBeNull(); expect(result.data.points).toHaveLength(1);
    expect(result.data.engine).toBeNull(); expect(errSpy).not.toHaveBeenCalled();
  });
});


describe('completion reads remain independent from GPS and markers', () => {
  it.each(['track_points', 'track_markers'])('a completed run remains visible despite %s being unavailable', async table => {
    setResponses({ training_sessions: { data: { id: 's', owner_id: 'u', dog_id: 'd' }, error: null },
      track_runs: { data: [{ ended_at: '2026-10-21' }], error: null },
      [table]: { data: null, error: { message: 'statement timeout' } },
    });
    const result = await getTrackCompletionById('s');
    expect(result.error).toBeNull(); expect(result.data?.runs[0].ended_at).toBe('2026-10-21');
    expect(mockTables).toEqual(['training_sessions', 'track_runs']);
  });
  it('run read failure remains unknown rather than verified no final run', async () => {
    setResponses({ training_sessions: { data: { id: 's' }, error: null },
      track_runs: { data: null, error: { message: 'offline' } } });
    expect(await getTrackCompletionById('s')).toEqual({ data: null, error: 'offline' });
  });
  it('verified missing remote session remains distinct from a query error', async () => {
    setResponses({ training_sessions: { data: null, error: null } });
    expect(await getTrackCompletionById('s')).toEqual({ data: null, error: null });
  });
  it('a known open run remains available for local recovery', async () => {
    setResponses({ training_sessions: { data: { id: 's', owner_id: 'u', dog_id: 'd' }, error: null },
      track_runs: { data: [{ ended_at: null }], error: null } });
    expect((await getTrackCompletionById('s')).data?.runs).toEqual([{ ended_at: null }]);
  });
});
